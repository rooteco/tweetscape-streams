import os
from api import create_app
from dotenv import load_dotenv

from py2neo import Node, Relationship, Graph

load_dotenv()

# graph = Graph(os.getenv("NEO4J_URI"), auth=(os.getenv("NEO4J_USERNAME"), os.getenv("NEO4J_PASSWORD")))


def test_get_streams(client):
    """Start with a blank database."""
    response = client.get("/api/streams/")
    assert response.json["streams"][0].get("name") == "stream1"
    assert len(response.json["streams"]) == 2

