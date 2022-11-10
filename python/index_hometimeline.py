





import os
import requests
from twarc import Twarc2
from twarc_csv import DataFrameConverter
from indexer.auth_tokens import get_user_tokens
from indexer.neo4j.tweet_service import TweetService
from datetime import timedelta
from dotenv import load_dotenv
load_dotenv()


def refresh_token(access_token, rt):
    """
    https://developer.twitter.com/en/docs/authentication/oauth-2-0/user-access-token#:~:text=A%20refresh%20token%20allows%20an,form%2Durlencoded%20via%20a%20header.
    """
    
    auth = f"Bearer {access_token}"
    client = requests.Session()
    client.headers.update({"Authorization": auth})
    client.headers.update({'Content-Type': 'application/x-www-form-urlencoded'})
    token_res = client.post('https://api.twitter.com/2/oauth2/token', 
        dict(
            refresh_token=rt,
            grant_type= 'refresh_token',
            client_id=os.environ["consumer_key"],
            client_secret=os.environ["consumer_secret"],
        )
    )
    breakpoint()
    print(token_res)

url = os.environ["NEO4J_URI"]
user = os.environ["NEO4J_USERNAME"]
password = os.environ["NEO4J_PASSWORD"]


## Pull User access token from postgres
# TODO: refresh this token.. (the app does this automatically, but this script does not)
user_id = "803693608419422209"
user_token = get_user_tokens(user_id)
expires_at = (user_token.updated_at + timedelta(seconds=7200))

# TODO: use the expires at value to decide if we should refresh
# refresh_token
# const expiration = token.updated_at.valueOf() + token.expires_in * 1000;

refresh_token(user_token.access_token, user_token.refresh_token)

client = Twarc2(
    access_token=user_token.access_token,
    user_auth=True
)

## define the tweet service we will use to write tweets to neo4j
tweet_service = TweetService(url, user, password)

# Use twarc to create generator of returned tweets (100 tweets in each batch)
# TODO: add some customization to this (similar to indexer.twitter.tweet_processing.pull_tweets)
for res in client.timeline_reverse_chrono(user_id): 
    # write tweets to Neo4j
    res = tweet_service.write_hometimeline_tweets(res["data"], user_id)
    print(res)