from neo4j import GraphDatabase
from neo4j.exceptions import ServiceUnavailable
import logging

uri = "neo4j://localhost:7687"
driver = GraphDatabase.driver(uri, auth=("neo4j", "test"))

def create_person(tx, name):
    tx.run("CREATE (a:Person {name: $name})", name=name)

def create_friend_of(tx, name, friend):
    tx.run("MATCH (a:Person) WHERE a.name = $name "
           "CREATE (a)-[:KNOWS]->(:Person {name: $friend})",name=name, friend=friend)

def _get_user(tx, username):
    result = tx.run("MATCH (u:User {username: $username})RETURN u", username=username)
    breakpoint()
    return result
    
def get_user(username):
    with driver.session() as session:
        result = session.read_transaction(_get_user, username)
        breakpoint()
        return result

class UserService:
    # built from this example: https://neo4j.com/docs/api/python-driver/current/ 

    def __init__(self, uri, user, password):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        # Don't forget to close the driver connection when you are finished with it
        self.driver.close()

    def get_user(self, username): 
        with self.driver.session() as session:
            return session.read_transaction(self._get_user, username)
            
                
    @staticmethod
    def _get_user(tx, username):
        result = tx.run("MATCH (u:User {username: $username}) RETURN u", username=username)
        result = result.single()
        return result[0]

if __name__ == "__main__":
    # See https://neo4j.com/developer/aura-connect-driver/ for Aura specific connection URL.
    scheme = "neo4j"  # Connecting to Aura, use the "neo4j+s" URI scheme
    host_name = "example.com"
    port = 7687
    url = "{scheme}://{host_name}:{port}".format(scheme=scheme, host_name=host_name, port=port)
    user = "<Username for Neo4j database>"
    password = "<Password for Neo4j database>"
    app = UserService(url, user, password)
    app.create_friendship("Alice", "David")
    app.find_person("Alice")
    app.close()
