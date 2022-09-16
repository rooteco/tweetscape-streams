
import { TweetStream, TwitterApi, TwitterV2IncludesHelper, UserSearchV1Paginator } from 'twitter-api-v2';
import { TwitterApiRateLimitPlugin } from '@twitter-api-v2/plugin-rate-limit';

import { log } from '~/log.server';
import { driver } from "~/neo4j.server";
import { Record, Node } from 'neo4j-driver'
import { getListUsers, USER_FIELDS } from '~/twitter.server';
import { createUserDb } from "~/models/user.server";

import type {
    ListV2,
    ReferencedTweetV2,
    TTweetv2Expansion,
    TTweetv2TweetField,
    TTweetv2UserField,
    TweetEntityAnnotationsV2,
    TweetEntityHashtagV2,
    TweetEntityUrlV2,
    TweetSearchRecentV2Paginator,
    TweetV2,
    TweetV2ListTweetsPaginator,
    UserV2,
} from 'twitter-api-v2';

export function flattenTwitterUserPublicMetrics(data: Array<any>) {
    for (const obj of data) {
        // obj.username = obj.username.toLowerCase();
        obj["public_metrics.followers_count"] = obj.public_metrics.followers_count;
        obj["public_metrics.following_count"] = obj.public_metrics.following_count;
        obj["public_metrics.tweet_count"] = obj.public_metrics.tweet_count;
        obj["public_metrics.listed_count"] = obj.public_metrics.listed_count;
        delete obj.public_metrics;
        delete obj.entities;
    }
    return data;
}

export function flattenTweetPublicMetrics(data: Array<any>) {
    for (const obj of data) {
        // obj.username = obj.us / ername.toLowerCase();
        obj["public_metrics.retweet_count"] = obj.public_metrics.retweet_count;
        obj["public_metrics.reply_count"] = obj.public_metrics.reply_count;
        obj["public_metrics.like_count"] = obj.public_metrics.like_count;
        obj["public_metrics.quote_count"] = obj.public_metrics.quote_count;
        delete obj.public_metrics;
        // delete obj.entities;
    }
    return data;
}

export async function getUserFromTwitter(api: any, username: string) {
    const { data: user } = await api.v2.userByUsername(
        username,
        {
            "tweet.fields": "attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld",
            "user.fields": USER_FIELDS,
        }
    );
    if (user) {
        return flattenTwitterUserPublicMetrics([user])[0];
    }

}


export async function getTweet(tweetId: string) {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeRead((tx: any) => {
        return tx.run(`
        MATCH (t:Tweet {id: $tweetId})
        RETURN t`,
            { tweetId }
        )
    })
    let tweet;
    let relNodes;
    if (res.records.length > 0) {
        tweet = res.records[0].get("t")

        const relRes = await session.executeRead((tx: any) => {
            return tx.run(`
            MATCH (t:Tweet {id: $tweetId})-[r]-(n)
            RETURN r,n
            `,
                { tweetId }
            )
        })
        relNodes = relRes.records.map((row: any) => {
            return {
                "relationship": row.get("r").type,
                "node": row.get("n").properties
            }
        })

    }
    await session.close()
    return { tweet, relNodes }
}

export async function getStreams() {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeRead((tx: any) => {
        return tx.run(`
        MATCH (s:Stream )
        RETURN s`,
        )
    })
    const streams = res.records.map((row: Record) => {
        return row.get('s')
    })
    await session.close()
    return streams;
}

export async function getStreamByName(name: string) {
    const session = driver.session()
    // Create a node within a write transaction
    const streamRes = await session.executeRead((tx: any) => {
        return tx.run(`
        MATCH (s:Stream {name: $name} )
        RETURN s
        LIMIT 1;
        `,
            { name })
    })
    let stream = null;
    if (streamRes.records.length > 0) {
        stream = streamRes.records[0].get("s");
    }
    let seedUsers: any = [];
    if (stream) {
        let seedUsersRes = await session.executeRead((tx: any) => {
            return tx.run(`
            MATCH (s:Stream {name: $name} )-[r:CONTAINS]->(u:User)
            RETURN u,r`,
                { name })
        })
        if (seedUsersRes.records.length > 0) {
            seedUsers = seedUsersRes.records.map((row: Record) => {
                return { user: row.get('u'), rel: row.get('r') }
            })
        }
    }

    await session.close()
    return { stream: stream, seedUsers: seedUsers };
}

