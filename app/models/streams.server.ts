
import { prisma } from "~/db.server";
import type { users, streams, tweets } from "@prisma/client";
import { TwitterApi, TwitterV2IncludesHelper } from 'twitter-api-v2';
import { log } from '~/log.server';
import { userInfo } from "os";
import { createUser } from "~/models/user.server";
import invariant from "tiny-invariant";
import { flattenTwitterData } from "~/twitter.server";

// const api = new TwitterApi(process.env.TWITTER_TOKEN as string);

export async function getUserFromTwitter(api: any, username: string) {
    const { data: user } = await api.v2.userByUsername(
        username,
        {
            "tweet.fields": "attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld",
            "user.fields": "created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld",
        }
    );
    if (user) {
        return flattenTwitterData([user])[0];
    }

}

export async function getStreams() {
    return prisma.streams.findMany({
        include: {
            seedUsers: true
        }
    });
}

export function getStream({
    id,
}: Pick<Stream, "id">) {
    return prisma.streams.findFirst({
        where: { id },
        include: {
            seedUsers: true
        }
    });
}

export function getStreamByName({
    name,
}: Pick<Stream, "name">) {
    return prisma.streams.findUnique({
        where: { name: name },
        include: {
            seedUsers: true
        }
    });
}

export async function getPosts() {
    return prisma.post.findMany();
}

export function createStream({
    name,
    startTime,
    endTime,
}: Pick<streams, "name" | "startTime" | "endTime">) {

    return prisma.streams.create({
        data: {
            name,
            startTime,
            endTime
        },
    });
}


export function deleteStreamByName({
    name,
}: Pick<Stream, "name">) {
    return prisma.streams.delete({
        where: { name: name },
    });
}

export async function removeSeedUserFromStream(
    stream: streams,
    user: users
) {
    let streamUploaded = await prisma.streams.update({
        where: { id: stream.id },
        data: {
            seedUsers: {
                disconnect: [{ id: user.id }]
            }
        },
    });
    return streamUploaded;
}

async function getTweetsFromAuthorId(
    api: any,
    id: string,
    startTime: string,
    endTime: string,
) {
    const tweets = await api.v2.userTimeline(
        id,
        {
            'expansions': 'author_id,in_reply_to_user_id,referenced_tweets.id,referenced_tweets.id.author_id,entities.mentions.username,attachments.poll_ids,attachments.media_keys,geo.place_id',
            'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
            'user.fields': 'created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld',
            'media.fields': 'alt_text,duration_ms,height,media_key,preview_image_url,type,url,width,public_metrics',
            'poll.fields': 'duration_minutes,end_datetime,id,options,voting_status',
            'place.fields': 'contained_within,country,country_code,full_name,geo,id,name,place_type',
            'max_results': 100,
            'end_time': endTime,
            'start_time': startTime
        }
    );
    while (!tweets.done) {
        console.log(tweets.data.data.length);
        await tweets.fetchNext();
    }
    return tweets;
}

async function upsertTweet(tweet: tweets) {
    let author_id = tweet.author_id;
    invariant(author_id, "author_id not found on tweet");
    // delete tweet.author;
    const createData = {
        ...tweet,
        // author: { this isn't necessary for this one for some reason... probably because 1-to-many
        //     connect: [{ id: author_id }]
        // }
    }
    return prisma.tweets.upsert({
        where: { id: tweet.id },
        create: createData,
        update: createData,
    })
};

