// import type { Password, User } from "@prisma/client";
import bcrypt from "bcryptjs";

import { prisma } from "~/db.server";

export type { users } from "@prisma/client";
import type { users } from "@prisma/client";
import { log } from '~/log.server';

import { driver } from "~/neo4j.server";
import { Record } from 'neo4j-driver'


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
