from flask import Flask, current_app

# tag::import[]
from py2neo import Node, Relationship, Graph
import py2neo
# end::import[]
from py2neo import ServiceProfile

graph = Graph(
    profile=ServiceProfile(
        protocol="neo4j",
        scheme="neo4j+s",
        host="95c16721.databases.neo4j.io",
    ),
    auth=("neo4j", "oqutQwHMkKOL3DTn7lwWGQJ1fS61_wtLzfzANMVgvOM")
)

"""
Initiate the py2neo Graph
"""
# tag::initDriver[]
def init_graph(uri, username, password):
    # TODO: Create an instance of the driver here
    print("URI = ", uri)
    print("VERSION")
    print(py2neo.__version__)
    
    # graph = Graph(
    #     profile=ServiceProfile(
    #         protocol="neo4j",
    #         scheme="neo4j+s",
    #         host="95c16721.databases.neo4j.io",
    #     ),
    #     auth=(username, password))
    # graph = Graph(
    #     scheme="neo4j+s",
    #     host="95c16721.databases.neo4j.io",
    #     auth=(username, password))
    current_app.graph = graph
    return current_app.graph
# end::initDriver[]


"""
Get the instance of the Neo4j Driver created in the `initDriver` function
"""
# tag::getDriver[]
def get_graph():
    return current_app.graph

# end::getDriver[]

"""
If the driver has been instantiated, close it and all remaining open sessions
"""

# tag::closeDriver[]
# def close_driver():
#     if current_app.driver != None:
#         current_app.driver.close()
#         current_app.driver = None

#         return current_app.driver
# # end::closeDriver[]
