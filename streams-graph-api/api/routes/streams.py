import os
from random import seed
import time
from unicodedata import name
from flask import Blueprint, request, current_app
from twarc import Twarc2
from api.neo4j import get_driver

from py2neo import Node, Relationship
from flask import jsonify
from api.dao.users import UsersDao
from api.dao.streams import AlreadyExists, StreamsDao

stream_routes = Blueprint("streams", __name__, url_prefix="/api/streams")

@stream_routes.route('/create', methods=['POST'])
def create_stream():
    driver = get_driver()
    payload = request.get_json()
    if "current_user_data" not in payload:
        raise Exception("You need to send this shit or else") # TODO: actually handle
    current_user = payload["current_user_data"]
    if "name" not in payload or "startTime" not in payload or "endTime" not in payload:
        raise Exception("args name and created_by must be supplied") 
    payload["seedUsers"] = []
    stream_dao = StreamsDao(driver)
    try: 
        stream_dao.create_stream(
            payload["name"],
            payload["startTime"], 
            payload["endTime"],
            creator_data=current_user
        )
    except AlreadyExists as e:
        raise e # TODO: Actually handle this 
    except Exception as e:
        return "failed to create new stream", 400 # TODO: make this better, https://flask.palletsprojects.com/en/2.2.x/errorhandling/
    return {"stream": payload}

@stream_routes.route("/", methods=["GET"])
def get_streams():
    driver = get_driver()
    streams_dao = StreamsDao(driver)
    streams = streams_dao.all()
    return {
        "streams": streams
    }


@stream_routes.route("/<stream_name>", methods=["GET", "POST"])
def stream(stream_name):
    if request.method == "GET":
        driver = get_driver()
        streams_dao = StreamsDao(driver)
        stream, seed_users = streams_dao.get_stream(stream_name)  
        tweets = streams_dao.get_tweets(stream_name)
        return {
            "stream": stream, 
            "seedUsers": seed_users, 
            "tweets": tweets
        }
    elif request.method == "POST":
        payload = request.get_json()
        username = payload["username"]
        # current_user = payload["currentUser"]
        driver = get_driver()
        streams_dao = StreamsDao(driver)
        print(f"adding user {username} to stream {stream_name}")
        print("STARTING ADD SEED USER")
        start = time.time()
        streams_dao.add_seed_user(
            stream_name=stream_name, 
            username=username
        )
        end = time.time()
        print(end-start, " seconds to add a seed user to stream")
        return {
            "success": 1
        }

def node_to_dict(user):
    d = {}
    for k,v in user.items():
        d[k] = v 
    if "entities.description.cashtags" in d: 
        d.pop("entities.description.cashtags")
    if "entities.description.hashtags" in d:
        d.pop("entities.description.hashtags")
    return d
