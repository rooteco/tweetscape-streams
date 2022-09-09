import os
from twarc import Twarc2
import pandas as pd
from py2neo import Node
from py2neo.bulk import merge_nodes, merge_relationships
from tweet_processing import pull_tweets
from twarc_csv import DataFrameConverter

from dotenv import load_dotenv

load_dotenv()

from api.data import popular, goodfellas

from api.exceptions.notfound import NotFoundException
from api.data import popular

twarc_client = Twarc2(
    consumer_key=os.environ["consumer_key"], 
    consumer_secret=os.environ["consumer_secret"],
    access_token=os.environ["access_token"],
    access_token_secret=os.environ["access_token_secret"],
)

user_fields = [
    'id', 
    'created_at', 
    'username', 
    'name', 
    'description',
    'entities.description.cashtags', 
    'entities.description.hashtags',
    'entities.description.mentions', 
    'entities.description.urls',
    'entities.url.urls', 
    'location', 
    'pinned_tweet_id', 
    'profile_image_url',
    'protected',
    'public_metrics.followers_count',
    'public_metrics.following_count', 
    'public_metrics.listed_count',
    'public_metrics.tweet_count', 
    'url',
    'verified', 
]
tweet_fields = [
        'id', 'conversation_id', 'referenced_tweets.replied_to.id',
       'referenced_tweets.retweeted.id', 'referenced_tweets.quoted.id',
       'author_id', 'in_reply_to_user_id', 'retweeted_user_id',
       'quoted_user_id', 'created_at', 'text', 'lang', 'source',
       'public_metrics.like_count', 'public_metrics.quote_count',
       'public_metrics.reply_count', 'public_metrics.retweet_count',
       'reply_settings', 'possibly_sensitive', 
       'entities.annotations',
       'entities.cashtags', 'entities.hashtags', 'entities.mentions',
       'entities.urls', 'context_annotations', 'attachments.media',
       'attachments.media_keys', 'attachments.poll.duration_minutes',
       'attachments.poll.end_datetime', 'attachments.poll.id',
       'attachments.poll.options', 'attachments.poll.voting_status',
       'attachments.poll_ids', 'author.id', 'author.created_at',
       'author.username', 'author.name', 'author.description',
       'author.entities.description.cashtags',
       'author.entities.description.hashtags',
       'author.entities.description.mentions',
       'author.entities.description.urls', 'author.entities.url.urls',
       'author.location', 'author.pinned_tweet_id', 'author.profile_image_url',
       'author.protected', 'author.public_metrics.followers_count',
       'author.public_metrics.following_count',
       'author.public_metrics.listed_count',
       'author.public_metrics.tweet_count', 'author.url', 'author.verified',
       'author.withheld.scope', 'author.withheld.copyright',
       'author.withheld.country_codes', 'geo.coordinates.coordinates',
       'geo.coordinates.type', 'geo.country', 'geo.country_code',
       'geo.full_name', 'geo.geo.bbox', 'geo.geo.type', 'geo.id', 'geo.name',
       'geo.place_id', 'geo.place_type', 'entities.mentions.usernames',
       'entities.mentions.num_mentions', 'entities.mentions.double_mention',
       'tweet_type', 'tweet_link', 'created_at.hour']

def get_user_following(client, username):
    """
    
    """
    print(f"fetching accounts followed by {username}")
    dfs = []
    for res in client.following(username):
        dfs.append(DataFrameConverter("users").process(res["data"]))
    df_following = pd.concat(dfs)
    df_following["referencer.username"] = username
    return df_following