export async function createStream(name: string, startTime: string, username: string) {
    const session = driver.session()
    // Create a node within a write transaction
    let streamData = {
        name,
        startTime,
    }
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
            MATCH (u:User {username: $username}) 
            MERGE (s:Stream {name: $streamData.name})
            SET s = $streamData
            MERGE (u)-[:CREATED]->(s)
            RETURN s`,
            { streamData: streamData, username: username }
        )
    })
    // Get the `p` value from the first record
    const singleRecord = res.records[0]
    const node = singleRecord.get("s")
    await session.close()
    return node;
}

export async function deleteStreamByName(name: string) {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
        MATCH (s:Stream {name: $name} )
        DETACH DELETE s`,
            { name })
    })
}

export async function removeSeedUserFromStream(streamName: string, username: string) {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
        MATCH (s:Stream {name: $streamName} )-[rc:CONTAINS]->(u:User {username: $username})
        DELETE rc RETURN rc`,
            { streamName, username })
    })
    const singleRecord = res.records[0]
    const node = singleRecord.get("rc")
    await session.close()
    return node;

}

async function getTweetsFromAuthorId(
    api: TwitterApi,
    id: string,
    startTime: string,
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
            'start_time': startTime
        }
    );
    while (!tweets.done) {
        console.log(tweets.data.data.length);
        await tweets.fetchNext();
    }
    return tweets;
}

async function streamContainsUser(username: string, streamName: string) {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
        MATCH (u:User {username: $username}) 
        MATCH (s:Stream {name: $streamName})
        MERGE (s)-[r:CONTAINS]->(u)
        RETURN s,r,u`,
            { username, streamName }
        )
    })
    const singleRecord = res.records[0]
    const node = { s: singleRecord.get("s"), r: singleRecord.get("r"), u: singleRecord.get("u") }
    await session.close()
    return node;
}

async function getSavedFollows(username: string) {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
        MATCH (u:User {username: $username})-[:FOLLOWS]->(uf:User) RETURN uf`,
            { username }
        )
    })
    const users = res.records.map((row: Record) => {
        return row.get('uf')
    })
    await session.close()
    return users;
}

async function addUsersFollowedBy(username: string, users: any) {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
            UNWIND $users AS u
            MATCH (followerUser:User {username: $followerUsername})
            MERGE (followedUser:User {username: u.username})
            SET followedUser = u
            MERGE (followerUser)-[r:FOLLOWS]->(followedUser)
            RETURN followedUser
            `,
            { users: users, followerUsername: username }
        )
    })
    const followed = res.records.map((row: any) => {
        return row.get("followedUser")
    })
    await session.close()
    return followed;
}

async function addUsers(users: any) {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
            UNWIND $users AS u
            MERGE (user:User {username: u.username})
            SET user = u
            RETURN user
            `,
            { users: users }
        )
    })
    const followed = res.records.map((row: any) => {
        return row.get("user")
    })
    await session.close()
    return followed;
}

export async function addUserFollowedLists(user: UserV2, lists: ListV2[]) {
    const session = driver.session()
    // Create a node within a write transaction
    console.log("FOLLOWED LISTS");
    console.log(lists);
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
            UNWIND $lists AS l
            MERGE (list:List {name: l.name})
            SET list = l
            MERGE (u:User {username: $username})
            MERGE (u)-[:FOLLOWS]->(list)
            RETURN u,l
            `,
            { lists: lists, username: user.username }
        )
    })
    const followed = res.records.map((row: any) => {
        return row.get("l")
    })
    await session.close()
    return followed;
}

