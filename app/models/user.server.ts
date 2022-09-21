// import type { Password, User } from "@prisma/client";
import bcrypt from "bcryptjs";

import { prisma } from "~/db.server";

export type { users } from "@prisma/client";
import type { users } from "@prisma/client";
import { log } from '~/log.server';

import { driver } from "~/neo4j.server";
import { Record, session } from 'neo4j-driver'


export function flattenTwitterUserPublicMetrics(data: Array<any>) {
  for (const obj of data) {
    obj.username = obj.username.toLowerCase();
    obj["public_metrics.followers_count"] = obj.public_metrics.followers_count;
    obj["public_metrics.following_count"] = obj.public_metrics.following_count;
    obj["public_metrics.tweet_count"] = obj.public_metrics.tweet_count;
    obj["public_metrics.listed_count"] = obj.public_metrics.listed_count;
    delete obj.public_metrics;
    delete obj.entities;
  }
  return data;
}

export async function deleteUserIndexedTweets(username: string) {
  const session = driver.session()
  const res = await session.executeWrite((tx: any) => {
    return tx.run(`
    MATCH (u:User {username: $username} )-[:POSTED]->(t:Tweet)
    DETACH DELETE t
  `,
      { username })
  })
  let streams;
  if (res.records.length > 0) {
    streams = res.records.map((row: Record) => {
      return row.get("s")
    })
  }
  await session.close()
  return streams;
}

export async function getStreamsUserIn(username: string) {
  const session = driver.session()
  const res = await session.executeRead((tx: any) => {
    return tx.run(`
      MATCH (s:Stream )-[:CONTAINS]->(u:User {username:$username})
      RETURN s
  `,
      { username })
  })
  let streams;
  if (res.records.length > 0) {
    streams = res.records.map((row: Record) => {
      return row.get("s")
    })
  }
  await session.close()
  return streams;
}

export async function getUserIndexedTweets(username: string,) {
  //THIS EXCLUDES RETWEETS RIGHT NOW
  const session = driver.session()
  // Create a node within a write transaction
  const res = await session.executeRead((tx: any) => {
    return tx.run(`
          MATCH (u:User {username: $username} )-[:POSTED]->(t:Tweet)
          OPTIONAL MATCH (t)-[relation:REFERENCED]->(refTweet:Tweet)
          RETURN u,t,collect(refTweet) as refTweet,collect(relation) as rel
          ORDER by t.created_at DESC
      `,
      { username })
  })
  let tweets = [];
  if (res.records.length > 0) {
    tweets = res.records.map((row: Record) => {
      return {
        "tweet": row.get('t'),
        "author": row.get('u'),
        "refTweet": row.get('refTweet'),
        "rel": row.get("rel")
      }
    })
  }
  await session.close()
  return tweets;
}

export async function getUserContextAnnotationFrequency(username: string) {
  const session = driver.session()
  const res = await session.executeWrite((tx: any) => {
    return tx.run(`
        MATCH (u:User {username: $username})-[r:POSTED]->(t:Tweet)
        MATCH (t)-[tr:INCLUDED]->(entity)
        with collect(entity.name) as entity_names 
        return  apoc.coll.frequencies(entity_names) as frequencies;
      `, { username: username }
    )
  })
  let frequencies = [];
  if (res.records.length > 0) {
    frequencies = res.records.map((row: Record) => {
      return row.get("frequencies")
    })
  }
  await session.close()
  return frequencies;
}

export async function getUserByUsernameDB(username: string) {
  const session = driver.session()
  const res = await session.executeWrite((tx: any) => {
    return tx.run(`
      MATCH (u:User {username: $username})
      RETURN u`,
      { username: username }
    )
  })
  let node;
  if (res.records.length == 1) {
    const singleRecord: Record = res.records[0]
    node = singleRecord.get("u")
    return node;
  } else {
    node = null;
  }
  await session.close()
  return node;
}

export async function createUserDb(user: any) {
  const session = driver.session()
  const res = await session.executeWrite((tx: any) => {
    return tx.run(`
      MERGE (u:User {username: $user.username})
      SET u = $user
      RETURN u`,
      { user: user }
    )
  })
  const singleRecord: Record = res.records[0]
  const node = singleRecord.get("u")
  await session.close()
  return node;
}

export async function verifyLogin(
  email: User["email"],
  password: Password["hash"]
) {
  const userWithPassword = await prisma.users.findUnique({
    where: { email },
    include: {
      password: true,
    },
  });

  if (!userWithPassword || !userWithPassword.password) {
    return null;
  }

  const isValid = await bcrypt.compare(
    password,
    userWithPassword.password.hash
  );

  if (!isValid) {
    return null;
  }

  const { password: _password, ...userWithoutPassword } = userWithPassword;

  return userWithoutPassword;
}
