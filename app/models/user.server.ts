// import type { Password, User } from "@prisma/client";
import bcrypt from "bcryptjs";

import { prisma } from "~/db.server";

export type { users } from "@prisma/client";
import type { users } from "@prisma/client";
import { flattenTwitterData } from "~/twitter.server";
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
  const res = await session.writeTransaction((tx: any) => {
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
  const res = await session.writeTransaction((tx: any) => {
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

async function getTweetsFromAuthorId(
  api: any,
  id: string,
  startTime: string,
  endTime: string,
) {
  const tweets = await api.v2.userTimeline(
    id,
    {
      'expansions': 'author_id,in_reply_to_user_id,referenced_tweets.id,referenced_tweets.id.author_id,entities.mentions.username,attachments.poll_ids,attachments.media_keys,geo.place_id',
      'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
      'user.fields': 'created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld',
      'media.fields': 'alt_text,duration_ms,height,media_key,preview_image_url,type,url,width,public_metrics',
      'poll.fields': 'duration_minutes,end_datetime,id,options,voting_status',
      'place.fields': 'contained_within,country,country_code,full_name,geo,id,name,place_type',
      'max_results': 100,
      'end_time': endTime,
      'start_time': startTime
    }
  );
  while (!tweets.done) {
    console.log(tweets.data.data.length);
    await tweets.fetchNext();
  }
  return tweets;
}

/**
 * Add a user and all connected data (following, ref_tweets, tweets, entities) to our DB
 * @param api 
 * @param user 
 * @returns 
 */
export async function addUserAndRefsToDb(api: any, user: users, startTime: string, endTime: string) {
  // FOLLOWS
  // Check to see if follows have been saved for this seed user
  let followsOfUser = await prisma.follows.findMany({
    where: { followerId: user.id },
    include: {
      following: true,
    }
  });

  // If follows haven't been saved, save them 
  if (followsOfUser.length == user.public_metrics_following_count) {
    log.debug(`Looks like we have already saved the ${followsOfUser.length} users followed by '${user.username}'`)
  } else {
    console.log(`PULLING USERS FOLLOWED BY '${user.username}`);
    // Get accounts followed by seed user
    const following = await api.v2.following(
      user.id,
      {
        'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
        'user.fields': 'created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld',
        'max_results': 1000,
        "asPaginator": true
      }
    );
    while (!following.done) { await following.fetchNext(); }
    log.debug(`fetched ${following.data.data.length} accounts followed by '${user.username}'`);
    // Add all accounts to DB
    for (let newUser of following.data.data) {
      newUser = flattenTwitterData([newUser])[0];
      // let addedUser = await createUser(newUser);
      let addedUser = await prisma.users.upsert({
        where: { id: newUser.id },
        create: newUser,
        update: newUser,
      })
      let follow = await prisma.follows.upsert({
        where: {
          followerId_followingId: {
            followerId: user.id,
            followingId: newUser.id
          }
        },
        create: {
          followerId: user.id,
          followingId: newUser.id
        },
        update: {
          followerId: user.id,
          followingId: newUser.id
        }
      });
    }
  }

  // TWEETS AND REF TWEETS AND ENTITIES
  let tweets = await getTweetsFromAuthorId(
    api,
    user.id,
    startTime,
    endTime
  );
  // Add referenced Tweets
  for (const tweet of tweets.includes.tweets) {
    upsertTweet(tweet);
  }
}

export async function getUsersFollowedById(id: string) {
  return prisma.follows.findMany({
    where: { followerId: id },
    include: {
      following: true,
    }

  });
}



export async function deleteUserByEmail(email: users["email"]) {
  return prisma.users.delete({ where: { email } });
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
