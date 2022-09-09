

import os
import json
from dotenv import load_dotenv
from twarc import Twarc2
from twarc_csv import DataFrameConverter
import pandas as pd
from neo4j import GraphDatabase

from api.dao.streams import StreamsDao
from tweet_processing import pull_tweets, get_time_interval

load_dotenv()

neo4jUrl = os.environ.get('NEO4J_URI')
neo4jUser = os.environ.get('NEO4J_USER',"neo4j")
neo4jPass = os.environ.get('NEO4J_PASSWORD',"test")
bearerToken = os.environ.get('TWITTER_BEARER',"")

current_user = {
    "pinned_tweet_id": "1499774239922130946",
    "verified": False,
    "created_at": "2016-11-29T20:14:22.000Z",
    "description": "everywhere I go, there I am | building @TweetscapeHQ | hanging @roote_ | writing https://t.co/PBxsLBeEAO | reading https://t.co/n6w8cS8mcD",
    "profile_image_url": "https://pbs.twimg.com/profile_images/1375548941538750465/kjPxgiWX_normal.jpg",
    "public_metrics.listed_count": 8,
    "url": "https://t.co/C8yIPStHx3",
    "public_metrics.following_count": 539,
    "protected": False,
    "public_metrics.followers_count": 274,
    "name": "Nick Torba",
    "location": "Philadelphia, PA",
    "id": "803693608419422209",
    "public_metrics.tweet_count": 4120,
    "username": "nicktorba"
}

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
       'tweet_type', 'tweet_link', 'created_at.hour']

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

def create_stream(stream_name, seed_users):
    driver = GraphDatabase.driver(neo4jUrl, auth=(neo4jUser, neo4jPass))
    streams_dao = StreamsDao(driver)
    end_time, start_time = get_time_interval(24*7)
    streams_dao.create_stream(
        stream_name=stream_name, 
        start_time=start_time, 
        end_time=end_time, 
        creator_data=current_user
    )
    for seed_user in seed_users:
        streams_dao.add_seed_user(
            stream_name, 
            seed_user
        )

create_stream("seeded-stream8", ["nicktorba", "j0lian"])