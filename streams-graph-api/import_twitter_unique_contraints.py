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

driver = GraphDatabase.driver(neo4jUrl, auth=(neo4jUser, neo4jPass))

with driver.session() as session: 

    # Add uniqueness constraints.
    session.run( "CREATE CONSTRAINT ON (t:Tweet) ASSERT t.id IS UNIQUE;")
    session.run( "CREATE CONSTRAINT ON (u:User) ASSERT u.screen_name IS UNIQUE;")
    session.run( "CREATE CONSTRAINT ON (h:Tag) ASSERT h.name IS UNIQUE;")
    session.run( "CREATE CONSTRAINT ON (l:Link) ASSERT l.url IS UNIQUE;")
