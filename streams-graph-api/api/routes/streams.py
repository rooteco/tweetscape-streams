import os
from flask import Blueprint, request, current_app
from twarc import Twarc2

from py2neo import Node, Relationship
from flask import jsonify
from api.dao.users import UsersDao

stream_routes = Blueprint("streams", __name__, url_prefix="/api/streams")

@stream_routes.route('/create', methods=['POST'])
def create_stream():
    g = current_app.graph
    payload = request.get_json()
    print("PAYLOAD")
    print(payload)
    if "name" not in payload or "createdBy" not in payload or "startTime" not in payload or "endTime" not in payload:
        raise Exception("args name and created_by must be supplied") 
    payload["seedUsers"] = []
    stream = Node("Stream", **payload)
    if g.exists(stream):
        raise Exception(f"stream '{stream.get('name')}' already exists")
    g.merge(stream,"Stream", "name")

    CREATED = Relationship.type("CREATED")
    user = g.nodes.match("TwitterUser", username=payload.get("created_by")).first()
    r = CREATED(stream, user)
    g.merge(r)
    return {"stream": node_to_dict(stream)}

@stream_routes.route("/", methods=["GET"])
def get_streams():
    g = current_app.graph    
    streams = g.nodes.match("Stream").all()
    return {
        "streams": [node_to_dict(i) for i in streams]
    }

@stream_routes.route("/<stream_name>/<username>", methods=["GET"])
def add_seed_user(stream_name, username):
    g = current_app.graph    
    stream = g.nodes.match("Stream", name=stream_name).first()
    userNode = g.nodes.match("TwitterUser", username=username).first()

    if not userNode: 
        users = UsersDao(g)
        userNode = users.add_full_user(username)
    print("FUCKKKK")
    user_dict = node_to_dict(userNode)
    user_dict.pop("entities.description.cashtags")
    user_dict.pop("entities.description.hashtags")
    print({
        "data": {
            "stream": node_to_dict(stream), 
            "user": user_dict
        }
    })
    return {
        "stream": node_to_dict(stream), 
        "user": user_dict
    }


@stream_routes.route("/<stream_name>", methods=["GET"])
def get_stream(stream_name):
    g = current_app.graph    
    stream = g.nodes.match("Stream", name=stream_name).first()

    # seed_users = g.nodes.m

    if stream:
        return {
            "stream": node_to_dict(stream)
        }
    else: 
        return {"stream": None}

def node_to_dict(user):
    d = {}
    for k,v in user.items():
        d[k] = v 
    return d
