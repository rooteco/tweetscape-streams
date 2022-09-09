"""
Taken from here: https://github.com/community-graph/twitter-import/blob/master/twitter-import.py
I had to dm fucking neo4j account to find this, but I think it's gonna really really really help 



"""
import os
import json
from dotenv import load_dotenv
from twarc import Twarc2
from twarc_csv import DataFrameConverter
import pandas as pd
from neo4j import GraphDatabase

from tweet_processing import pull_tweets

load_dotenv()

neo4jUrl = os.environ.get('NEO4J_URI')
neo4jUser = os.environ.get('NEO4J_USER',"neo4j")
neo4jPass = os.environ.get('NEO4J_PASSWORD',"test")
bearerToken = os.environ.get('TWITTER_BEARER',"")


twarc_client = Twarc2(
    consumer_key=os.environ["consumer_key"],
    consumer_secret=os.environ["consumer_secret"],
    access_token=os.environ["access_token"],
    access_token_secret=os.environ["access_token_secret"],
)

AUTHOR_FIELDS = [
    'id', 'created_at', 'username', 'name', 
    'description', 
    # 'entities.description.cashtags', 'entities.description.hashtags', 'entities.description.mentions', 'entities.description.urls', 'entities.url.urls', 
    'location', 'pinned_tweet_id', 'profile_image_url', 'protected', 
    'public_metrics.followers_count', 'public_metrics.following_count', 'public_metrics.listed_count', 'public_metrics.tweet_count', 'url', 'verified', 
    # 'withheld.scope', 'withheld.copyright', 'withheld.country_codes'
]

def get_flat_mentions(mention_list):
    mentions = []
    for i in mention_list:
        if isinstance(i, str):
            i_mentions = json.loads(i)
            [i.pop("end") if "end" in i else i for i in i_mentions]
            [i.pop("start") if "start" in i else i for i in i_mentions]
            mentions.append(DataFrameConverter("users").process(i_mentions)[AUTHOR_FIELDS].to_dict("records"))
        else:
            mentions.append([])
    return mentions

driver = GraphDatabase.driver(neo4jUrl, auth=(neo4jUser, neo4jPass))

