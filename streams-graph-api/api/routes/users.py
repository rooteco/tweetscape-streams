import os
from flask import Blueprint, request, current_app
from twarc import Twarc2

from py2neo import Node
from py2neo.bulk import merge_nodes
from flask import jsonify

user_routes = Blueprint("users", __name__, url_prefix="/api/users")

@user_routes.route('/create', methods=['POST'])
def create_user():
    g = current_app.graph
    payload = request.get_json()
    user = Node("User", **payload)
    g.merge(user,"TwitterUser", "username")
    assert g.exists(user)
    return {"username": user.get("username")}

def node_to_dict(user):
    d = {}
    for k,v in user.items():
        d[k] = v 
    return d

@user_routes.route('/<username>', methods=["GET"])
def get_user(username):
    g = current_app.graph
    user = g.nodes.match("User", username=username).first()
    return node_to_dict(user)


@user_routes.route("/following/get/<username>", methods=["GET"])
def get_user_following(username):
    query = f"""
    MATCH (:TwitterUser {{username: '{username}'}})-->(followed:TwitterUser)
    RETURN followed
    """
    res = current_app.graph.run(query)
    node_list = []
    for i in res.data():
        node_list.append(node_to_dict(i["followed"]))
    return {"data": node_list}


@user_routes.route("/following/save/<username>", methods=["GET"])
def save_user_following(username):
    access_token = request.headers.get("OAUTH_ACCESS_TOKEN")
    access_token_secret = request.headers.get("OAUTH_ACCESS_TOKEN_SECRET")
    if access_token is None or access_token_secret is None:
        raise Exception("OAUTH_ACCESS_TOKEN and  OAUTH_ACCESS_TOKEN_SECRET must both be provided in request headers")
    twarc_client = Twarc2(
            consumer_key=os.environ["consumer_key"], 
            consumer_secret=os.environ["consumer_secret"],
            access_token=access_token,
            access_token_secret=access_token_secret,
        )
