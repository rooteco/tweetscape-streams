import neo4j, { Driver } from 'neo4j-driver'
require('dotenv').config({ path: '.env.test' })

let driver: Driver;

const NEO4J_URI = process.env.NEO4J_URI as string;
const NEO4J_USERNAME = process.env.NEO4J_USERNAME as string;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD as string;

async function initDriver(uri: string, username: string, password: string) {
    driver = neo4j.driver(uri, neo4j.auth.basic(username, password))
    let notConnected = true;
    while (notConnected) {
        try {
            await driver.getServerInfo();
            notConnected = false;
        } catch (e) {
            console.log("Neo4j db not ready yet, sleeping for 2 seconds")
            console.log(e)
            await new Promise(r => setTimeout(r, 2000))
        }
    }
    return driver
}

export function closeDriver() {
    return driver && driver.close()
}

async function clearDB() {
    driver = await initDriver(
        NEO4J_URI,
        NEO4J_USERNAME,
        NEO4J_PASSWORD
    );
    const session = driver.session();
    await session.run("MATCH (n) DETACH DELETE n")
    await session.run("CALL apoc.schema.assert({},{},true) YIELD label, key RETURN *") // requires this config: NEO4J_dbms_security_procedures_unrestricted=apoc.*
    await closeDriver();
}

async function run() {
    driver = await initDriver(
        NEO4J_URI,
        NEO4J_USERNAME,
        NEO4J_PASSWORD
    );

    // ADD CONSTRAINTS, indices are auto-created for properties with unique constraints
    const session = driver.session();
    await session.run("CREATE CONSTRAINT ON (u:User) ASSERT u.username IS UNIQUE");
    await session.run("CREATE CONSTRAINT FOR (t:Tweet) REQUIRE t.id IS UNIQUE");
    await session.run("CREATE CONSTRAINT FOR (h:Hashtag) REQUIRE h.tag IS UNIQUE");
    await session.run("CREATE CONSTRAINT FOR (h:Cashtag) REQUIRE h.tag IS UNIQUE");
    await session.run("CREATE CONSTRAINT FOR (l:Link) REQUIRE l.url IS UNIQUE");
    await session.run("CREATE CONSTRAINT FOR (e:Entity) REQUIRE e.id IS UNIQUE");
    await session.run("CREATE CONSTRAINT FOR (m:Media) REQUIRE m.media_key IS UNIQUE"); // https://developer.twitter.com/en/docs/twitter-api/data-dictionary/object-model/media
    await session.run("CREATE CONSTRAINT FOR (s:Stream) REQUIRE s.name IS UNIQUE");

    // ADD INDEXES, TODO: investigate indexing strategy: https://neo4j.com/docs/cypher-manual/current/indexes-for-search-performance/
    await session.run("CREATE INDEX ON :User(id)");

    // ADD USERS CALL apoc.load.json("/seed-data/users.json")
    await session.executeWrite((tx: any) => {
        return tx.run(`
        CALL apoc.load.json("file:///seed-data/users.json") yield value
        unwind value as u
        MERGE (user:User {username: u.username})
        SET user.id = u.id,
            user.created_at = u.created_at,
            user.verified = u.verified,
            user.profile_image_url = u.profile_image_url,
            user.name = u.name,
            user.username = u.username,
            user.url = u.url,
            user.description = u.description,
            user.\`public_metrics.followers_count\`  = u.public_metrics.followers_count,
            user.\`public_metrics.following_count\`  = u.public_metrics.following_count,
            user.\`public_metrics.tweet_count\`  = u.public_metrics.tweet_count,
            user.\`public_metrics.listed_count\`  = u.public_metrics.listed_count
            RETURN user
            `
        )
    })

    // ADD TWEETS 
    await session.executeWrite((tx: any) => {
        return tx.run(`
            CALL apoc.load.json("file:///seed-data/tweets.json") yield value
            unwind value as userTweets
            unwind userTweets.data.data as t
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
                tweet.\`public_metrics.retweet_count\` = t.public_metrics.retweet_count,
                tweet.\`public_metrics.reply_count\` = t.public_metrics.reply_count,
                tweet.\`public_metrics.like_count\` = t.public_metrics.like_count,
                tweet.\`public_metrics.quote_count\` = t.public_metrics.quote_count
            
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

        `
        )
    })
    // ADD REF TWEETS
    await session.executeWrite((tx: any) => {
        return tx.run(`
            CALL apoc.load.json("file:///seed-data/tweets.json") yield value
            unwind value as userTweets
            unwind userTweets.data.includes.tweets as t
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
                tweet.\`public_metrics.retweet_count\` = t.public_metrics.retweet_count,
                tweet.\`public_metrics.reply_count\` = t.public_metrics.reply_count,
                tweet.\`public_metrics.like_count\` = t.public_metrics.like_count,
                tweet.\`public_metrics.quote_count\` = t.public_metrics.quote_count
            
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

        `
        )
    })

    // ADD MEDIA
    await session.executeWrite((tx: any) => {
        return tx.run(`
            CALL apoc.load.json("file:///seed-data/tweets.json") yield value
            unwind value as userTweets
            unwind userTweets.data.includes.media as m
            MERGE (mediaNode:Media {media_key: m.media_key})
            SET mediaNode = m
            RETURN mediaNode
        `)
    })

    // ADD STREAM


    await closeDriver();
}

clearDB()
    .then(() => {
        console.log("db cleared, now seeding");
        run()
    });
