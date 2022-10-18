CREATE CONSTRAINT FOR (t:Tweet) REQUIRE t.id IS UNIQUE
CREATE CONSTRAINT FOR (u:User) REQUIRE u.username IS UNIQUE
CREATE CONSTRAINT FOR (h:Tag) REQUIRE h.name IS UNIQUE
CREATE CONSTRAINT FOR (l:Link) REQUIRE l.url IS UNIQUE


CREATE CONSTRAINT FOR (e:Entity) REQUIRE e.id IS UNIQUE
CREATE CONSTRAINT FOR (d:Domain) REQUIRE d.id IS UNIQUE

# deleting duplicates
MATCH (t:Tweet)
WITH collect(t.id) as t_coll
WITH apoc.coll.duplicatesWithCount(t_coll) as collection 
unwind collection as item
MATCH (t:Tweet {id: item.item})
DETACH DELETE t
