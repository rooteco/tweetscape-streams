# Path: python/indexer_example.py

import os
from twarc import Twarc2
from indexer import pull_tweets
from indexer.user_service import UserService

from dotenv import load_dotenv
load_dotenv()

client = Twarc2(
    consumer_key=os.environ["consumer_key"], 
    consumer_secret=os.environ["consumer_secret"],
    access_token=os.environ["access_token"],
    access_token_secret=os.environ["access_token_secret"],
)

url = os.environ["NEO4J_URI"]
user = os.environ["NEO4J_USERNAME"]
password = os.environ["NEO4J_PASSWORD"]

user_service = UserService(url, user, password)
user = user_service.get_user("nicktorba")
print(user)

breakpoint()

# TODO Update pull_tweets to work with from_id and since_id instead of start date and end date

_, df_tweets, df_ref_tweets = pull_tweets(client, user["username"], from_id=user["latestTweetId"])

breakpoint()
print(df_tweets.head())
