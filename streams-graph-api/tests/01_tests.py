import os
from api import create_app
from dotenv import load_dotenv

from py2neo import Node, Relationship, Graph

load_dotenv()

graph = Graph(os.getenv("NEO4J_URI"), auth=(os.getenv("NEO4J_USERNAME"), os.getenv("NEO4J_PASSWORD")))


user_data = {'id': 202031866,
 'created_at': '2010-10-13T04:25:56.000Z',
 'username': 'negativegucci',
 'name': 'Lauren',
 'description': '',
 'entities.description.cashtags': '',
 'entities.description.hashtags': '',
 'entities.description.mentions': '',
 'entities.description.urls': '',
 'entities.url.urls': '',
 'location': '',
 'pinned_tweet_id': '',
 'profile_image_url': 'https://pbs.twimg.com/profile_images/1441420970019868674/UySm8YgA_normal.jpg',
 'protected': False,
 'public_metrics.followers_count': 248,
 'public_metrics.following_count': 866,
 'public_metrics.listed_count': 1,
 'public_metrics.tweet_count': 882,
 'url': '',
 'verified': False,
 'withheld.scope': '',
 'withheld.copyright': '',
 'withheld.country_codes': '',
 '__twarc.retrieved_at': '',
 '__twarc.url': '',
 '__twarc.version': '',
 'Unnamed: 26': '',
 'referencer.username': 'ArtirKel'}

def test_create_and_read_user(client):
    """Start with a blank database."""
    response = client.post('/api/users/create', json=user_data)
    assert response.status_code == 200
    assert "username" in response.json

    user = client.get(f'api/users/{response.json["username"]}')
    assert user.json["username"] == response.json.get("username")

def test_create_user_no_dups(client):
    _ = client.post('/api/users/create', json=user_data)
    _ = client.post('/api/users/create', json=user_data) ## Check no dupes
    res = graph.nodes.match("TwitterUser", username=user_data["username"]).all()
    assert len(res) == 1

def test_get_following(client):
    username = "nicktorba"
    res = client.get(f"api/users/following/get/{username}")
    print(f"length of following = {len(res.json['data'])}")
    assert len(res.json["data"]) > 500
    assert "created_at" in res.json["data"][0]
    assert "username" in res.json["data"][0]
    
# def test_save_following(client):
#     username = "nicktorba"
#     headers = dict(
#         OAUTH_ACCESS_TOKEN="hey",
#         OAUTH_ACCESS_TOKEN_SECRET="hey"
#     )
#     res = client.post(f'/api/users/save/{username}', headers=headers)
#     print(res)
#     assert False