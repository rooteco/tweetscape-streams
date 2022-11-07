
import { TwitterV2IncludesHelper } from 'twitter-api-v2';
import type { TwitterApi } from 'twitter-api-v2'
import type { Integer } from 'neo4j-driver';
import { log } from '~/log.server';
import { driver } from "~/neo4j.server";
import { int } from 'neo4j-driver';
import type { Record, Node } from 'neo4j-driver';
import { USER_FIELDS } from '~/twitter.server';
import { getUserNeo4j, indexUserNewTweets, indexUserOlderTweets } from "~/models/user.server";
import type { userNode } from '~/models/user.server';
import type {
    ListV2,
    UserV2,
    TweetV2ListTweetsPaginator
} from 'twitter-api-v2';

import { StreamError } from '~/models/streams.errors';
import type { tweetNode, annotationNode, entityNode, domainNode } from './tweets.server';

export type StreamProperties = {
    name: string,
    twitterListId: string
}

export type streamNode = {
    identity: Array<Integer>,
    labels: any[],
    properties: StreamProperties,
    elementId: string
}

export type relNode = {
    identity: Array<Integer>,
    start: number,
    end: number,
    type: string,
    properties: any,
}

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

export async function getUserFromTwitter(api: TwitterApi, username: string) {
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
        MATCH (s:Stream)-[r:CREATED]-(u)
        OPTIONAL MATCH (s)-[seedUserRel:CONTAINS]->(seedUser:User) 
        RETURN s,u,collect(seedUser) as seedUsers
        `
        )
    })
    const streams = res.records.map((row: Record) => {
        return { stream: row.get('s'), creator: row.get('u'), seedUsers: row.get('seedUsers') }
    })
    await session.close()
    return streams;
}

export async function getAllStreams(username: string) {
    const session = driver.session()
    const res = await session.executeRead((tx: any) => {
        return tx.run(`
            MATCH (s:Stream)<-[:CREATED]-(creator:User)
            WHERE creator.username <> $username
            OPTIONAL MATCH (s)-[r:CONTAINS]->(u:User)
            RETURN s, collect(u) as seedUsers
            `,
            { username }
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
            MATCH (s:Stream)<-[:CREATED]-(creator:User)
            WHERE creator.username <> $username
            unwind s as singleS
            MATCH (singleStream:Stream {name: singleS.name})-[:CONTAINS]->(seedUsers:User)-[:FOLLOWS]->(allFollowed:User)
            WITH collect(allFollowed) as allFollowedUsers, collect(seedUsers) as seedUsers, singleStream as singleStream 
            MATCH (seedUser)-[r:FOLLOWS]->(allF)
            WHERE (allF in allFollowedUsers and seedUser in seedUsers)
            WITH collect(endNode(r)) as endingEnders, singleStream
            RETURN  singleStream.name as streamName, apoc.coll.duplicatesWithCount(endingEnders) as recU
            `,
            { username }
        )
    })
    const recUsersMap = new Map()
    recRes.records.forEach((row: Record) => {
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
        let recommendedUsersTested = []//: any[] = [];

        if (recommendedUsers.length > 0) {
            while (recommendedUsersTested.length < 5 && numSeedUsersFollowedBy > 1) {
                recommendedUsersTested = [];
                numSeedUsersFollowedBy--;
                for (let i = 0; i < recommendedUsers.length; i++) {
                    let recUser = recommendedUsers[i];
                    if (recUser.count >= numSeedUsersFollowedBy && seedUserUsernames.indexOf(recUser.item.properties.username) == -1) {
                        recommendedUsersTested.push(recUser.item)
                    }
                }
            }

        }
        recommendedUsersTested.sort((a, b) => a.properties['public_metrics.followers_count'] - b.properties['public_metrics.followers_count'])
        row.recommendedUsers = recommendedUsersTested
    })

    await session.close()
    return streams;
}

