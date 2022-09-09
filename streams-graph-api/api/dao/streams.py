import os
import json
from twarc import Twarc2
import pandas as pd
import time
from py2neo import Node
from py2neo.bulk import merge_nodes, merge_relationships
from tweet_processing import pull_tweets, get_user_following
from twarc_csv import DataFrameConverter

from dotenv import load_dotenv

load_dotenv()

from api.exceptions.notfound import NotFoundException


TWARC_CLIENT = Twarc2(
    consumer_key=os.environ["consumer_key"],
    consumer_secret=os.environ["consumer_secret"],
    access_token=os.environ["access_token"],
    access_token_secret=os.environ["access_token_secret"],
)

USER_FIELDS = ['id', 'created_at', 'username', 'name', 
'description', 
# 'entities.description.cashtags', 'entities.description.hashtags', 'entities.description.mentions', 'entities.description.urls', 'entities.url.urls', 
'location', 
# 'pinned_tweet_id', 
'profile_image_url', 'protected', 
'public_metrics.followers_count', 'public_metrics.following_count', 'public_metrics.listed_count', 'public_metrics.tweet_count', 'url', 'verified', 
# 'withheld.scope', 'withheld.copyright', 'withheld.country_codes'
]

TWEET_FIELDS = [
        'id', 
        'conversation_id', 
        'referenced_tweets.replied_to.id',
       'referenced_tweets.retweeted.id', 
       'referenced_tweets.quoted.id',
       'author_id', 
       'in_reply_to_user_id', 
       'retweeted_user_id',
       'quoted_user_id', 
       'created_at', 'text', 'lang', 'source',
       'public_metrics.like_count', 
       'public_metrics.quote_count',
       'public_metrics.reply_count', 
       'public_metrics.retweet_count',
       'reply_settings', 
       'possibly_sensitive', 'geo.coordinates.coordinates',
       'geo.coordinates.type', 'geo.country', 'geo.country_code',
       'geo.full_name', 'geo.geo.bbox', 'geo.geo.type', 'geo.id', 'geo.name',
       'geo.place_id', 'geo.place_type', 
       'tweet_type', 'tweet_link', 
       ]

def get_flat_mentions(mention_list):
    mentions = []
    for i in mention_list:
        if isinstance(i, str):
            i_mentions = json.loads(i)
            [i.pop("end") if "end" in i else i for i in i_mentions]
            [i.pop("start") if "start" in i else i for i in i_mentions]
            mentions.append(DataFrameConverter("users").process(i_mentions)[USER_FIELDS].to_dict("records"))
        else:
            mentions.append([])
    return mentions

class AlreadyExists(Exception):
    def __init__(self, message):
        self.message=message