export async function addUserOwnedLists(user: UserV2, lists: ListV2[]) {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
            UNWIND $lists AS l
            MERGE (list:List {name: l.name})
            SET list = l
            MERGE (u:User {username: $username})
            MERGE (u)-[:OWNS]->(list)
            RETURN u,l
            `,
            { lists: lists, username: user.username }
        )
    })
    const followed = res.records.map((row: any) => {
        return row.get("l")
    })
    await session.close()
    return followed;
}

export async function getAllUserLists(username: string) {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeRead((tx: any) => {
        return tx.run(`
            MATCH (u {username:$username})-[]-(l:List) return l
            `,
            { username: username }
        )
    })
    const lists = res.records.map((row: any) => {
        return row.get("l")
    })
    await session.close()
    return lists;
}

export async function addTwitterListToStream(api: TwitterApi, stream: Node, listId: string) {
    const users = await getListUsers(api, listId)
    console.log("USERS ------")
    console.log(users);
    for (const user of users) {
        const userDb = await createUserDb(user)
        addSeedUserToStream(api, stream, userDb)
    }
}

export function flattenMediaPublicMetrics(data: Array<any>) {
    for (const obj of data) {
        // obj.username = obj.username.toLowerCase();
        if (obj.public_metrics) {
            obj["public_metrics.view_count"] = obj.public_metrics.view_count
        }
        delete obj.public_metrics;
    }
    return data;
}

async function addTweetMedia(media: any) {
    const session = driver.session()
    // Create a node within a write transaction
    let flatMedia = flattenMediaPublicMetrics(media);
    console.log("HERE IS THE MEDIA")
    console.log(media);
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
            UNWIND $media AS m
            MERGE (mediaNode:Media {media_key: m.media_key})
            SET mediaNode = m
            RETURN mediaNode
            `,
            { media: flatMedia }
        )
    })
    const followed = res.records.map((row: any) => {
        return row.get("mediaNode")
    })
    await session.close()
    return followed;
}

async function addTweetsFrom(tweets: any) {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
            UNWIND $tweets AS t
            MERGE (tweet:Tweet {id: t.id})
            SET tweet.id = t.id,
                tweet.conversation_id = t.conversation_id,
                tweet.possibly_sensitive = t.possibly_sensitive,
                tweet.in_reply_to_user_id = t.in_reply_to_user_id,
                tweet.lang = t.lang,
                tweet.text = t.text,
                tweet.created_at = t.created_at,
                tweet.reply_settings = t.reply_settings

            MERGE (user:User {id: t.author_id})

            MERGE (user)-[:POSTED]->(tweet)

            FOREACH (m IN t.entities.mentions |
                MERGE (mentioned:User {username:m.username})
                MERGE (tweet)-[:MENTIONED]->(mentioned)
            )
            FOREACH (u IN t.entities.urls |
                MERGE (url:Link {url:u.expanded_url})
                MERGE (tweet)-[:LINKED]->(url)
            )
            FOREACH (a IN t.entities.annotations |
                MERGE (annotation:Annotation {probability:a.probability, type:a.type, normalized_text:a.normalized_text})
                MERGE (tweet)-[:ANNOTATED]->(annotation)
            )
            FOREACH (h IN t.entities.hashtags |
                MERGE (hashtag:Hashtag {tag:h.tag})
                MERGE (tweet)-[:TAG]->(hashtag)
            )
            FOREACH (c IN t.entities.cashtags |
                MERGE (cashtag:Cashtag {tag:c.tag})
                MERGE (tweet)-[:TAG]->(cashtag)
            )
            FOREACH (a IN t.attachments |
                FOREACH (media_key in a.media_keys |
                    MERGE (media:Media {media_key:media_key})
                    MERGE (tweet)-[:ATTACHED]->(media)
                )
            )
            FOREACH (r IN t.referenced_tweets |
                MERGE (ref_t:Tweet {id:r.id})
                MERGE (tweet)-[:REFERENCED{type:r.type}]->(ref_t)
            )
            `,
            { tweets: tweets }
        )
    })
    await session.close()
};

export async function addSeedUserToStream(
    api: TwitterApi,
    stream: Node,
    user: any // has already been added to db before calling this func
) {
    try {
        log.debug(`adding user '${user.properties.username}' to stream '${stream.properties.name}`)
        // Add new seedUsers relation to Stream
        return await streamContainsUser(user.properties.username, stream.properties.name)
    } catch (e) {
        log.error(`Error fetching tweets: ${JSON.stringify(e, null, 2)}`);
        throw e;
    }
};

