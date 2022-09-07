## Create 2 streams
from asyncio.constants import SENDFILE_FALLBACK_READBUFFER_SIZE
import os
from dotenv import load_dotenv
from py2neo import Node, Relationship, Graph
from tweet_processing import get_time_interval

load_dotenv()

graph = Graph(os.getenv("NEO4J_URI"), auth=(os.getenv("NEO4J_USERNAME"), os.getenv("NEO4J_PASSWORD")))


end_time, start_time = get_time_interval(24*7)

payload1 = dict(
    name="stream1",
    createdAt=end_time,
    start_time=start_time,
    end_time=end_time
)
payload2 = dict(
    name="stream2",
    createdAt=end_time,
    startTime=start_time,
    endTime=end_time,
    seedUsers=[]
)

stream1 = Node("Stream", **payload1)
stream2 = Node("Stream", **payload2)
graph.merge(stream1,"Stream", "name")
graph.merge(stream2,"Stream", "name")

CREATED = Relationship.type("CREATED")
user = graph.nodes.match("TwitterUser", username="nicktorba").first()
r1 = CREATED(user, stream1)
r2 = CREATED(user, stream2)
graph.merge(r1)
graph.merge(r2)