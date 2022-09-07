import os
import pandas as pd 
from twarc import Twarc2
from twarc_csv import DataFrameConverter
from dotenv import load_dotenv
from py2neo import Node, Relationship, Graph

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

# Add me 
seed_user = "nicktorba"
res = twarc_client.user_lookup(users=[seed_user], usernames=True)
user = next(res)
user_fields = DataFrameConverter("users").process(user["data"])[user_fields].to_dict("records")[0]

## Commit to graph
tx = graph.begin()
g_user = Node("TwitterUser", **user_fields)
tx.create(g_user)
graph.commit(tx)
assert graph.exists(g_user)

nt_user = graph.nodes.match("TwitterUser", username="nicktorba").first()

## TODO:
## Add who I am following
def add_users_followed_by(user_node, accounts_followed_df):
    print(user_node)
    FOLLOWS = Relationship.type("FOLLOWS")
    records = accounts_followed_df[user_fields].to_dict("records")
    tx = graph.begin()
    for num, i_user in enumerate(records):
        followed_user = Node("TwitterUser",**i_user)
        print(num)
        follows = FOLLOWS(user_node, followed_user)
        tx.create(followed_user)
        tx.create(follows)
    graph.commit(tx)

nt_following = get_user_following(twarc_client, "nicktorba")

add_users_followed_by(nt_user, nt_following)

all_nodes = graph.nodes.match("TwitterUser")

print(len(all_nodes))
## Create a stream
## Add users to stream
## Get users tweets for stream
## add referenced tweets
## parse entities

## PUT API ON TOP OF THAT AND SHOW IT OFF IN REMIX LET'S FUGGIN GO