export async function updateStreamFollowsNetwork(api: TwitterApi, limits: TwitterApiRateLimitPlugin, stream: Node, seedUsers: Node[]) {

    let now = new Date()
    let startTime;
    if (stream.properties.followingLastUpdatedAt) { // this means we already did an intial pull, so we only need to pull from last time updated
        startTime = stream.properties.followingLastUpdatedAt
    } else { // this is the case when we haven't pulled tweets for this stream yet 
        startTime = stream.properties.startTime
    }

    for (const user of seedUsers) {
        let savedFollowsOfUser = await getSavedFollows(user.properties.username);
        if (savedFollowsOfUser.length == user.properties["public_metrics.following_count"]) {
            log.debug(`Looks like we have already saved the ${savedFollowsOfUser.length} users followed by '${user.properties.username}'`)
        } else {
            log.debug(`We have ${savedFollowsOfUser.length} users followed by '${user.properties.username}', but twitter shows ${user.properties["public_metrics.following_count"]}`)

            const getFollowedLimit = await limits.v2.getRateLimit(
                'users/:id/following'
            );

            if ((getFollowedLimit?.remaining ?? 1) > 0) {
                log.debug(`Fetching api.v2.following for ${user.properties.username}...`);
                // Get accounts followed by seed user
                const following = await api.v2.following(
                    user.properties.id,
                    {
                        'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
                        'user.fields': 'created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld',
                        'max_results': 1000,
                        "asPaginator": true
                    }
                );

                while (!following.done) { await following.fetchNext(); }
                console.log(`fetched ${following.data.data.length} accounts followed by '${user.properties.username}'`);
                let newUsers = following.data.data.map((u: any) => {
                    return flattenTwitterUserPublicMetrics([u])[0]
                })
                await addUsersFollowedBy(user.properties.username, newUsers)
            } else {
                log.warn(
                    `Rate limit hit for getting user (${user.properties.username}) follwings, skipping until ${new Date(
                        (getFollowedLimit?.reset ?? 0) * 1000
                    ).toLocaleString()}...`
                );
            }
        }
    }
    await updateStreamFollowingLastUpdatedAt(stream, now.toISOString());
}

async function updateStreamTweetsLastUpdatedAt(stream: Node, user: Node, now: string) {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
        MERGE (s:Stream {name:$streamName})-[r:CONTAINS]->(:User {username:$username})
        set r.tweetsLastUpdatedAt = $now
        RETURN r`,
            { streamName: stream.properties.name, username: user.properties.username, now })
    })
    const streams = res.records.map((row: Record) => {
        return row.get('r')
    })
    await session.close()
    return streams;
}

async function getStreamUserRel(stream: Node, user: Node, now: string) {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeRead((tx: any) => {
        return tx.run(`
        MATCH (s:Stream {name:$streamName})-[r:CONTAINS]->(:User {username:$username})
        RETURN r`,
            { streamName: stream.properties.name, username: user.properties.username })
    })
    console.log(`getting relationship stream ${stream.properties.name} for user ${user.properties.username}`)
    const singleRecord = res.records[0]
    const node = singleRecord.get("r")
    console.log("RELATIONSIHP")
    console.log(node.properties)
    await session.close()
    return node;
}

async function updateStreamFollowingLastUpdatedAt(stream: Node, now: string) {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
        MERGE (s:Stream {name:$streamName})
        set s.followingLastUpdatedAt = $now
        RETURN s`,
            { streamName: stream.properties.name, now })
    })
    const streams = res.records.map((row: Record) => {
        return row.get('s')
    })
    await session.close()
    return streams;
}

