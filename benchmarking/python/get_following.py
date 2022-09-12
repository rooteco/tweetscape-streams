import time
from tweet_processing import get_user_following
from dotenv import load_dotenv
from twarc import Twarc2
import os 

load_dotenv()

print(
    dict(
    consumer_key=os.environ["consumer_key"],
    consumer_secret=os.environ["consumer_secret"],
    access_token=os.environ["access_token"],
    access_token_secret=os.environ["access_token_secret"]
    )
)

TWARC_CLIENT = Twarc2(
    consumer_key=os.environ["consumer_key"],
    consumer_secret=os.environ["consumer_secret"],
    access_token=os.environ["access_token"],
    access_token_secret=os.environ["access_token_secret"],
)

start = time.time()
df_following = get_user_following(
    TWARC_CLIENT, 
    "RhysLindmark")
end = time.time()
print(end-start, " seconds to run")