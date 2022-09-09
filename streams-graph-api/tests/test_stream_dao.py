import pytest
from api.exceptions.notfound import NotFoundException

from api.neo4j import get_driver

from api.dao.streams import StreamsDao



username='nicktorba'


stream_node = {
    "name": "test-stream", 
    "startTime": "2022-09-01T13:58:40Z",
    "endTime": "2022-09-07T13:58:40Z"
}

stream_node2 = {
    "name": "test-stream2", 
    "startTime": "2022-09-01T13:58:40Z",
    "endTime": "2022-09-07T13:58:40Z"
}

@pytest.fixture(autouse=True)
def before_all(app):
    with app.app_context():
        driver = get_driver()
        with driver.session() as session:
            session.write_transaction(lambda tx: tx.run("""
                MERGE (u:User {username: $username})
            """, username = username))
            session.write_transaction(lambda tx: tx.run("""
                MATCH (s:Stream {name: "test-stream"}) DETACH DELETE s
            """))


def test_add_stream_read_stream(app):
    with app.app_context():
        driver = get_driver()
        dao = StreamsDao(driver)
        _ = dao.add_stream_node(stream_node, username)
        # _ = dao.add_stream_node(stream_node2, username)
        stream,seed_users = dao.get_stream(stream_node["name"])
        assert stream["name"] == stream_node["name"]

        streams = dao.all()
        assert len(streams) > 1

def test_add_seed_user_to_stream(app):
    with app.app_context():
        driver = get_driver()
        dao = StreamsDao(driver)
        res = dao.add_seed_user("test-stream2", "rhyslindmark")