export async function updateStreamTweets(api: TwitterApi, limits: TwitterApiRateLimitPlugin, stream: Node, seedUsers: Node[]) {
    // Add the tweets from stream's date Range to the DB to build a feed
    let now = new Date()
    for (const user of seedUsers) {
        let streamUserRel = await getStreamUserRel(stream, user, now.toISOString());
        let startTime;
        if (streamUserRel.properties.tweetsLastUpdatedAt) { // this means we already did an intial pull, so we only need to pull from last time updated
            console.log("LAST UPDATED AT")
            console.log(streamUserRel.properties.tweetsLastUpdatedAt)
            startTime = streamUserRel.properties.tweetsLastUpdatedAt
        } else { // this is the case when we haven't pulled tweets for this stream yet 
            startTime = stream.properties.startTime
        }

        log.debug(`pulling tweets for ${user.properties.username} from ${startTime} to ${now.toISOString()}`)

        let tweets = await getTweetsFromAuthorId(
            api,
            user.properties.id,
            startTime,
        );

        // I can do more fun stuff with this, like get the media of specific tweets: https://github.com/PLhery/node-twitter-api-v2/blob/master/doc/helpers.md
        const includes = new TwitterV2IncludesHelper(tweets);
        // Add included users
        console.log(`pushing ${includes.users.length} users included in tweets from ${user.properties.name}`)
        console.time("addUsers")
        await addUsers(flattenTwitterUserPublicMetrics(includes.users))
        console.timeEnd("addUsers")

        // Add media 
        console.log(`pushing ${includes.media.length} media objects included in tweets from ${user.properties.name}`)
        console.time("addTweetMedia")
        await addTweetMedia(includes.media);
        console.timeEnd("addTweetMedia")

        // Add ref/included tweets
        console.log(`pushing ${includes.tweets.length} ref tweets to graph from ${user.properties.name}`)
        await addTweetsFrom(flattenTweetPublicMetrics(includes.tweets));

        // Add the tweets themselves 
        if (tweets.data.data && tweets.data.data.length > 0) {
            console.log(`pushing ${tweets.data.data.length} tweets to graph from ${user.properties.name}`)
            console.time("addTweetsFrom")
            await addTweetsFrom(flattenTweetPublicMetrics(tweets.data.data));
            console.timeEnd("addTweetsFrom")
        }
        await updateStreamTweetsLastUpdatedAt(stream, user, now.toISOString());
    }
}

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

export async function getStreamTweets(name: string, startTime: string) {
    //THIS EXCLUDES RETWEETS RIGHT NOW
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeRead((tx: any) => {
        return tx.run(`
            MATCH (s:Stream {name: $name} )-[:CONTAINS]->(u:User)-[:POSTED]->(t:Tweet)-[r:REFERENCED]->(:Tweet)
            WHERE t.created_at > $startTime and r.type <> "retweeted"
            OPTIONAL MATCH (t)-[ar:ANNOTATED]-(a)
            RETURN u,t,a
            ORDER by t.created_at DESC
        `,
            { name: name, startTime: startTime })
    })
    let tweets = [];
    if (res.records.length > 0) {
        tweets = res.records.map((row: Record) => {
            return {
                "tweet": row.get('t'),
                "author": row.get('u'),
                "annotation": row.get('a')
            }
        })
    }
    await session.close()
    return tweets;
}

export async function getStreamRecommendedUsers(name: string) {
    //THIS EXCLUDES RETWEETS RIGHT NOW
    const session = driver.session()
    // Create a node within a write transaction
    // super useful for this query: https://neo4j.com/developer/kb/performing-match-intersection/
    const res = await session.executeRead((tx: any) => {
        return tx.run(`
            MATCH (s:Stream {name: $name})-[:CONTAINS]->(seedUsers:User)-[:FOLLOWS]->(allFollowed:User)
            WITH collect(allFollowed) as allFollowedUsers, collect(seedUsers) as seedUsers
            MATCH (seedUser)-[r:FOLLOWS]->(allF)
            WHERE (allF in allFollowedUsers and seedUser in seedUsers)
            WITH collect(endNode(r)) as endingEnders
            return apoc.coll.duplicatesWithCount(endingEnders) as u;
        `,
            { name: name })
    })
    let recommendedUsers = [];
    if (res.records.length > 0) {
        recommendedUsers = res.records.map((row: Record) => {
            return row.get("u")
        })
    }
    await session.close()
    return recommendedUsers;
}

