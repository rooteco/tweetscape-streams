import os
from turtle import end_fill
import pandas as pd 
from twarc import Twarc2
from twarc_csv import DataFrameConverter
from dotenv import load_dotenv
from py2neo import Node, Relationship, Graph
from py2neo.bulk import merge_nodes, merge_relationships

from tweet_processing import pull_tweets

def get_user_following(client, username):
    """
    
    """
    print(f"fetching accounts followed by {username}")
    dfs = []
    for res in client.following(username):
        dfs.append(DataFrameConverter("users").process(res["data"]))
    df_following = pd.concat(dfs)
    df_following["referencer.username"] = username
    return df_following

load_dotenv()

graph = Graph(os.getenv("NEO4J_URI"), auth=(os.getenv("NEO4J_USERNAME"), os.getenv("NEO4J_PASSWORD")))

twarc_client = Twarc2(
    consumer_key=os.environ["consumer_key"], 
    consumer_secret=os.environ["consumer_secret"],
    access_token=os.environ["access_token"],
    access_token_secret=os.environ["access_token_secret"],
)

user_fields = [
    'id', 
    'created_at', 
    'username', 
    'name', 
    'description',
    'entities.description.cashtags', 
    'entities.description.hashtags',
    'entities.description.mentions', 
    'entities.description.urls',
    'entities.url.urls', 
    'location', 
    'pinned_tweet_id', 
    'profile_image_url',
    'protected',
    'public_metrics.followers_count',
    'public_metrics.following_count', 
    'public_metrics.listed_count',
    'public_metrics.tweet_count', 
    'url',
    'verified', 
]

tweet_fields = [
        'id', 'conversation_id', 'referenced_tweets.replied_to.id',
       'referenced_tweets.retweeted.id', 'referenced_tweets.quoted.id',
       'author_id', 'in_reply_to_user_id', 'retweeted_user_id',
       'quoted_user_id', 'created_at', 'text', 'lang', 'source',
       'public_metrics.like_count', 'public_metrics.quote_count',
       'public_metrics.reply_count', 'public_metrics.retweet_count',
       'reply_settings', 'possibly_sensitive', 
       'entities.annotations',
       'entities.cashtags', 'entities.hashtags', 'entities.mentions',
       'entities.urls', 'context_annotations', 'attachments.media',
       'attachments.media_keys', 'attachments.poll.duration_minutes',
       'attachments.poll.end_datetime', 'attachments.poll.id',
       'attachments.poll.options', 'attachments.poll.voting_status',
       'attachments.poll_ids', 'author.id', 'author.created_at',
       'author.username', 'author.name', 'author.description',
       'author.entities.description.cashtags',
       'author.entities.description.hashtags',
       'author.entities.description.mentions',
       'author.entities.description.urls', 'author.entities.url.urls',
       'author.location', 'author.pinned_tweet_id', 'author.profile_image_url',
       'author.protected', 'author.public_metrics.followers_count',
       'author.public_metrics.following_count',
       'author.public_metrics.listed_count',
       'author.public_metrics.tweet_count', 'author.url', 'author.verified',
       'author.withheld.scope', 'author.withheld.copyright',
       'author.withheld.country_codes', 'geo.coordinates.coordinates',
       'geo.coordinates.type', 'geo.country', 'geo.country_code',
       'geo.full_name', 'geo.geo.bbox', 'geo.geo.type', 'geo.id', 'geo.name',
       'geo.place_id', 'geo.place_type', 'entities.mentions.usernames',
       'entities.mentions.num_mentions', 'entities.mentions.double_mention',
       'tweet_type', 'tweet_link', 'created_at.hour']

# Add me 
seed_user = "nicktorba"
res = twarc_client.user_lookup(users=[seed_user], usernames=True)
user = next(res)
user_fields = DataFrameConverter("users").process(user["data"])[user_fields].to_dict("records")[0]

## Commit to graph
res = merge_nodes(graph.auto(), [user_fields], ("TwitterUser", "username"))
user_data = graph.nodes.match("TwitterUser", username=seed_user).all()
assert len(user_data) == 1
nt_user = user_data[0]
assert nt_user.get("username") == seed_user

## TODO:
## Add who I am following
def add_users_followed_by(user_node, accounts_followed_df):
    query_template = """
    MATCH
        (a:TwitterUser),
        (b:TwitterUser)
    WHERE a.name = 'A' AND b.name = 'B'
    CREATE (a)-[r:RELTYPE]->(b)
    RETURN type(r)
    """
    records = accounts_followed_df[user_fields].to_dict("records")
    print("running merge_nodes")
    print(f"merging {len(records)} accounts followed by {user_node.get('username')}")
    merge_nodes(graph.auto(), records, ("TwitterUser", "username"))#, labels={"TwitterUser"})
    print("ending merge_nodes")

    relationship_data = []
    for i_record in records: 
        relationship_data.append(
            [
                user_node.get("username"),
                {},
                i_record["username"]
            ]
        )
    print("running merge_relationships")
    merge_relationships(
        graph.auto(),
        relationship_data,
        "FOLLOWS",
        start_node_key=("TwitterUser", "username"), 
        end_node_key=("TwitterUser", "username")
    )
    print("ending merge_relaiontships")

nt_following = get_user_following(twarc_client, seed_user)

add_users_followed_by(nt_user, nt_following)

# seed_user_following_query = f"""
# MATCH (:TwitterUser {{username: '{seed_user}'}})-->(followed:TwitterUser)
# RETURN followed
# """

seed_user_following_query = f"""
MATCH (followedUsers:TwitterUser )<-[f:FOLLOWS]-(follower:TwitterUser {{username: '{seed_user}'}})
RETURN followedUsers
"""

seed_user_following = graph.run(seed_user_following_query)

assert len(seed_user_following.data()) == nt_following.shape[0]

### Store User Tweets
username, df_tweets, df_ref_tweets = pull_tweets(twarc_client, seed_user, extract_features=True, max_tweets=100, start_time=None, end_time=None)
records = df_tweets[tweet_fields].to_dict("records")
print(f"merging {len(records)} tweets tweeted by {seed_user}")
merge_nodes(graph.auto(), records, ("Tweet", "id"))
print("done merging tweet nodes")

tweet_data = []
for i_record in records:
    tweet_data.append(
        [
            seed_user,
            {},
            i_record["id"]
        ]
    )
print("merging tweet relationships")
merge_relationships(
    graph.auto(),
    tweet_data,
    "TWEETED",
    start_node_key=("TwitterUser", "username"),
    end_node_key=("Tweet", "id")
)
print("done merging tweet relationships")

seed_user_tweets_query = f"""
MATCH (tweet:Tweet )<-[f:TWEETED]-(user:TwitterUser {{username: '{seed_user}'}})
RETURN user
"""

seed_user_tweets = graph.run(seed_user_tweets_query)
assert len(seed_user_tweets.data()) == df_tweets.shape[0]

## Create 2 streams

from tweet_processing import get_time_interval
end_time, start_time = get_time_interval(24*7)

payload1 = dict(
    name="stream1",
    createdAt=end_time,
    start_time=start_time,
    end_time=end_time
)
payload2 = dict(
    name="stream2",
    createdAt=end_time,
    start_time=start_time,
    end_time=end_time
)
stream1 = Node("Stream", **payload1)
stream2 = Node("Stream", **payload2)
graph.merge(stream1,"Stream", "name")
graph.merge(stream2,"Stream", "name")



## Add users to stream
## Get users tweets for stream
## add referenced tweets
## parse entities

## PUT API ON TOP OF THAT AND SHOW IT OFF IN REMIX LET'S FUGGIN GO