class UsersDao:
    """
    The constructor expects an instance of the Neo4j Driver, which will be
    used to interact with Neo4j.
    """
    def __init__(self, driver):
        self.driver = driver

    """
     This method should return a paginated list of movies ordered by the `sort`
     parameter and limited to the number passed as `limit`.  The `skip` variable should be
     used to skip a certain number of rows.

     If a user_id value is suppled, a `favorite` boolean property should be returned to
     signify whether the user has added the movie to their "My Favorites" list.
    """        

    def add_user_node(self, user_data):
        user = Node("TwitterUser", **user_data)
        self.graph.merge(user, "TwitterUser", "username")
        return user

    def add_users_followed_by(self, user_node):
        query_template = """
        MATCH
            (a:TwitterUser),
            (b:TwitterUser)
        WHERE a.name = 'A' AND b.name = 'B'
        CREATE (a)-[r:RELTYPE]->(b)
        RETURN type(r)
        """
        df_following = get_user_following(twarc_client, user_node.get("username"))
        records = df_following[user_fields].to_dict("records")
        print(f"merging {len(records)} accounts followed by {user_node.get('username')}")
        merge_nodes(self.graph.auto(), records, ("TwitterUser", "username"))

        relationship_data = []
        for i_record in records: 
            relationship_data.append(
                [
                    user_node.get("username"),
                    {},
                    i_record["username"]
                ]
            )
        print("running merge_relationships")
        merge_relationships(
            self.graph.auto(),
            relationship_data,
            "FOLLOWS",
            start_node_key=("TwitterUser", "username"), 
            end_node_key=("TwitterUser", "username")
        )
        print("ending merge_relaiontships")
    
    def add_tweets_from(self, userNode):
        username, df_tweets, df_ref_tweets = pull_tweets(
            twarc_client, 
            userNode.get("username"), 
            extract_features=True, 
            max_tweets=100, 
            start_time=None, 
            end_time=None
        )

        records = df_tweets[tweet_fields].to_dict("records")
        print(f"merging {len(records)} tweets tweeted by {userNode.get('username')}")
        merge_nodes(self.graph.auto(), records, ("Tweet", "id"))

        tweet_rel_data = []
        for i_record in records:
            tweet_rel_data.append(
                [
                    userNode.get("username"),
                    {},
                    i_record["id"]
                ]
            )
        print(f"merging {len(tweet_rel_data)} tweet relationships for {userNode.get('username')}")
        merge_relationships(
            self.graph.auto(),
            tweet_rel_data,
            "TWEETED",
            start_node_key=("TwitterUser", "username"),
            end_node_key=("Tweet", "id")
        )

    def add_full_user(self, username):
        user = next(twarc_client.user_lookup(users=[username], usernames=True))
        user_data = DataFrameConverter("users").process(user["data"])[user_fields].to_dict("records")[0]
        userNode = self.add_user_node(user_data)
        self.add_users_followed_by(userNode)
        self.add_tweets_from(userNode)
        return userNode

    def get_user_tweets(self, userNode):
        tweets_query = f"""
        MATCH (tweet:Tweet )<-[f:TWEETED]-(user:TwitterUser {{username: '{userNode.get("username")}'}})
        RETURN user
        """ 
        tweets = self.graph.run(tweets_query)
        return tweets.data()

    # tag::all[]
    def all(self, sort, order, limit=6, skip=0, user_id=None):
        def get_movies(tx, sort, order, limit, skip, user_id):
            cypher = """
                MATCH (m:Movie)
                WHERE exists(m.`{0}`)
                RETURN m {{ .* }} AS movie
                ORDER BY m.`{0}` {1}
                SKIP $skip
                LIMIT $limit
            """.format(sort, order)

            result = tx.run(cypher, limit=limit, skip=skip, user_id=user_id)

            return [row.value("movie") for row in result]

        with self.driver.session() as session:
            return session.read_transaction(get_movies, sort, order, limit, skip, user_id)
    # end::all[]

    """
    This method should return a paginated list of movies that have a relationship to the
    supplied Genre.

    Results should be ordered by the `sort` parameter, and in the direction specified
    in the `order` parameter.
    Results should be limited to the number passed as `limit`.
    The `skip` variable should be used to skip a certain number of rows.

    If a user_id value is suppled, a `favorite` boolean property should be returned to
    signify whether the user has added the movie to their "My Favorites" list.
    """
    # tag::getByGenre[]
    def get_by_genre(self, name, sort='title', order='ASC', limit=6, skip=0, user_id=None):
        # TODO: Get Movies in a Genre
        # TODO: The Cypher string will be formated so remember to escape the braces: {{name: $name}}
        # MATCH (m:Movie)-[:IN_GENRE]->(:Genre {name: $name})

        return popular[skip:limit]
    # end::getByGenre[]

    """
    This method should return a paginated list of movies that have an ACTED_IN relationship
    to a Person with the id supplied

    Results should be ordered by the `sort` parameter, and in the direction specified
    in the `order` parameter.
    Results should be limited to the number passed as `limit`.
    The `skip` variable should be used to skip a certain number of rows.

    If a user_id value is suppled, a `favorite` boolean property should be returned to
    signify whether the user has added the movie to their "My Favorites" list.
    """
    # tag::getForActor[]
    def get_for_actor(self, id, sort='title', order='ASC', limit=6, skip=0, user_id=None):
        # TODO: Get Movies for an Actor
        # TODO: The Cypher string will be formated so remember to escape the braces: {{tmdbId: $id}}
        # MATCH (:Person {tmdbId: $id})-[:ACTED_IN]->(m:Movie)

        return popular[skip:limit]
    # end::getForActor[]

    """
    This method should return a paginated list of movies that have an DIRECTED relationship
    to a Person with the id supplied

    Results should be ordered by the `sort` parameter, and in the direction specified
    in the `order` parameter.
    Results should be limited to the number passed as `limit`.
    The `skip` variable should be used to skip a certain number of rows.

    If a user_id value is suppled, a `favorite` boolean property should be returned to
    signify whether the user has added the movie to their "My Favorites" list.
    """
    # tag::getForDirector[]
    def get_for_director(self, id, sort='title', order='ASC', limit=6, skip=0, user_id=None):
        # TODO: Get Movies directed by a Person
        # TODO: The Cypher string will be formated so remember to escape the braces: {{name: $name}}
        # MATCH (:Person {tmdbId: $id})-[:DIRECTED]->(m:Movie)

        return popular[skip:limit]
    # end::getForDirector[]

    """
    This method find a Movie node with the ID passed as the `id` parameter.
    Along with the returned payload, a list of actors, directors, and genres should
    be included.
    The number of incoming RATED relationships should also be returned as `ratingCount`

    If a user_id value is suppled, a `favorite` boolean property should be returned to
    signify whether the user has added the movie to their "My Favorites" list.
    """
    # tag::findById[]
    def find_by_id(self, id, user_id=None):
        # TODO: Find a movie by its ID
        # MATCH (m:Movie {tmdbId: $id})

        return goodfellas
    # end::findById[]

    """
    This method should return a paginated list of similar movies to the Movie with the
    id supplied.  This similarity is calculated by finding movies that have many first
    degree connections in common: Actors, Directors and Genres.

    Results should be ordered by the `sort` parameter, and in the direction specified
    in the `order` parameter.
    Results should be limited to the number passed as `limit`.
    The `skip` variable should be used to skip a certain number of rows.

    If a user_id value is suppled, a `favorite` boolean property should be returned to
    signify whether the user has added the movie to their "My Favorites" list.
    """
    # tag::getSimilarMovies[]
    def get_similar_movies(self, id, limit=6, skip=0, user_id=None):
        # TODO: Get similar movies from Neo4j

        return popular[skip:limit]
    # end::getSimilarMovies[]


    """
    This function should return a list of tmdbId properties for the movies that
    the user has added to their 'My Favorites' list.
    """
    # tag::getUserFavorites[]
    def get_user_favorites(self, tx, user_id):
        return []
    # end::getUserFavorites[]
