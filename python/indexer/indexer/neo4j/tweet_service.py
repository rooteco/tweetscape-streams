from neo4j import GraphDatabase


class TweetService:
    # built from this example: https://neo4j.com/docs/api/python-driver/current/ 

    def __init__(self, uri, user, password):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        # Don't forget to close the driver connection when you are finished with it
        self.driver.close()

    def write_hometimeline_tweets(self, tweets, user_id): 
        with self.driver.session() as session:
            return session.write_transaction(self._write_hometimeline_tweets, tweets, user_id)
            
    @staticmethod
    def _write_hometimeline_tweets(tx, tweets, user_id):
        query = """ 
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
        """
        result = tx.run(query, **{ "tweets": tweets, "timelineUserId": user_id })
        result = [i["tweet"] for i in result]
        return result


# async function addHomeTimelineTweets(tweets: any, timelineUser: any) {
#   // Same as addTweetsFrom in models/streams.server.ts, except we are adding a [:HOMETIMLINE] edge for the timelineUser for each of the tweets
#   const session = driver.session()
#   // Create a node within a write transaction
#   console.log(`adding ${tweets.length} tweets to homeTimeline for ${timelineUser.username}`)
#   const res = await session.executeWrite((tx: any) => {
#     return tx.run(`
#           UNWIND $tweets AS t
#           MERGE (tweet:Tweet {id: t.id})
#           SET tweet.id = t.id,
#               tweet.conversation_id = t.conversation_id,
#               tweet.possibly_sensitive = t.possibly_sensitive,
#               tweet.in_reply_to_user_id = t.in_reply_to_user_id,
#               tweet.lang = t.lang,
#               tweet.text = t.text,
#               tweet.created_at = t.created_at,
#               tweet.reply_settings = t.reply_settings,
#               tweet.author_id = t.author_id

#           MERGE (user:User {id: t.author_id})
#           MERGE (user)-[:POSTED]->(tweet)

#           MERGE (timelineUser:User {id: $timelineUserId})
#           MERGE (timelineUser)-[:HOMETIMELINE]->(tweet)

#           FOREACH (m IN t.entities.mentions |
#               MERGE (mentioned:User {username:m.username})
#               MERGE (tweet)-[:MENTIONED]->(mentioned)
#           )
#           FOREACH (u IN t.entities.urls |
#               MERGE (url:Link {url:u.expanded_url})
#               MERGE (tweet)-[:LINKED]->(url)
#           )
#           FOREACH (a IN t.entities.annotations |
#               MERGE (annotation:Annotation {probability:a.probability, type:a.type, normalized_text:a.normalized_text})
#               MERGE (tweet)-[:ANNOTATED]->(annotation)
#           )
#           FOREACH (ca IN t.context_annotations |
#               MERGE (domain:Domain {id: ca.domain.id})
#               SET domain = ca.domain
#               MERGE (entity:Entity {id: ca.entity.id})
#               SET entity = ca.entity
#               MERGE (tweet)-[:INCLUDED]->(entity)
#               MERGE (entity)-[:CATEGORY]-(domain)
#           )
#           FOREACH (h IN t.entities.hashtags |
#               MERGE (hashtag:Hashtag {tag:h.tag})
#               MERGE (tweet)-[:TAG]->(hashtag)
#           )
#           FOREACH (c IN t.entities.cashtags |
#               MERGE (cashtag:Cashtag {tag:c.tag})
#               MERGE (tweet)-[:TAG]->(cashtag)
#           )
#           FOREACH (a IN t.attachments |
#               FOREACH (media_key in a.media_keys |
#                   MERGE (media:Media {media_key:media_key})
#                   MERGE (tweet)-[:ATTACHED]->(media)
#               )
#           )
#           FOREACH (r IN t.referenced_tweets |
#               MERGE (ref_t:Tweet {id:r.id})
#               MERGE (tweet)-[:REFERENCED{type:r.type}]->(ref_t)
#           )
#           RETURN tweet
#           `,
#       { tweets: tweets, timelineUserId: timelineUser.id }
#     )
#   })
#   const tweetsSaved = res.records.map((row: any) => {
#     return row.get("tweet")
#   })
#   await session.close()
#   return tweetsSaved;
# };