with driver.session() as session: 

    # Add uniqueness constraints.
    session.run( "CREATE CONSTRAINT ON (t:Tweet) ASSERT t.id IS UNIQUE;")
    session.run( "CREATE CONSTRAINT ON (u:User) ASSERT u.screen_name IS UNIQUE;")
    session.run( "CREATE CONSTRAINT ON (h:Tag) ASSERT h.name IS UNIQUE;")
    session.run( "CREATE CONSTRAINT ON (l:Link) ASSERT l.url IS UNIQUE;")

    importQueryAllObjectAdded = """
    UNWIND {tweets} AS t
    WITH t
    ORDER BY t.id
    WITH t,
        t.entities AS e,
        t.user AS u,
        t.retweeted_status AS retweet

    MERGE (tweet:Tweet {id:t.id})
    SET tweet:Content, tweet.text = t.text,
        tweet.created = t.created_at,
        tweet.public_metrcis.like_count = t.public_metrics.like_count
    MERGE (user:User {user:t.author.username})
    SET user.name = t.author.name,
        user.location = t.author.location,
        user.followers = t.author.public_metrics.followers_count,
        user.following_count = t.author.public_metrics.following_count,
        user.public_metrics.tweet_count = t.author.public_metrics.tweet_count,
        user.profile_image_url = t.author.profile_image_url
    MERGE (user)-[:POSTED]->(tweet)
    FOREACH (h IN e.hashtags |
    MERGE (tag:Tag {name:LOWER(h.text)})
    MERGE (tag)<-[:TAGGED]-(tweet)
    )
    FOREACH (u IN e.urls |
    MERGE (url:Link {url:u.expanded_url})
    MERGE (tweet)-[:LINKED]->(url)
    )
    FOREACH (m IN e.user_mentions |
    MERGE (mentioned:User {screen_name:m.screen_name})
    ON CREATE SET mentioned.name = m.name
    MERGE (tweet)-[:MENTIONED]->(mentioned)
    )
    FOREACH (r IN [r IN [t.in_reply_to_status_id] WHERE r IS NOT NULL] |
    MERGE (reply_tweet:Tweet {id:r})
    MERGE (tweet)-[:REPLIED_TO]->(reply_tweet)
    )
    FOREACH (retweet_id IN [x IN [retweet.id] WHERE x IS NOT NULL] |
        MERGE (retweet_tweet:Tweet {id:retweet_id})
        MERGE (tweet)-[:RETWEETED]->(retweet_tweet)
    )
    """
    # Build query.
    importQuery = """
    UNWIND $tweets AS t
    WITH t.tweet as t,
        t.author as author,
        t.mentions as mentions
    ORDER BY t.id

    MERGE (tweet:Tweet {id: t.id})
    SET tweet = t

    MERGE (user:User {username: author.username})
    SET user = author  
    MERGE (user)-[:POSTED]->(tweet)

    FOREACH (m IN mentions |
        MERGE (mentioned:User {username:m.username})
        SET mentioned = m
        MERGE (tweet)-[:MENTIONED]->(mentioned)
    )
    """

    finishQuery = """
    SET tweet:Content, tweet.text = t.text,
        tweet.created_at = t.created_at,
        tweet.public_metrics_like_count = t['public_metrics.like_count'],
        tweet.public_metrics_quote_count = t['public_metrics.quote_count']
    MERGE (user:User {username:t.author.username})
    SET user.name = t.author.name,
        user.location = t.author.location,
        user.followers = t.author.public_metrics.followers_count,
        user.following_count = t.author.public_metrics.following_count,
        user.public_metrics_tweet_count = t.author.public_metrics.tweet_count,
        user.profile_image_url = t.author.profile_image_url

    MERGE (user)-[:POSTED]->(tweet)

    FOREACH (m IN mentions |
    MERGE (mentioned:User {username:m.username})
    ON CREATE SET mentioned.name = m.name
    MERGE (tweet)-[:MENTIONED]->(mentioned)
    )
    """

    # todo as params
    # q = urllib.quote_plus(os.environ.get("TWITTER_SEARCH",'neo4j OR "graph database" OR "graph databases" OR graphdb OR graphconnect OR @neoquestions OR @Neo4jDE OR @Neo4jFr OR neotechnology'))
    # maxPages = 20
    # catch_up = False
    # count = 100
    # result_type = "recent"
    # lang = "en"

    # since_id = -1
    # max_id = -1
    # page = 1


    _, df_tweets, df_ref_tweets = pull_tweets(twarc_client, username="nicktorba", extract_features=True, max_tweets=100) #, start_time=None, end_time=None):
    df_tweets["created_at"] = df_tweets["created_at"].map(lambda x: x.isoformat())

    # df_tweets.to_csv("localdffortest.csv", index=False)

    # df_tweets = pd.read_csv("localdffortest.csv")
    
    def prepare_tweet_df(df_tweets_in_func):
        if "" in df_tweets_in_func.columns: 
            df_tweets_in_func.drop([""], axis=1, inplace=True)
        df_tweets_in_func.drop(["created_at.hour"], axis=1, inplace=True)

        df_tweets_in_func["created_at"] = df_tweets_in_func["created_at"].map(lambda x: x.isoformat())

        author_cols = [i for i in df_tweets_in_func.columns if i.startswith("author.")]
        author_df = df_tweets_in_func[author_cols]
        author_cols_rename = {}
        for i in author_cols:
            ind = i.find(".")
            author_cols_rename[i] = i[ind+1:]
        author_df.rename(columns=author_cols_rename, inplace=True)
        authors = author_df[AUTHOR_FIELDS].to_dict("records")
        tweets = df_tweets_in_func.to_dict("records")

        mentions = get_flat_mentions(df_tweets_in_func["entities.mentions"].tolist())

        tweets_obj = []
        for tweet, author, i_mentions in zip(tweets, authors, mentions):
            tweets_obj.append({
                "tweet": tweet, 
                "author": author, 
                "mentions": i_mentions
            })
        return tweets_obj

    tweets_obj = prepare_tweet_df(df_tweets)
    ref_tweets_obj = prepare_tweet_df(df_ref_tweets)

    # result = session.run(importQuery,tweets=tweets_obj)
    # print("I RAN THIS SHIT..")
    # print(result)
    # print(result.consume().counters)
    result = session.run(importQuery,tweets=ref_tweets_obj)
    print("I RAN THIS SHIT..")
    print(result)
    print(result.consume().counters)

def get_tweets(tx,):
    result =  tx.run("""
        MATCH (t:Tweet)
        RETURN t
    """)
    return [row for row in result]

def get_tweets_from_user(tx, username):
    query = """
    MATCH (tweet:Tweet)<-[:POSTED]-(user:User {username: "nicktorba"})
    RETURN tweet
    """
    return [row for row in result]

with driver.session() as session: 
    # Execute get_movies within a Read Transaction
    res = session.read_transaction(get_tweets)
    
