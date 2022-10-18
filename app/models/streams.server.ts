
import { TweetStream, TwitterApiv2, TwitterV2IncludesHelper, UserSearchV1Paginator } from 'twitter-api-v2';
import type { TwitterApiRateLimitPlugin } from '@twitter-api-v2/plugin-rate-limit';

import { log } from '~/log.server';
import { driver } from "~/neo4j.server";
import type { Record, Node } from 'neo4j-driver'
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
    MediaObjectV2, TwitterApi
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

    const res = await session.executeRead((tx: any) => {
        return tx.run(`
            MATCH (t:Tweet {id: $tweetId})-[r:POSTED]-(u)
            OPTIONAL MATCH (t)-[r]->(referenced)
            OPTIONAL MATCH (t)<-[rb]-(referenced_by)
            RETURN t, u, collect(referenced) as referenced, collect(r) as refRels, collect(referenced_by) as referencedBy, collect(rb) as refByRels`,
            { tweetId }
        )
    })

    let data = res.records.map((row: any) => {
        return {
            tweet: row.get("t"),
            referenced: row.get("referenced"),
            refRels: row.get("refRels"),
            referencedBy: row.get("referencedBy"),
            refByRels: row.get('refByRels')
        }
    })
    await session.close()
    return data
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

export async function getAllStreams() {
    const session = driver.session()
    const res = await session.executeRead((tx: any) => {
        return tx.run(`
            MATCH (s:Stream)
            OPTIONAL MATCH (s)-[r:CONTAINS]->(u:User)
            RETURN s, collect(u) as seedUsers
            `
        )
    })
    const streams = res.records.map((row: Record) => {
        return {
            "stream": row.get("s"),
            "seedUsers": row.get("seedUsers")
        }
    })

    const recRes = await session.executeRead((tx: any) => {
        return tx.run(`
            MATCH (s:Stream)
            unwind s as singleS
            MATCH (singleStream:Stream {name: singleS.name})-[:CONTAINS]->(seedUsers:User)-[:FOLLOWS]->(allFollowed:User)
            WITH collect(allFollowed) as allFollowedUsers, collect(seedUsers) as seedUsers, singleStream as singleStream 
            MATCH (seedUser)-[r:FOLLOWS]->(allF)
            WHERE (allF in allFollowedUsers and seedUser in seedUsers)
            WITH collect(endNode(r)) as endingEnders, singleStream
            RETURN  singleStream.name as streamName, apoc.coll.duplicatesWithCount(endingEnders) as recU
            `
        )
    })
    const recUsersMap = new Map()
    recRes.records.map((row: Record) => {
        let streamName = row.get("streamName")
        let ru = row.get("recU")
        recUsersMap.set(streamName, ru)
    })
    streams.forEach((row: any) => {
        let streamName = row.stream.properties.name
        let seedUsers = row.seedUsers;
        let seedUserUsernames = seedUsers.map((row: any) => row.properties.username)

        let recommendedUsers = recUsersMap.get(streamName)
        if (!recommendedUsers) {
            recommendedUsers = []
        }

        let numSeedUsersFollowedBy = seedUsers.length + 1;
        let recommendedUsersTested: any[] = [];

        if (recommendedUsers.length > 0) {
            while (recommendedUsersTested.length < 5 && numSeedUsersFollowedBy > 1) {
                recommendedUsersTested = [];
                numSeedUsersFollowedBy--;
                recommendedUsers.map((row: any) => {
                    if (row.count.toInt() >= numSeedUsersFollowedBy && seedUserUsernames.indexOf(row.item.properties.username) == -1) {
                        recommendedUsersTested.push(row.item)
                    }
                })
            }

        }

        recommendedUsersTested.sort((a, b) => a.properties['public_metrics.followers_count'] - b.properties['public_metrics.followers_count'])


        row.recommendedUsers = recommendedUsersTested
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

import { createList, getUserOwnedTwitterLists } from '~/twitter.server'

export async function createStream(api: TwitterApi, name: string, startTime: string, user: UserV2) {
    console.time("ownedLists")
    const userOwnedListsNames = (await getUserOwnedTwitterLists(api, user)).map((row) => (row.name));
    console.timeEnd("ownedLists")
    console.log(userOwnedListsNames)
    if (userOwnedListsNames.indexOf(name) > -1) {
        return {
            "errors": {
                "streamName": `You already have a list named '${name}', you should import that list instead of creating a new stream`
            }
        }
    }

    const { list, members } = await createList(api, name, [])
    const session = driver.session()
    // Create a node within a write transaction
    let streamData = {
        name,
        startTime,
        twitterListId: list.data.id,
    }
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
            MATCH (u:User {username: $username}) 
            MERGE (s:Stream {name: $streamData.name})
            SET s = $streamData
            MERGE (u)-[:CREATED]->(s)
            RETURN s`,
            { streamData: streamData, username: user.username }
        )
    })
    // Get the `p` value from the first record
    const singleRecord = res.records[0]
    const node = singleRecord.get("s")
    await session.close()
    return node;
}

export async function deleteStreamByName(api: TwitterApi, name: string) {
    const stream = (await getStreamByName(name)).stream
    console.log("HERE IS STREAM")
    console.log(stream.properties)
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
        MATCH (s:Stream {name: $name} )
        DETACH DELETE s`,
            { name })
    })
    await api.v2.removeList(stream.properties.twitterListId)
    console.log(`deleted stream '${name}' and twitter list with id ${stream.properties.twitterListId}`)
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
    console.log(`pulling tweets for ${id}`)
    const tweets = await api.v2.userTimeline(
        id,
        {
            'expansions': 'author_id,in_reply_to_user_id,referenced_tweets.id,referenced_tweets.id.author_id,entities.mentions.username,attachments.poll_ids,attachments.media_keys,geo.place_id',
            'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
            'user.fields': USER_FIELDS,
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
    console.log(`done pulling tweets for ${id}`)
    return tweets;
}

async function pullTweets(api: TwitterApi, user: Node, startTime: string, now: string) {
    console.log(`pulling tweets for ${user.properties.username} from ${startTime} to ${now}`)
    const tweets = await api.v2.userTimeline(
        user.properties.id,
        {
            'expansions': 'author_id,in_reply_to_user_id,referenced_tweets.id,referenced_tweets.id.author_id,entities.mentions.username,attachments.poll_ids,attachments.media_keys,geo.place_id',
            'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
            'user.fields': USER_FIELDS,
            'media.fields': 'alt_text,duration_ms,height,media_key,preview_image_url,type,url,width,public_metrics',
            'poll.fields': 'duration_minutes,end_datetime,id,options,voting_status',
            'place.fields': 'contained_within,country,country_code,full_name,geo,id,name,place_type',
            'max_results': 100,
            'start_time': startTime,
            'end_time': now
        }
    );
    while (!tweets.done) {
        console.log(tweets.data.data.length);
        await tweets.fetchNext();
    }
    console.log(`done pulling tweets for ${user.properties.username}`)
    return tweets;
}

async function getTweetsFromAuthorIdForStream(
    api: TwitterApi,
    user: Node,
    stream: Node,
    now: string = (new Date()).toISOString(), // this is a useful arg for testing
) {
    let dateRanges = []
    if (!user.properties.tweetscapeIndexedTweetsStartTime || !user.properties.tweetscapeIndexedTweetsEndTime) {
        // this means a user has never had tweets pulled
        dateRanges.push({ startTime: stream.properties.startTime, endTime: now })
    } else if (stream.properties.startTime > user.properties.tweetscapeIndexedTweetsStartTime && stream.properties.endTime < user.properties.tweetscapeIndexedTweetsEndTime) {
        // we already have this user indexed for the timezone of this stream
        log.debug("No new tweets to pull")
        return []
    } else if (stream.properties.startTime > user.properties.tweetscapeIndexedTweetsStartTime && stream.properties.endTime > user.properties.tweetscapeIndexedTweetsEndTime) {
        // a user has been indexed before, this new stream has happened since then, so pull all tweets starting from date of that
        // last query (not the startTime of the stream, so we keep all tweets pulled for this user continuous)
        dateRanges.push({ startTime: user.properties.tweetscapeIndexedTweetsEndTime, endTime: now })
    } else if (stream.properties.startTime < user.properties.tweetscapeIndexedTweetsStartTime) {
        dateRanges.push({ startTime: stream.properties.startTime, endTime: user.properties.tweetscapeIndexedTweetsStartTime })
    }
    else if (now > user.properties.tweetscapeIndexedTweetsEndTime) {
        dateRanges.push({ startTime: user.properties.tweetscapeIndexedTweetsEndTime, endTime: now })
    }

    console.log("DATE RANGES")
    console.log(dateRanges)
    const allTweets: TweetV2[] = [];
    const tweetRes = await Promise.all(
        dateRanges.map(({ startTime, endTime }) => {
            return pullTweets(api, user, startTime, endTime)
        })
    )

    let media = []
    let users = []
    let refTweets = []
    let tweets = []

    for (let res of tweetRes) {
        let includes = new TwitterV2IncludesHelper(res)
        users.push(...flattenTwitterUserPublicMetrics(includes.users))
        media.push(...includes.media)
        refTweets.push(...flattenTweetPublicMetrics(includes.tweets))
        if (res.data.data && res.data.data.length > 0) {
            tweets.push(...res.data.data)
        }
    }

    return { tweets, refTweets, users, media }
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
    const res = await session.executeRead((tx: any) => {
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

async function addUsersFollowedBy(users: any, { username }) {
    const session = driver.session()
    // Create a node within a write transaction
    try {
        const clearFollows = await session.executeWrite((tx: any) => {
            return tx.run(`
            MATCH (u:User {username: $followerUsername})-[r:FOLLOWS]->(uf:User) 
            DELETE r
            `,
                { followerUsername: username }
            )
        }) // First, clear old follows so we match current twitter following 
    }
    catch (e) {
        console.log(e)
        await session.close()
        throw e
    }
    try {
        const res = await session.executeWrite((tx: any) => {
            return tx.run(`
            UNWIND $users AS u
            MATCH (followerUser:User {username: $followerUsername})
            MERGE (followedUser:User {username: u.username})
            SET followedUser.id = u.id,
                followedUser.created_at = u.created_at,
                followedUser.verified = u.verified,
                followedUser.profile_image_url = u.profile_image_url,
                followedUser.name = u.name,
                followedUser.username = u.username,
                followedUser.url = u.url,
                followedUser.\`public_metrics.followers_count\`  = u.\`public_metrics.followers_count\`,
                followedUser.\`public_metrics.following_count\`  = u.\`public_metrics.following_count\`,
                followedUser.\`public_metrics.tweet_count\`  = u.\`public_metrics.tweet_count\`,
                followedUser.\`public_metrics.listed_count\`  = u.\`public_metrics.listed_count\`
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
    catch (e) {
        console.log(e)
        await session.close()
        throw e
    }
}

export async function addUsers(users: any) {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
            UNWIND $users AS u
            MERGE (user:User {username: u.username})
            SET user.id = u.id,
                user.created_at = u.created_at,
                user.verified = u.verified,
                user.profile_image_url = u.profile_image_url,
                user.name = u.name,
                user.username = u.username,
                user.url = u.url,
                user.\`public_metrics.followers_count\`  = u.\`public_metrics.followers_count\`,
                user.\`public_metrics.following_count\`  = u.\`public_metrics.following_count\`,
                user.\`public_metrics.tweet_count\`  = u.\`public_metrics.tweet_count\`,
                user.\`public_metrics.listed_count\`  = u.\`public_metrics.listed_count\`
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

export async function bulkWrites(objs: any, writeFunc: any) {
    const chunkSize = 100;
    let chunkWrites = [];
    console.log(`writing ${objs.length} objects with ${writeFunc.name}`)
    for (let i = 0; i < objs.length; i += chunkSize) {
        const chunk = objs.slice(i, i + chunkSize);
        chunkWrites.push(writeFunc(chunk))
    }
    let singleList = [];
    for (const res of (await Promise.all(chunkWrites))) {
        singleList.push(...res)
    }
    return singleList;
}

async function bulkWritesMulti(writeFunc: any, objectsToWrite: any, args: object) {
    const chunkSize = 100;
    let chunkWrites = [];
    console.log(`writing ${objectsToWrite.length} objects with ${writeFunc.name}`)
    for (let i = 0; i < objectsToWrite.length; i += chunkSize) {
        const chunk = objectsToWrite.slice(i, i + chunkSize);
        chunkWrites.push(writeFunc(chunk, args))
    }
    console.log(`split ${objectsToWrite.length} into ${chunkWrites.length} chunks`)
    let singleList = [];
    for (const res of (await Promise.all(chunkWrites))) {
        singleList.push(...res)
    }
    return singleList;
}

export async function addUserFollowedLists(user: UserV2, lists: ListV2[]) {
    const session = driver.session()
    // Create a node within a write transaction
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

export async function addTweetMedia(media: any) {
    const session = driver.session()
    // Create a node within a write transaction
    let flatMedia = flattenMediaPublicMetrics(media);
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

export async function addTweetsFrom(tweets: any) {
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
                tweet.reply_settings = t.reply_settings,
                tweet.author_id = t.author_id

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
            FOREACH (ca IN t.context_annotations |
                MERGE (domain:Domain {id: ca.domain.id})
                SET domain = ca.domain
                MERGE (entity:Entity {id: ca.entity.id})
                SET entity = ca.entity
                MERGE (tweet)-[:INCLUDED]->(entity)
                MERGE (entity)-[:CATEGORY]-(domain)
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
            RETURN tweet
            `,
            { tweets: tweets }
        )
    })
    const tweetsSaved = res.records.map((row: any) => {
        return row.get("tweet")
    })
    await session.close()
    return tweetsSaved;
};

export async function addSeedUserToStream(
    api: TwitterApi,
    limits: any,
    stream: Node,
    user: any, // has already been added to db before calling this func
    now: string = (new Date()).toISOString()
) {
    try {
        log.debug(`adding user '${user.properties.username}' to stream '${stream.properties.name}`)
        // Add new seedUsers relation to Stream
        api.v2.addListMember(stream.properties.twitterListId, user.properties.id)
        return await streamContainsUser(user.properties.username, stream.properties.name)
    } catch (e) {
        log.error(`Error fetching tweets: ${JSON.stringify(e, null, 2)}`);
        throw e;
    }
};

export async function addSeedUserToStreamOld(
    api: TwitterApi,
    limits: any,
    stream: Node,
    user: any, // has already been added to db before calling this func
    now: string = (new Date()).toISOString()
) {
    try {
        log.debug(`adding user '${user.properties.username}' to stream '${stream.properties.name}`)
        // Add new seedUsers relation to Stream
        const reses = await Promise.all([
            getTweetsFromAuthorIdForStream(
                api,
                user,
                stream,
                now
            ),
            getSavedFollows(user.properties.username)
        ])

        const tweetRes = reses[0]
        const savedFollowsOfUser = reses[1]

        if (tweetRes.tweets.length > 0) {
            let data = await Promise.all([
                bulkWrites(tweetRes.users, addUsers),
                bulkWrites(tweetRes.media, addTweetMedia),
                bulkWrites(tweetRes.refTweets, addTweetsFrom),
                bulkWrites(tweetRes.tweets, addTweetsFrom)
            ])

            let tweetTimeMax = new Date(Math.max.apply(null, tweetRes.tweets.map((t) => new Date(t.created_at))))
            let tweetTimeMin = new Date(Math.min.apply(null, tweetRes.tweets.map((t) => new Date(t.created_at))))

            let newMax = user.properties.tweetscapeIndexedTweetsEndTime;
            let newMin = user.properties.tweetscapeIndexedTweetsStartTime;
            if (!user.properties.tweetscapeIndexedTweetsEndTime) {
                newMax = tweetTimeMax.toISOString()
            } else if (user.properties.tweetscapeIndexedTweetsEndTime < tweetTimeMax.toISOString()) {
                newMax = tweetTimeMax.toISOString()
            }
            if (!user.properties.tweetscapeIndexedTweetsEndTime) {
                newMin = tweetTimeMin.toISOString()
            }
            else if (user.properties.tweetscapeIndexedTweetsStartTime > tweetTimeMin.toISOString()) {
                newMin = tweetTimeMin.toISOString()
            }

            updateUserTweetscapeTweetIndexTimes(user, newMin, newMax)
        }

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
                        'user.fields': USER_FIELDS,
                        'max_results': 1000,
                        "asPaginator": true
                    }
                );

                while (!following.done) { await following.fetchNext(); }
                console.log(`fetched ${following.data.data.length} accounts followed by '${user.properties.username}'`);
                let newUsers = flattenTwitterUserPublicMetrics(following.data.data);
                console.log("-----adfsad------")
                console.log(newUsers.slice(0, 2))
                let saved = await bulkWritesMulti(
                    addUsersFollowedBy,
                    newUsers,
                    { username: user.properties.username }
                )
            } else {
                log.warn(
                    `Rate limit hit for getting user (${user.properties.username}) follwings, skipping until ${new Date(
                        (getFollowedLimit?.reset ?? 0) * 1000
                    ).toLocaleString()}...`
                );
            }
        }


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

    await Promise.all(seedUsers.map(async (user: Node) => {
        user = user.user; // yes tf it does, it is a neo4j node 
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
                        'user.fields': USER_FIELDS,
                        'max_results': 1000,
                        "asPaginator": true
                    }
                );

                while (!following.done) { await following.fetchNext(); }
                console.log(`fetched ${following.data.data.length} accounts followed by '${user.properties.username}'`);
                let newUsers = flattenTwitterUserPublicMetrics(following.data.data);
                let saved = await bulkWritesMulti(
                    addUsersFollowedBy,
                    newUsers,
                    { username: user.properties.username }
                )
            } else {
                log.warn(
                    `Rate limit hit for getting user (${user.properties.username}) follwings, skipping until ${new Date(
                        (getFollowedLimit?.reset ?? 0) * 1000
                    ).toLocaleString()}...`
                );
            }
        }
    }))
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