class StreamsDao:
    """
    The constructor expects an instance of the Neo4j Driver, which will be
    used to interact with Neo4j.
    """
    def __init__(self, driver):
        self.driver = driver

    """
     This method should return a paginated list of movies ordered by the `sort`
     parameter and limited to the number passed as `limit`.  The `skip` variable should be
     used to skip a certain number of rows.

     If a user_id value is suppled, a `favorite` boolean property should be returned to
     signify whether the user has added the movie to their "My Favorites" list.
    """

    def get_stream(self, stream_name: str):
        """
        Return None if stream does not exist 
        Return dict with fields if it does
        """
        def get_stream(tx, name):
            cypher = """
                MATCH (s:Stream {name: $name} )
                RETURN s
            """
            result = tx.run(cypher, name=name).single()
            if result is None:
                return None
            return result.data()["s"]
        def get_stream_seed_users(tx, name):
            cypher = """
                MATCH (s:Stream {name: $name} )-[:CONTAINS]->(u:User)
                RETURN u
            """
            result = tx.run(cypher, name=name)
            if result is None:
                return None
            return [row.get("u") for row in result.data()]

        with self.driver.session() as session:
            stream = session.read_transaction(get_stream, stream_name)
            seed_users = session.read_transaction(get_stream_seed_users, stream_name)
            if len(seed_users)>0:
                seed_users = pd.DataFrame(seed_users)[USER_FIELDS].to_dict("records")
            return stream, seed_users

    def create_stream(self, stream_name:str, start_time:str, end_time:str, creator_data:dict):
        def add_stream(tx, stream_data, creator_username):
            cypher = """
                MATCH (u:User {username: $creator_username}) 
                MERGE (s:Stream {name: $stream_data.name})
                SET s = $stream_data
                MERGE (u)-[:CREATED]->(s)
                RETURN s
            """
            return tx.run(cypher, stream_data=stream_data, creator_username=creator_username)
            # return [row.value("stream") for row in result]
        user = self.create_user(user=creator_data)
        ## Check if stream with name already exists
        stream, _ = self.get_stream(stream_name)
        if stream:
            raise AlreadyExists(f"stream with name '{stream_name}' already exists")
        else: 
            with self.driver.session() as session: 
                return session.write_transaction(
                    add_stream, 
                    dict(name=stream_name, start_time=start_time, end_time=end_time), 
                    creator_username=creator_data["username"]
                )

    def create_user(self, username=None, user=None):
        def create_user_cypher(tx, username, user_data):
            cypher = """
            MERGE (u:User {username: $username})
            SET u = $user_data
            RETURN u
            """
            result = tx.run(cypher, username=username, user_data=user_data).single()
            return result.data().get("u")
        if user is None:
            user_gen = TWARC_CLIENT.user_lookup([username], usernames=True)
            res = next(user_gen)
            user = DataFrameConverter("users").process(res["data"])[USER_FIELDS].to_dict("records")[0]
        else: 
            user = DataFrameConverter("users").process([user])[USER_FIELDS].to_dict("records")[0]
        with self.driver.session() as session: 
            user = session.write_transaction(create_user_cypher, username=user["username"], user_data=user)
            return user

    def get_user(self, username, create_if_nonexistent=True):
        def get_user_cypher(tx, username):
            cypher = """
            MATCH (u:User {username: $username})
            RETURN u
            """
            result = tx.run(cypher, username=username).single()
            if result is None:
                return None
            return result.data().get("u")
        with self.driver.session() as session: 
            user = session.read_transaction(get_user_cypher, username=username)
        if user is None and create_if_nonexistent:
            return self.create_user(username)
        else: 
            return user

    def get_tweets(self, stream_name:str):
        def cypher(tx, stream_name):
            query="""
            MATCH (s:Stream {name: $stream_name})-[:CONTAINS]->(u:User)-[:POSTED]->(t:Tweet) RETURN t
            """
            result = tx.run(query, stream_name=stream_name)
            data = result.data()
            if len(data) == 0:
                return []
            df = pd.DataFrame([row.get("t") for row in data])
            df.fillna(0, inplace=True)
            return df[TWEET_FIELDS].to_dict("records")
        
        with self.driver.session() as session:
            tweets = session.read_transaction(cypher, stream_name)
            return tweets

    def add_seed_user(self, stream_name, username):
        def add_seed_user_cypher(tx, stream_name, username):
            cypher = """
                MATCH (u:User {username: $username}) 
                MATCH (s:Stream {name: $stream_name})
                MERGE (s)-[:CONTAINS]->(u)
                RETURN s,u
            """
            return tx.run(cypher, stream_name=stream_name, username=username)
        stream, seed_users = self.get_stream(stream_name)
        if stream is None:
            raise Exception(f"stream '{stream_name}' not found...")
        user = self.get_user(username, create_if_nonexistent=True)
        if user is None: 
            raise Exception(f"No user in graph with username '{username}'")
        ## FOLLOWS
        """
        if follows not in graph:
            pull_follows from twitter
            push to graph
        """
        follows = self.get_saved_follows(user["username"])
        if len(follows) != user["public_metrics.following_count"]:
            print(f'our graph shows {len(follows)} accounts followed, but user object shows {user["public_metrics.following_count"]}, UPDATING')
            self.add_users_followed_by(user)
    
        ## Tweets
        """
        if user tweets not in graph (kinda hard to check)
            pull tweets from twitter 
            push to graph
        """
        start = time.time()
        self.add_user_tweets(user, start_time=stream["start_time"], end_time=stream["end_time"])
        end = time.time()
        print(end-start, " seconds to add user tweets")
        with self.driver.session() as session: 
            return session.write_transaction(add_seed_user_cypher, stream_name=stream_name, username=username)

    def add_user_tweets(self, user, start_time, end_time):
        def prepare_tweet_df(df_tweets_in_func):
            if "" in df_tweets_in_func.columns: 
                df_tweets_in_func.drop([""], axis=1, inplace=True)
            if "created_at.hour" in df_tweets_in_func.columns:
                df_tweets_in_func.drop(["created_at.hour"], axis=1, inplace=True)
            df_tweets_in_func["created_at"] = df_tweets_in_func["created_at"].map(lambda x: x.isoformat())
            author_cols = [i for i in df_tweets_in_func.columns if i.startswith("author.")]
            author_df = df_tweets_in_func[author_cols]
            author_cols_rename = {}
            for i in author_cols:
                ind = i.find(".")
                author_cols_rename[i] = i[ind+1:]
            author_df.rename(columns=author_cols_rename, inplace=True)
            authors = author_df[USER_FIELDS].to_dict("records")
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
        def cypher(tx, tweets):
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
            return tx.run(importQuery, tweets=tweets)

        _, df_tweets, df_ref_tweets = pull_tweets(
            TWARC_CLIENT, 
            username=user["username"], 
            start_time=start_time, 
            end_time=end_time
        )
        tweets_obj = prepare_tweet_df(df_tweets)
        ref_tweets_obj = prepare_tweet_df(df_ref_tweets)
        with self.driver.session() as session: 
            res1 = session.write_transaction(cypher, tweets=tweets_obj)
            res2 = session.write_transaction(cypher, tweets=ref_tweets_obj)
        return (res1, res2)        

    def add_user_node(self, user_data):
        user = Node("TwitterUser", **user_data)
        self.graph.merge(user, "TwitterUser", "username")
        return user

    def get_saved_follows(self, username):
        def get_user_follows(tx, username):
            cypher = """
            MATCH (u:User {username: $username})-[:FOLLOWS]->(uf:User) RETURN uf
            """ 
            result = tx.run(cypher, username=username)
            return [row.get("uf") for row in result.data()]
        with self.driver.session() as session: 
            return session.read_transaction(get_user_follows, username=username)

    def add_users_followed_by(self, user_node):
        def import_follows(tx,users):
            cypher = """
            UNWIND $users AS u
            WITH u.follower as follower,
                u.followed as followed
            MATCH (followerUser:User {username: follower.username})
            MERGE (followedUser:User {username: followed.username})
            SET followedUser = followed
            MERGE (followerUser)-[r:FOLLOWS]->(followedUser)
            RETURN r
            """
            return tx.run(cypher, users=users)

        df_following = get_user_following(TWARC_CLIENT, user_node.get("username"))
        records = df_following[USER_FIELDS].to_dict("records")
        follows = []
        for i in records: 
            n = {}
            n["follower"] = {"username": user_node.get("username")}
            n["followed"] = i 
            follows.append(n)
        ## WRITE FOLLOWS
        with self.driver.session() as session: 
            start = time.time()
            follows_result = session.write_transaction(import_follows, users=follows)
            end = time.time()
            print(end - start, " seoncds to write follows to neo4j")

    
    def add_tweets_from(self, userNode):
        username, df_tweets, df_ref_tweets = pull_tweets(
            TWARC_CLIENT, userNode.get("username"), 
            extract_features=True, 
            max_tweets=100, start_time=None, end_time=None
        )

        records = df_tweets[tweet_fields].to_dict("records")
        print(f"merging {len(records)} tweets tweeted by {userNode.get('username')}")
        merge_nodes(self.graph.auto(), records, ("Tweet", "id"))

        tweet_rel_data = []
        for i_record in records:
            tweet_rel_data.append(
                [
                    userNode.get("username"),
                    {},
                    i_record["id"]
                ]
            )
        print(f"merging {len(tweet_rel_data)} tweet relationships for {userNode.get('username')}")
        merge_relationships(
            self.graph.auto(),
            tweet_rel_data,
            "TWEETED",
            start_node_key=("TwitterUser", "username"),
            end_node_key=("Tweet", "id")
        )

    def get_user_tweets(self, userNode):
        tweets_query = f"""
        MATCH (tweet:Tweet )<-[f:TWEETED]-(user:TwitterUser {{username: '{userNode.get("username")}'}})
        RETURN user
        """ 
        tweets = self.graph.run(tweets_query)
        return tweets.data()

    def all(self):
        """
        Return None if stream does not exist 
        Return dict with fields if it does
        """
        def get_streams(tx):
            cypher = """
                MATCH (s:Stream )
                RETURN s
            """
            result = tx.run(cypher)
            return [row.get("s") for row in result.data()]

        with self.driver.session() as session:
            return session.read_transaction(get_streams)
