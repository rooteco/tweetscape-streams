import os
import pandas as pd
import json
import concurrent.futures
from datetime import datetime, timedelta, timezone
from tqdm import tqdm
from requests.exceptions import HTTPError
import click
from twarc import Twarc2
from twarc_csv import DataFrameConverter

from dotenv import load_dotenv

load_dotenv()

converter = DataFrameConverter("users", allow_duplicates=True)

def lookup_users_by_username(client, usernames): 
    def hit_twitter():
        user_gen = client.user_lookup(users=usernames, usernames=True)
        df_users = None
        for res in user_gen:
            if "errors" in res:
                return res
            df_next = converter.process(res["data"])
            if df_users is None:
                df_users = df_next
            else: 
                df_users = pd.concat([df_users, df_next])
        return df_users
    df_users = None
    retries = 5
    while retries: 
        try: 
            df_users = hit_twitter()
        except HTTPError as err: 
            retries -= 1
            print(f"{retries} retries left")
        else: 
            break
    return df_users
                