export async function getStreamInteractions(name: string) {

    // Get all the of the interactions (aka pull all their replies/qts/rts) between seedUsers and "interactedUsers". Show them 
    // I made this on my way to creating getStreamDistinctInteractionedWithAccounts, which was my original goal 

    const session = driver.session()
    // Create a node within a write transaction
    // super useful for this query: https://neo4j.com/developer/kb/performing-match-intersection/
    const res = await session.executeRead((tx: any) => {
        return tx.run(`
        MATCH (s:Stream {name: $name})-[:CONTAINS]->(seedUsers:User)-[:POSTED]->(seedUserTweets:Tweet)-[r]->(interactionTweets:Tweet)<-[:POSTED]-(interactedUsers:User)
        WHERE seedUsers.id <> interactedUsers.id
        RETURN seedUsers, seedUserTweets, interactionTweets, interactedUsers
        `,
            { name: name })
    })
    let recommendedUsers = [];
    if (res.records.length > 0) {
        recommendedUsers = res.records.map((row: Record) => {
            return {
                seedUser: row.get("seedUsers"),
                seedUserTweet: row.get("seedUserTweets"),
                interactionTweet: row.get("interactionTweets"),
                interactedUser: row.get("interactedUsers"),
            }
        })
    }
    await session.close()
    return recommendedUsers;
}

export async function getStreamDistinctInteractionedWithAccounts(name: string) {
    // For each interactedUser (a user that a seedUser has interacted with), get the number of seedUsers that have interacted with them in the timerange of the stream
    // aka look for accounts that multiple seed users have replied to/qt'd/rt'd 
    const session = driver.session()
    // Create a node within a write transaction
    // super useful for this query: https://neo4j.com/developer/kb/performing-match-intersection/
    const res = await session.executeRead((tx: any) => {
        return tx.run(`
        MATCH (s:Stream {name: $name})-[:CONTAINS]->(seedUsers:User)-[:POSTED]->(seedUserTweets:Tweet)-[r]->(interactionTweets:Tweet)<-[:POSTED]-(interactedUsers:User)
        WHERE seedUsers.id <> interactedUsers.id
        WITH collect(distinct {seedUser: seedUsers.username, interactedUser: interactedUsers.username}) as accountPairs
        WITH [x IN accountPairs | x.interactedUser] as interactedwith
        return apoc.coll.duplicatesWithCount(interactedwith) as counts;
        `,
            // return apoc.coll.frequencies(interactedwith) as counts; if I want all rows (this includes count=1)
            { name: name })
    })
    let frequencies = [];
    if (res.records.length > 0) {
        frequencies = res.records.map((row: Record) => {
            return row.get("counts")
        })
    }
    await session.close()
    return frequencies;
}


export async function getStreamRecommendedUsersByInteractions(name: string) {
    //THIS EXCLUDES RETWEETS RIGHT NOW
    const session = driver.session()
    // Create a node within a write transaction
    // super useful for this query: https://neo4j.com/developer/kb/performing-match-intersection/
    const res = await session.executeRead((tx: any) => {
        return tx.run(`
        MATCH (s:Stream {name: $name})-[:CONTAINS]->(seedUsers:User)-[:POSTED]->(seedUserTweets:Tweet)-[r]->(interactionTweets:Tweet)<-[:POSTED]-(interactedUsers:User)
        WHERE seedUsers.id <> interactedUsers.id
        WITH collect(interactedUsers) as interactedUsers
        RETURN apoc.coll.duplicatesWithCount(interactedUsers) as u
        `,
            { name: name })
    })
    let recommendedUsers = [];
    if (res.records.length > 0) {
        recommendedUsers = res.records.map((row: Record) => {
            return row.get("u")
        })
    }
    await session.close()
    return recommendedUsers;
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