async function getStreamUserRel(stream: Node, user: Node) {//}, now: string) {
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

export async function updateStreamTweets(api: TwitterApi, stream: Node, seedUsers: Node[], now: string = (new Date()).toISOString()) {
    // Add the tweets from stream's date Range to the DB to build a feed
    // let now = new Date()
    // const endTime = new Date()
    // const startTime = new Date(endTime.getFullYear(), endTime.getMonth(), endTime.getDate() - 7, endTime.getHours(), endTime.getMinutes())
    let tweets: TweetV2[] = [];
    let refTweets: TweetV2[] = [];
    let users: UserV2[] = [];
    let media: MediaObjectV2[] = [];
    const tweetResponses = await Promise.all(seedUsers.map((user) => {
        return getTweetsFromAuthorIdForStream(
            api,
            user,
            stream,
            now
        )
    }))
    for (let res of tweetResponses) {
        users.push(...res.users)
        media.push(...res.media)
        refTweets.push(...res.refTweets)
        tweets.push(...res.tweets)
    }
    let data = await Promise.all([
        bulkWrites(users, addUsers),
        bulkWrites(media, addTweetMedia),
        bulkWrites(refTweets, addTweetsFrom),
        bulkWrites(tweets, addTweetsFrom)
    ])
    await Promise.all(seedUsers.map((user: any) => {
        let tweetTimeMax = new Date(Math.max.apply(null, tweets.map((t) => new Date(t.created_at))))
        let tweetTimeMin = new Date(Math.min.apply(null, tweets.map((t) => new Date(t.created_at))))

        console.log("TWEETTIMEMAX")
        console.log(tweetTimeMax)
        console.log(tweets.map((t) => new Date(t.created_at)))

        let newMax = user.properties.tweetscapeIndexedTweetsEndTime;
        let newMin = user.properties.tweetscapeIndexedTweetsStartTime;
        if (!user.properties.tweetscapeIndexedTweetsEndTime) {
            newMax = tweetTimeMax.toISOString()
        } else if (user.properties.tweetscapeIndexedTweetsEndTime < tweetTimeMax.toISOString()) {
            newMax = tweetTimeMax.toISOString()
        }


        if (!user.properties.tweetscapeIndexedTweetsEndTime) {
            newMin = tweetTimeMin.toISOString()
        }
        else if (user.properties.tweetscapeIndexedTweetsStartTime > tweetTimeMin.toISOString()) {
            newMin = tweetTimeMin.toISOString()
        }
        console.log(newMin)
        console.log(newMax)
        updateUserTweetscapeTweetIndexTimes(user, newMin, newMax)
    }))
    return data;
}

async function updateUserTweetscapeTweetIndexTimes(user: Node, startTime: string, endTime: string) {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
        MERGE (u:User {username: $username})
        SET u.tweetscapeIndexedTweetsStartTime = $startTime
        SET u.tweetscapeIndexedTweetsEndTime = $endTime
        RETURN u`,
            { username: user.properties.username, startTime, endTime })
    })
    const streams = res.records.map((row: Record) => {
        return row.get('u')
    })
    await session.close()
    return streams;
}

export async function getStreamTweetsFromList(api: TwitterApi, stream: Node, name: string, startTime: string) {
    const listTweetsRes = await api.v2.listTweets(
        stream.properties.twitterListId,
        {
            'expansions': 'author_id,in_reply_to_user_id,referenced_tweets.id,referenced_tweets.id.author_id,entities.mentions.username,attachments.poll_ids,attachments.media_keys,geo.place_id',
            'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
            'user.fields': USER_FIELDS,
            'media.fields': 'alt_text,duration_ms,height,media_key,preview_image_url,type,url,width,public_metrics',
            'poll.fields': 'duration_minutes,end_datetime,id,options,voting_status',
            'place.fields': 'contained_within,country,country_code,full_name,geo,id,name,place_type',
            'max_results': 20,
        }
    )

    let media = []
    let users = []
    let refTweets = []
    let tweetsFromList = []

    let includes = new TwitterV2IncludesHelper(listTweetsRes)
    users.push(...flattenTwitterUserPublicMetrics(includes.users))
    media.push(...includes.media)
    refTweets.push(...flattenTweetPublicMetrics(includes.tweets))
    if (listTweetsRes.data.data && listTweetsRes.data.data.length > 0) {
        tweetsFromList.push(...listTweetsRes.data.data)
    }

    console.log(`writing ${tweetsFromList.length} tweets for list stream ${name}`)
    await Promise.all([
        bulkWrites(users, addUsers),
        bulkWrites(media, addTweetMedia),
        bulkWrites(refTweets, addTweetsFrom),
        bulkWrites(tweetsFromList, addTweetsFrom)
    ])

    //THIS EXCLUDES RETWEETS RIGHT NOW
    const session = driver.session()
    // Create a node within a write transaction

    const res = await session.executeRead((tx: any) => {
        return tx.run(`
            MATCH (s:Stream {name: $name} )-[:CONTAINS]->(u:User)-[:POSTED]->(t:Tweet)
            OPTIONAL MATCH (t)-[r:REFERENCED]->(ref_t:Tweet)<-[:POSTED]-(ref_a:User)
            OPTIONAL MATCH (t)-[ar:ANNOTATED]-(a)
            OPTIONAL MATCH (t)-[tr:INCLUDED]->(entity)
            RETURN u,t,collect(a) as a, collect(r) as refTweetRels, collect(ref_t) as refTweets,collect(ref_a) as refTweetAuthors, collect(entity) as entities
            ORDER by t.created_at DESC
        `,
            { name: name, startTime: startTime })
    })
    let tweets = [];
    if (res.records.length > 0) {
        tweets = res.records.map((row: Record) => {
            return {
                tweet: row.get('t'),
                author: row.get('u'),
                annotation: row.get('a'),
                refTweets: row.get('refTweets'),
                refTweetRels: row.get('refTweetRels'),
                refTweetAuthors: row.get('refTweetAuthors'),
                entities: row.get('entities')
            }
        })
    }
    await session.close()
    return tweets;
}

export async function getStreamTweets(name: string, startTime: string) {
    //THIS EXCLUDES RETWEETS RIGHT NOW
    const session = driver.session()
    // Create a node within a write transaction

    const res = await session.executeRead((tx: any) => {
        return tx.run(`
            MATCH (s:Stream {name: $name} )-[:CONTAINS]->(u:User)-[:POSTED]->(t:Tweet)
            OPTIONAL MATCH (t)-[r:REFERENCED]->(ref_t:Tweet)<-[:POSTED]-(ref_a:User)
            OPTIONAL MATCH (t)-[ar:ANNOTATED]-(a)
            OPTIONAL MATCH (t)-[tr:INCLUDED]->(entity)
            RETURN u,t,collect(a) as a, collect(r) as refTweetRels, collect(ref_t) as refTweets,collect(ref_a) as refTweetAuthors, collect(entity) as entities
            ORDER by t.created_at DESC
        `,
            { name: name, startTime: startTime })
    })
    let tweets = [];
    if (res.records.length > 0) {
        tweets = res.records.map((row: Record) => {
            return {
                tweet: row.get('t'),
                author: row.get('u'),
                annotation: row.get('a'),
                refTweets: row.get('refTweets'),
                refTweetRels: row.get('refTweetRels'),
                refTweetAuthors: row.get('refTweetAuthors'),
                entities: row.get('entities')
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