export async function addSeedUserToStream(
    api: any,
    stream: streams,
    user: users
) {
    try {
        log.debug(`adding user '${user.username}' to stream '${stream.name}`)
        log.debug(`Fetching api.v2.following for ${user.username}...`);

        // Add new seedUsers relation to Stream
        let streamUploaded = await prisma.streams.update({
            where: { id: stream.id },
            data: {
                seedUsers: {
                    connect: [{ id: user.id }]
                }
            },
        }
        );

        // Check to see if follows have been saved for this seed user
        let followsOfUser = await prisma.follows.findMany({
            where: { followerId: user.id },
            include: {
                following: true,
            }
        });

        // If follows haven't been saved, save them 
        if (followsOfUser.length == user.public_metrics_following_count) {
            log.debug(`Looks like we have already saved the ${followsOfUser.length} users followed by '${user.username}'`)
        } else {
            console.log(`PULLING USERS FOLLOWED BY '${user.username}`);
            // Get accounts followed by seed user
            const following = await api.v2.following(
                user.id,
                {
                    'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
                    'user.fields': 'created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld',
                    'max_results': 1000,
                    "asPaginator": true
                }
            );

            while (!following.done) { await following.fetchNext(); }
            console.log(`fetched ${following.data.data.length} accounts followed by '${user.username}'`);

            console.log(following.data.data[0]);
            // Add all accounts to DB
            for (let newUser of following.data.data) {
                newUser = flattenTwitterData([newUser])[0];
                // let addedUser = await createUser(newUser);
                let addedUser = await prisma.users.upsert({
                    where: { id: newUser.id },
                    create: newUser,
                    update: newUser,
                })
                let follow = await prisma.follows.upsert({
                    where: {
                        followerId_followingId: {
                            followerId: user.id,
                            followingId: newUser.id
                        }
                    },
                    create: {
                        followerId: user.id,
                        followingId: newUser.id
                    },
                    update: {
                        followerId: user.id,
                        followingId: newUser.id
                    }
                });
            }
        }

        // Add the tweets from stream's date Range to the DB to build a feed
        console.log("HERE ARE MY DATE STRINGS");
        console.log(stream.startTime);
        console.log(stream.startTime.toString());
        console.log(stream.startTime.toISOString());
        let tweets = await getTweetsFromAuthorId(
            api,
            user.id,
            stream.startTime.toISOString(),
            stream.endTime.toISOString()
        );
        for (const tweet of tweets.data.data) {
            console.log(`adding tweet ${tweet.id}`)
            upsertTweet(tweet);
        }
        // for (const tweet of tweets.includes.tweets) {
        //     upsertTweet(tweet);
        // }
        // for (const user of tweets.includes.users) {
        //     let newUser = flattenTwitterData([user])[0];
        //     // let addedUser = await createUser(newUser);
        //     let addedUser = await prisma.users.upsert({
        //         where: { id: newUser.id },
        //         create: newUser,
        //         update: newUser,
        //     })
        //     let follow = await prisma.follows.upsert({
        //         where: {
        //             followerId_followingId: {
        //                 followerId: user.id,
        //                 followingId: newUser.id
        //             }
        //         },
        //         create: {
        //             followerId: user.id,
        //             followingId: newUser.id
        //         },
        //         update: {
        //             followerId: user.id,
        //             followingId: newUser.id
        //         }
        //     });
        // }
        return streamUploaded;
    } catch (e) {
        log.error(`Error fetching tweets: ${JSON.stringify(e, null, 2)}`);
        throw e;
    }
};

async function getTweetsFromUsername(id: string) {
    const tweets = await api.v2.userTimeline(
        id,
        {
            'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
            'user.fields': 'created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld',
            'max_results': 1000,
        }
    )
    while (!tweets.done) { await tweets.fetchNext(); }

    // const following = await api.v2.userTimeline(
    //     user.id,
    //     {
    //         'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
    //         'user.fields': 'created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld',
    //         'max_results': 1000,
    //         "asPaginator": true
    //     }
    // );
}

export async function getStreamTweets(stream: streams) {
    let authorIds: Object[] = [];
    stream.seedUsers.map((user: users) => (
        authorIds.push({ "author_id": user.id })
    ))

    return prisma.tweets.findMany({
        where: {
            OR: authorIds
        },
        include: {
            author: true
        }
    })
}

async function getTweetsFromUsernames(usernames: string[]) {
    const queries: string[] = [];
    usernames.forEach((username) => {
        const query = queries[queries.length - 1];
        if (query && `${query} OR from:${username}`.length < 512)
            queries[queries.length - 1] = `${query} OR from:${username}`;
        else queries.push(`from:${username}`);
    });
    const users: Record<string, UserV2> = {};
    const tweets: TweetV2[] = [];
    await Promise.all(
        queries.map(async (query) => {
            const res = await api.v2.search(query, {
                'max_results': 100,
                'tweet.fields': TWEET_FIELDS,
                'expansions': TWEET_EXPANSIONS,
                'user.fields': USER_FIELDS,
            });
            res.tweets.forEach((tweet) => tweets.push(tweet));
            const includes = new TwitterV2IncludesHelper(res);
            includes.users.forEach((user) => {
                users[user.id] = user;
            });
        })
    );
    return tweets.map((tweet) => ({
        ...tweet,
        html: html(tweet.text),
        author: users[tweet.author_id as string],
    }));
}

export function html(text: string): string {
    return autoLink(text, {
        usernameIncludeSymbol: true,
        linkAttributeBlock(entity, attrs) {
            /* eslint-disable no-param-reassign */
            attrs.target = '_blank';
            attrs.rel = 'noopener noreferrer';
            attrs.class = 'hover:underline text-blue-500';
            /* eslint-enable no-param-reassign */
        },
    });
}
