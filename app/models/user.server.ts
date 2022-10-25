// import type { Password, User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TweetStream, TwitterApi, TwitterV2IncludesHelper, UserSearchV1Paginator } from 'twitter-api-v2';

import { prisma } from "~/db.server";
import type { users } from "@prisma/client";
import { log } from '~/log.server';
import { USER_FIELDS } from '~/twitter.server';

import { driver } from "~/neo4j.server";
import type { Record } from 'neo4j-driver';
import { session } from 'neo4j-driver'
import {
  getSavedFollows,
  flattenTweetPublicMetrics,
  addUsersFollowedBy, bulkWrites,
  addTweetsFrom, addUsers, addTweetMedia, bulkWritesMulti
} from "~/models/streams.server";

export type { users } from "@prisma/client";


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

async function pullTweets(
  api: TwitterApi,
  user: Node,
  sinceId: string | null = null,
  untilId: string | null = null) {
  const utReq = {
    'expansions': 'author_id,in_reply_to_user_id,referenced_tweets.id,referenced_tweets.id.author_id,entities.mentions.username,attachments.poll_ids,attachments.media_keys,geo.place_id',
    'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
    'user.fields': USER_FIELDS,
    'media.fields': 'alt_text,duration_ms,height,media_key,preview_image_url,type,url,width,public_metrics',
    'poll.fields': 'duration_minutes,end_datetime,id,options,voting_status',
    'place.fields': 'contained_within,country,country_code,full_name,geo,id,name,place_type',
    'max_results': 100,
    'since_id': sinceId, // this is the oldest possible tweet
    'until_id': untilId, // this is the newest tweet allowed
  }
  if (!sinceId) {
    delete utReq.since_id
  }
  if (!untilId) {
    delete utReq.until_id
  }

  const tweetRes = await api.v2.userTimeline(
    user.properties.id,
    utReq
  );

  // while (!tweets.done) {
  //   console.log(tweets.data.data.length);
  //   await tweets.fetchNext();
  // }

  console.log(`done pulling tweets for ${user.properties.username}`)
  return tweetRes;
}

export async function indexUserNewTweets(api: TwitterApi, user: any) {
  console.log(`indexing tweets for ${user.properties.username}`)
  console.log(user.properties.latestTweetId)
  const tweetRes = await pullTweets(
    api,
    user,
    user.properties.latestTweetId
  )
  if (tweetRes.tweets.length > 0) {
    let includes = new TwitterV2IncludesHelper(tweetRes)
    await Promise.all([
      bulkWrites(flattenTwitterUserPublicMetrics(includes.users), addUsers),
      bulkWrites(includes.media, addTweetMedia),
      bulkWrites(flattenTweetPublicMetrics(includes.tweets), addTweetsFrom),
      bulkWrites(flattenTweetPublicMetrics(tweetRes.tweets), addTweetsFrom),
      updateUserIndexedTweetIds(user, tweetRes.tweets.slice(-1)[0].id, tweetRes.tweets[0].id)
    ])
  } else (
    log.debug(`no new tweets to index for user '${user.properties.username}'`)
  )
}

export async function indexUser(api: TwitterApi, limits: any, user: any) {
  // 1) if we don't have who they follow, get that shit...
  if (!user.properties.lastFollowsIndex) { // old users won't have this, so we need to add this field
    const savedFollowsOfUser = await getSavedFollows(user.properties.username)
    if (savedFollowsOfUser.length == user.properties["public_metrics.following_count"]) {
      log.debug(`Looks like we have already saved the ${savedFollowsOfUser.length} users followed by '${user.properties.username}'`)
      await updateUserLastfollowsIndex(user, (new Date()).toISOString())
    } else {
      log.debug(`We have ${savedFollowsOfUser.length} users followed by '${user.properties.username}', but twitter shows ${user.properties["public_metrics.following_count"]}`)
      const getFollowedLimit = await limits.v2.getRateLimit(
        'users/:id/following'
      );

      if ((getFollowedLimit?.remaining ?? 1) > 0) {
        log.debug(`Fetching api.v2.following for ${user.properties.username}...`);
        // Get accounts followed by seed user
        const following = await api.v2.following(
          user.properties.id,
          {
            'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
            'user.fields': USER_FIELDS,
            'max_results': 1000,
            "asPaginator": true
          }
        );

        while (!following.done) { await following.fetchNext(); }
        console.log(`fetched ${following.data.data.length} accounts followed by '${user.properties.username}'`);
        let newUsers = flattenTwitterUserPublicMetrics(following.data.data);
        console.log("-----adfsad------")
        console.log(newUsers.slice(0, 2))
        let saved = await bulkWritesMulti(
          addUsersFollowedBy,
          newUsers,
          { username: user.properties.username }
        )
        await updateUserLastfollowsIndex(user, (new Date()).toISOString())
      } else {
        log.warn(
          `Rate limit hit for getting user (${user.properties.username}) follwings, skipping until ${new Date(
            (getFollowedLimit?.reset ?? 0) * 1000
          ).toLocaleString()}...`
        );
      }
    }
  }

  if (!user.properties.earliestTweetId || !user.properties.latestTweetId) {
    console.log("INDEXING TWEETS FOR USER")
    console.log(user.properties)
    // this means we don't have a reliable tweet indexed range
    // reliable means we know we have every single tweet between these id's
    // start a reliable range with the most recent 100 tweets
    // allow users to manually index more tweets for each user as they wish
    // we pull more tweets for users when they look at certain stream views poss...
    const tweetRes = await pullTweets(
      api,
      user,
    )
    let includes = new TwitterV2IncludesHelper(tweetRes)
    await Promise.all([
      bulkWrites(flattenTwitterUserPublicMetrics(includes.users), addUsers),
      bulkWrites(includes.media, addTweetMedia),
      bulkWrites(flattenTweetPublicMetrics(includes.tweets), addTweetsFrom),
      bulkWrites(flattenTweetPublicMetrics(tweetRes.tweets), addTweetsFrom),
      updateUserIndexedTweetIds(user, tweetRes.tweets.slice(-1)[0].id, tweetRes.tweets[0].id)
    ])
    console.log("TWEET RES")
    console.log(tweetRes.tweets.slice(0, 2))
    console.log(tweetRes)
  }
}

export async function updateUserIndexedTweetIds(user: Node, earliestTweetId: string, latestTweetId: string) {
  const session = driver.session()
  // Create a node within a write transaction
  const res = await session.executeWrite((tx: any) => {
    return tx.run(`
      MERGE (u:User {username: $username})
      SET u.latestTweetId = $latestTweetId
      SET u.earliestTweetId = $earliestTweetId
      RETURN u`,
      { username: user.properties.username, earliestTweetId, latestTweetId })
  })
  const streams = res.records.map((row: Record) => {
    return row.get('u')
  })
  await session.close()
  return streams;
}

export async function updateUserLastfollowsIndex(user: Node, lastFollowsIndex: string) {
  const session = driver.session()
  // Create a node within a write transaction
  const res = await session.executeWrite((tx: any) => {
    return tx.run(`
      MERGE (u:User {username: $username})
      SET u.lastFollowsIndex = $lastFollowsIndex
      RETURN u`,
      { username: user.properties.username, lastFollowsIndex })
  })
  const streams = res.records.map((row: Record) => {
    return row.get('u')
  })
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
