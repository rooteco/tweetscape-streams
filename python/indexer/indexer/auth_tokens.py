import psycopg


from dataclasses import dataclass
import psycopg
from psycopg.rows import class_row

from datetime import datetime 

# model tokens {
#   user_id       String   @id
#   token_type    String
#   expires_in    Int
#   access_token  String   @unique
#   scope         String
#   refresh_token String   @unique
#   created_at    DateTime @db.Timestamptz(6)
#   updated_at    DateTime @db.Timestamptz(6)
#   users         users    @relation(fields: [user_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
# }

@dataclass
class Token:
    """
    Row Factory Docs: https://www.psycopg.org/psycopg3/docs/api/rows.html
    """
    user_id: str
    token_type: str
    expires_in: int
    access_token: str
    scope: str
    refresh_token: str
    created_at: datetime
    updated_at: datetime


# cur.execute("select 'John' as first_name, 'Smith' as last_name").fetchone()
# Person(first_name='John', last_name='Smith', age=None)

def get_user_tokens(user_id):
    # Connect to an existing database
    with psycopg.connect("postgresql://postgres:postgres@localhost:5432/postgres") as conn:
        # Open a cursor to perform database operations
        with conn.cursor(row_factory=class_row(Token)) as cur:
            # Query the database and obtain data as Python objects.
            cur.execute("SELECT * FROM tokens where user_id=%(uid)s", {"uid": user_id})
            return cur.fetchone()