export async function getUserStreams(username: string) {
    const session = driver.session()
    const res = await session.executeRead((tx: any) => {
        return tx.run(`
            MATCH (s:Stream)<-[:CREATED]-(creator:User {username: $username})
            OPTIONAL MATCH (s)-[r:CONTAINS]->(u:User)
            RETURN s, collect(u) as seedUsers
            `,
            { username }
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
            MATCH (s:Stream)<-[:CREATED]-(creator:User {username: $username})
            unwind s as singleS
            MATCH (singleStream:Stream {name: singleS.name})-[:CONTAINS]->(seedUsers:User)-[:FOLLOWS]->(allFollowed:User)
            WITH collect(allFollowed) as allFollowedUsers, collect(seedUsers) as seedUsers, singleStream as singleStream 
            MATCH (seedUser)-[r:FOLLOWS]->(allF)
            WHERE (allF in allFollowedUsers and seedUser in seedUsers)
            WITH collect(endNode(r)) as endingEnders, singleStream
            RETURN  singleStream.name as streamName, apoc.coll.duplicatesWithCount(endingEnders) as recU
            `,
            { username }
        )
    })
    const recUsersMap = new Map()
    recRes.records.forEach((row: Record) => {
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

        let numSeedUsersFollowedBy: number = seedUsers.length + 1;
        let recommendedUsersTested: any[] = [];

        if (recommendedUsers.length > 0) {
            while (recommendedUsersTested.length < 5 && numSeedUsersFollowedBy > 1) {
                recommendedUsersTested = [];
                numSeedUsersFollowedBy--;
                for (let i = 0; i < recommendedUsers.length; i++) {
                    let recUser = recommendedUsers[i];
                    if (recUser.count >= numSeedUsersFollowedBy && seedUserUsernames.indexOf(recUser.item.properties.username) == -1) {
                        recommendedUsersTested.push(recUser.item)
                    }
                }
            }

        }
        recommendedUsersTested.sort((a, b) => a.properties['public_metrics.followers_count'] - b.properties['public_metrics.followers_count'])
        row.recommendedUsers = recommendedUsersTested
    })

    await session.close()
    return streams;
}

export async function getStreamByName(name: string): Promise<{ stream: streamNode, creator: userNode, seedUsers: Array<{ user: userNode, rel: relNode }> }> {
    const session = driver.session()
    // Create a node within a write transaction
    const streamRes = await session.executeRead((tx: any) => {
        return tx.run(`
        MATCH (s:Stream {name:$name} )<-[:CREATED]-(creator:User)
        OPTIONAL MATCH (s)-[r:CONTAINS]->(u:User)
        RETURN DISTINCT s, creator,u,r
        `,
            { name })
    })
    let stream = null;
    let creator = null;
    let seedUsers = null;

    if (streamRes.records.length > 0) {
        stream = streamRes.records[0].get("s"); // Stream will be the same for all users
        creator = streamRes.records[0].get("creator")
        seedUsers = streamRes.records.filter((row: Record) => (row.get("u") && row.get("r"))).map((row: Record) => {
            return {
                user: row.get('u'),
                rel: row.get('r')
            }
        })
    }

    await session.close()
    return { stream: stream, creator: creator, seedUsers: seedUsers };
}

export async function createStream(streamProperties: StreamProperties, username: string): Promise<streamNode> {
    let { stream: checkForStream } = await getStreamByName(streamProperties.name)
    if (checkForStream) {
        throw new StreamError(`Stream '${streamProperties.name}' already exists`)
    }
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
            MATCH(u: User { username: $username })
            CREATE(s: Stream $streamProperties)
            CREATE(u) - [: CREATED] -> (s)
            RETURN s
            `,
            { username, streamProperties })
    })
    const stream = res.records[0].get("s")
    await session.close()
    return stream;
}

