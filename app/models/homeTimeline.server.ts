import { driver } from "~/neo4j.server";
import { Record, Node, int } from 'neo4j-driver'

export async function addHomeTimelineTweets(tweets: any, timelineUser: any) {
    // Same as addTweetsFrom in models/streams.server.ts, except we are adding a [:HOMETIMLINE] edge for the timelineUser for each of the tweets
    const session = driver.session()
    // Create a node within a write transaction
    console.log(`adding ${tweets.length} tweets to homeTimeline for ${timelineUser.username}`)
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

            MERGE (timelineUser:User {id: $timelineUserId})
            MERGE (timelineUser)-[:HOMETIMELINE]->(tweet)

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
            { tweets: tweets, timelineUserId: timelineUser.id }
        )
    })
    const tweetsSaved = res.records.map((row: any) => {
        return row.get("tweet")
    })
    await session.close()
    return tweetsSaved;
};

export async function getHomeTimelineTweetsNeo4jByTags(
    username: string,
    limit: number | null = 100,
    skip: number = 0,
    tags: Array<string> = []
) {
    //THIS EXCLUDES RETWEETS RIGHT NOW
    const session = driver.session()
    // Create a node within a write transaction
    let params = { username: username, tags: tags }
    console.log(params)
    let query = `
        MATCH (timelineUser:User {username:$username})-[:HOMETIMELINE]->(t:Tweet)<-[:POSTED]-(u:User)
        MATCH (t)-[tr:INCLUDED]->(entity:Entity)-[:CATEGORY]-(d:Domain {name:"Unified Twitter Taxonomy"})
        WHERE entity.name IN $tags 
        OPTIONAL MATCH (t)-[r:REFERENCED]->(ref_t:Tweet)<-[:POSTED]-(ref_a:User)
        OPTIONAL MATCH (t)-[mr:ATTACHED]->(media:Media)
        RETURN u,t,
            collect(DISTINCT r) as refTweetRels, 
            collect(DISTINCT ref_t) as refTweets,
            collect(ref_a) as refTweetAuthors, 
            collect(DISTINCT entity) as entities, 
            collect(DISTINCT d) as domains,
            collect(DISTINCT media) as media, 
            collect(DISTINCT mr) as mediaRels
        ORDER by t.created_at DESC 
    `
    if (limit) {
        query += `LIMIT $limit`
        params.limit = int(limit)
    }

    const res = await session.executeRead((tx: any) => {
        return tx.run(query, params)
    })
    let tweets = [];
    if (res.records.length > 0) {
        tweets = res.records.map((row: Record) => {
            return {
                tweet: row.get('t'),
                author: row.get('u'),
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


export async function getHomeTimelineTweetsNeo4j(
    username: string,
    limit: number | null = 100,
    orderBy: string = 'DESC',
    tags: Array<string> = [],
) {
    //THIS EXCLUDES RETWEETS RIGHT NOW
    const session = driver.session()
    // Create a node within a write transaction
    let params = { username: username, tags: tags }
    let ascQuery = `
    MATCH (timelineUser:User {username:$username})-[:HOMETIMELINE]->(t:Tweet)<-[:POSTED]-(u:User)
    OPTIONAL MATCH (t)-[r:REFERENCED]->(ref_t:Tweet)<-[:POSTED]-(ref_a:User)
    OPTIONAL MATCH (t)-[tr:INCLUDED]->(entity:Entity)-[:CATEGORY]-(d:Domain {name:"Unified Twitter Taxonomy"})
    OPTIONAL MATCH (t)-[mr:ATTACHED]->(media:Media)
    RETURN u,t, collect(r) as refTweetRels, collect(ref_t) as refTweets,
        collect(ref_a) as refTweetAuthors, collect(entity) as entities, collect(d) as domains,
        collect(media) as media, collect(mr) as mediaRels
    ORDER by t.created_at ASC`

    let descQuery = `
    MATCH (timelineUser:User {username:$username})-[:HOMETIMELINE]->(t:Tweet)<-[:POSTED]-(u:User)
    OPTIONAL MATCH (t)-[r:REFERENCED]->(ref_t:Tweet)<-[:POSTED]-(ref_a:User)
    OPTIONAL MATCH (t)-[tr:INCLUDED]->(entity:Entity)-[:CATEGORY]-(d:Domain {name:"Unified Twitter Taxonomy"})
    OPTIONAL MATCH (t)-[mr:ATTACHED]->(media:Media)
    RETURN u,t, collect(r) as refTweetRels, collect(ref_t) as refTweets,
        collect(ref_a) as refTweetAuthors, collect(entity) as entities, collect(d) as domains,
        collect(media) as media, collect(mr) as mediaRels
    ORDER by t.created_at DESC`
    let query: string;
    if (orderBy == "ASC") {
        query = ascQuery
    } else {
        query = descQuery
    }

    if (limit) {
        query += ` LIMIT $limit`
        params.limit = int(limit)
    }
    const res = await session.executeRead((tx: any) => {
        return tx.run(query, params)
    })
    let tweets = [];
    if (res.records.length > 0) {
        tweets = res.records.map((row: Record) => {
            return {
                tweet: row.get('t'),
                author: row.get('u'),
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

export async function numHomeTimelineTweetsIndexed(username: string) {
    const session = driver.session()
    let params = { username: username }
    let query = `
        MATCH (timelineUser:User {username:$username})-[:HOMETIMELINE]->(t:Tweet)<-[:POSTED]-(u:User)
        RETURN size(collect(t)) as numTweets
        `
    const res = await session.executeRead((tx: any) => {
        return tx.run(query, params)
    })
    let data;
    await session.close()
    return res.records[0].get("numTweets").toInt()
}


export async function homeTimelineEntityCounts(username: string) {
    const session = driver.session()
    let params = { username: username }
    let query = `
        MATCH (timelineUser:User {username:$username})-[:HOMETIMELINE]->(t:Tweet)<-[:POSTED]-(u:User)
        OPTIONAL MATCH (t)-[r:REFERENCED]->(ref_t:Tweet)<-[:POSTED]-(ref_a:User)
        OPTIONAL MATCH (t)-[tr:INCLUDED]->(entity:Entity)-[:CATEGORY]-(d:Domain {name:"Unified Twitter Taxonomy"})
        WITH collect(entity) as entities
        RETURN apoc.coll.frequencies(entities) as entityDistribution, size(entities) as numRecords
        `
    const res = await session.executeRead((tx: any) => {
        return tx.run(query, params)
    })
    let data;
    if (res.records.length == 1) {
        data = {
            "entityDistribution": res.records[0].get("entityDistribution").map((row) => ({ item: row.item, count: row.count.toInt() })),
            "numRecords": res.records[0].get("numRecords")
        }
    }
    await session.close()
    return data;
}

export async function getUser(uid: string) {
    const session = driver.session()
    // Create a node within a write transaction
    const res = await session.executeRead((tx: any) => {
        return tx.run(`
            MATCH (user:User {id: $uid})
            RETURN user
            `,
            { uid }
        )
    })
    let user;
    if (res.records.length == 1) {
        user = res.records[0].get("user")
    }
    await session.close()
    return user;
}