export async function deleteStreamByName(name: string) {
    const session = driver.session()
    // Create a node within a write transaction
    await session.executeWrite((tx: any) => {
        return tx.run(`
        MATCH(s: Stream { name: $name })
        DETACH DELETE s`,
            { name })
    })
}

export async function deleteAllStreams() {
    const session = driver.session()
    // Create a node within a write transaction
    await session.executeWrite((tx: any) => {
        return tx.run(`
            MATCH(s: Stream )
            DETACH DELETE s`
        )
    })
}

export async function removeSeedUserFromStream(streamName: string, username: string) {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
        MATCH(s: Stream { name: $streamName }) - [rc: CONTAINS] -> (u:User { username: $username })
        DELETE rc RETURN rc`,
            { streamName, username })
    })
    const singleRecord = res.records[0]
    const node = singleRecord.get("rc")
    await session.close()
    return node;

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

export async function getTweetsFromAuthorIdForStream(
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

export async function getSavedFollows(username: string) {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeRead((tx: any) => {
        return tx.run(`
        MATCH(u: User { username: $username }) - [: FOLLOWS] -> (uf:User) RETURN uf`,
            { username }
        )
    })
    const users = res.records.map((row: Record) => {
        return row.get('uf')
    })
    await session.close()
    return users;
}

export async function addUsersFollowedBy(users: any, { username }) {
    const session = driver.session()
    // Create a node within a write transaction
    try {
        await session.executeWrite((tx: any) => {
            return tx.run(`
        MATCH(u: User { username: $followerUsername }) - [r: FOLLOWS] -> (uf:User) 
            DELETE r
            `,
                { followerUsername: username }
            )
        }) // First, clear old follows so we match current twitter following 
    }
    catch (e) {
        console.log("error in streams.server addUsers followed by first section")
        console.log(e)
        await session.close()
        throw e
    }
    try {
        const res = await session.executeWrite((tx: any) => {
            return tx.run(`
            UNWIND $users AS u
            MATCH(followerUser: User { username: $followerUsername })
            MERGE(followedUser: User { username: u.username })
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
        console.log("error in streams.server addUsersFollowedBy")
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
                user.description = u.description,
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

export async function bulkWritesMulti(writeFunc: any, objectsToWrite: any, args: object) {
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
                tweet.author_id = t.author_id,
                tweet.\`public_metrics.retweet_count\` = t.\`public_metrics.retweet_count\`,
                tweet.\`public_metrics.reply_count\` = t.\`public_metrics.reply_count\`,
                tweet.\`public_metrics.like_count\` = t.\`public_metrics.like_count\`,
                tweet.\`public_metrics.quote_count\` = t.\`public_metrics.quote_count\`
            MERGE (user:User {id: t.author_id})

            MERGE (user)-[:POSTED]->(tweet)

            FOREACH (m IN t.entities.mentions |
                MERGE (mentioned:User {username:m.username})
                MERGE (tweet)-[:MENTIONED]->(mentioned)
            )
            FOREACH (u IN t.entities.urls |
                MERGE (url:Link {url:u.url})
                SET url.start = u.start,
                    url.end = u.end,
                    url.url = u.url,
                    url.expanded_url = u.expanded_url,
                    url.display_url = u.display_url,
                    url.media_key = u.media_key
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
    streamName: string,
    username: string, // has already been added to db before calling this func
): Promise<{ stream: streamNode, rel: relNode, user: userNode }> {
    let user = await getUserNeo4j(username);
    if (!user) {
        throw new StreamError(`Cannot add user with username '${username}' to stream '${streamName}.' User not found in db`);
    }
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeWrite((tx: any) => {
        return tx.run(`
        MATCH(u: User { username: $username }) 
        MATCH(s: Stream { name: $streamName })
        MERGE(s) - [r: CONTAINS] -> (u)
        RETURN s, r, u`,
            { username, streamName }
        )
    })
    const singleRecord = res.records[0]
    const node = { stream: singleRecord.get("s"), rel: singleRecord.get("r"), user: singleRecord.get("u") }
    await session.close()
    return node;
};

export async function indexMoreTweets(api: TwitterApi, seedUsers: Array<{ user: userNode, rel: relNode }>) {
    return await Promise.all(seedUsers.map((user) => {
        return indexUserOlderTweets(api, user.user)
    }))
}
export async function updateStreamTweets(api: TwitterApi, seedUsers: Array<{ user: userNode, rel: relNode }>) {
    return await Promise.all(seedUsers.map((user) => {
        return indexUserNewTweets(api, user.user)
    }))
}


async function writeTweetData(res: TweetV2ListTweetsPaginator) {
    let media = []
    let users = []
    let refTweets = []
    let tweetsFromList = []

    let includes = new TwitterV2IncludesHelper(res)

    users.push(...flattenTwitterUserPublicMetrics(includes.users))
    media.push(...includes.media)
    refTweets.push(...flattenTweetPublicMetrics(includes.tweets))
    tweetsFromList.push(...flattenTweetPublicMetrics(res.tweets))
    await Promise.all([
        bulkWrites(users, addUsers),
        bulkWrites(media, addTweetMedia),
        bulkWrites(refTweets, addTweetsFrom),
        bulkWrites(tweetsFromList, addTweetsFrom)
    ])
}

export async function getStreamTweetsNeo4j(
    streamName: string,
    skip: number = 0,
    limit: number = 50,
    tags: string[] = []
): Promise<Array<{
    tweet: tweetNode,
    author: userNode,
    annotation: annotationNode,
    refTweets: Array<tweetNode>,
    refTweetRels: Array<relNode>,
    refTweetAuthors: Array<userNode>,
    entities: Array<entityNode>,
    domains: Array<domainNode>,
    media: Array<domainNode>,
    mediaRels: Array<relNode>,
}>> {
    const noTagsQuery = `
        MATCH (s:Stream {name: $name} )-[:CONTAINS]->(u:User)-[:POSTED]->(t:Tweet)
        OPTIONAL MATCH (t)-[r:REFERENCED]->(ref_t:Tweet)<-[:POSTED]-(ref_a:User)
        OPTIONAL MATCH (t)-[tr:INCLUDED]->(entity:Entity)-[:CATEGORY]-(d:Domain {name:"Unified Twitter Taxonomy"})
        OPTIONAL MATCH (t)-[mr:ATTACHED]->(media:Media)
        OPTIONAL MATCH (t)-[ar:ANNOTATED]-(a)
        RETURN DISTINCT u,t,
            collect(DISTINCT a) as a, 
            collect(DISTINCT r) as refTweetRels, 
            collect(DISTINCT ref_t) as refTweets,
            collect(ref_a) as refTweetAuthors, 
            collect(DISTINCT entity) as entities,
            collect(DISTINCT d) as domains,
            collect(DISTINCT media) as media, 
            collect(DISTINCT mr) as mediaRels
        ORDER by t.created_at DESC
        SKIP $skip
        LIMIT $limit
    `
    const withTagsQuery = `
        MATCH (s:Stream {name: $name} )-[:CONTAINS]->(u:User)-[:POSTED]->(t:Tweet)
        MATCH (t)-[tr:INCLUDED]->(entity:Entity)-[:CATEGORY]-(d:Domain {name:"Unified Twitter Taxonomy"})
        WHERE entity.name IN $tags
        OPTIONAL MATCH (t)-[r:REFERENCED]->(ref_t:Tweet)<-[:POSTED]-(ref_a:User)
        OPTIONAL MATCH (t)-[mr:ATTACHED]->(media:Media)
        OPTIONAL MATCH (t)-[ar:ANNOTATED]-(a)
        RETURN DISTINCT u,t,
            collect(DISTINCT a) as a, 
            collect(DISTINCT r) as refTweetRels, 
            collect(DISTINCT ref_t) as refTweets,
            collect(ref_a) as refTweetAuthors, 
            collect(DISTINCT entity) as entities,
            collect(DISTINCT d) as domains,
            collect(DISTINCT media) as media, 
            collect(DISTINCT mr) as mediaRels
        ORDER by t.created_at DESC
        SKIP $skip
        LIMIT $limit
    `
    const session = driver.session()
    // Create a node within a write transaction

    // NOTE: BE V CAREFUL ABOUT WHICH OF THE COLLECT() RETURNS ARE DISTINCT (REF_TWEET_AUTHORS IS AN EXAMPLE OF ONE THAT SHOULD NOT BE)
    const query = (tags.length > 0 ? withTagsQuery : noTagsQuery)
    const res = await session.executeRead((tx: any) => {
        return tx.run(
            query,
            { name: streamName, skip: int(skip), limit: int(limit), tags: tags }
        )
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
                entities: row.get('entities'),
                domains: row.get('domains'),
                media: row.get('media'),
                mediaRels: row.get('mediaRels')
            }
        })
    }
    await session.close()
    return tweets;
}

export async function writeStreamListTweetsToNeo4j(api: TwitterApi, stream: Node, numPages: number = 10, maxResults: number = 100, sinceId: string | null = null) {
    let listTweetsRes
    let reqBody = {
        'expansions': 'author_id,in_reply_to_user_id,referenced_tweets.id,referenced_tweets.id.author_id,entities.mentions.username,attachments.poll_ids,attachments.media_keys,geo.place_id',
        'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
        'user.fields': USER_FIELDS,
        'media.fields': 'alt_text,duration_ms,height,media_key,preview_image_url,type,url,width,public_metrics',
        'poll.fields': 'duration_minutes,end_datetime,id,options,voting_status',
        'place.fields': 'contained_within,country,country_code,full_name,geo,id,name,place_type',
        'max_results': maxResults,
    }
    try {
        listTweetsRes = await api.v2.listTweets(
            stream.properties.twitterListId,
            reqBody
        )

        let results: TweetV2ListTweetsPaginator[] = []
        results.push(listTweetsRes)
        for (let step = 0; step < numPages; step++) {
            let last: TweetV2ListTweetsPaginator = results.slice(-1)[0]
            console.log(`pulling tweets for page ${step}`)
            let next = await last.next()
            await writeTweetData(next)
            let tweetIds = next.tweets.map((t) => (t.id))
            if (sinceId && tweetIds.indexOf(sinceId) > -1) {
                console.log(`hit tweet with id ${sinceId} in latest pull, so stopping queueed data writing job`)
                break;
            }
            results.push(next)
        }
    } catch (e) {
        log.error(`error getting list tweets for '${stream.properties.name}': ${JSON.stringify(e, null, 2)}`);
        throw e
    }
}

export async function StreamTweetsEntityCounts(streamName: string) {
    const session = driver.session()
    let params = { streamName: streamName }
    let query = `
    MATCH (s:Stream {name:$streamName})-[:CONTAINS]->(u:User)-[:POSTED]->(t:Tweet)
    OPTIONAL MATCH (t)-[tr:INCLUDED]->(entity:Entity)-[:CATEGORY]-(d:Domain {name:"Unified Twitter Taxonomy"})
    WITH collect(entity) as entities, collect(t) as tweets
    RETURN apoc.coll.frequencies(entities) as entityDistribution, size(tweets) as numTotalTweets
        `
    const res = await session.executeRead((tx: any) => {
        return tx.run(query, params)
    })
    let data;
    if (res.records.length == 1) {
        data = {
            "entityDistribution": res.records[0].get("entityDistribution").map((row) => ({ item: row.item, count: row.count.toInt() })),
            "numTotalTweets": res.records[0].get("numTotalTweets")
        }
    }
    data.entityDistribution.sort((a, b) => (b.count - a.count))
    await session.close()
    return data;
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