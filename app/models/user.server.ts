// import type { Password, User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TwitterV2IncludesHelper } from 'twitter-api-v2';
import type { Integer } from 'neo4j-driver';
import type { TwitterApi } from 'twitter-api-v2';
import { prisma } from "~/db.server";
import { log } from '~/log.server';
import { USER_FIELDS } from '~/twitter.server';
import { driver } from "~/neo4j.server";
import type { Record } from 'neo4j-driver';
import {
  getSavedFollows,
  flattenTweetPublicMetrics,
  addUsersFollowedBy, bulkWrites,
  addTweetsFrom, addUsers, addTweetMedia, bulkWritesMulti
} from "~/models/streams.server";

export type UserProperties = {
  username: string,
  name: string,
  verified: boolean,
  created_at: string,
  description: string,
  profile_image_url: string,
  url?: string,
  protected: boolean,
  location: string,
  id: string,
  "public_metrics.tweet_count": number,
  "public_metrics.listed_count": number,
  "public_metrics.following_count": number,
  "public_metrics.followers_count": number,
  latestTweetId?: string,
  earliestTweetId?: string
}

export type userNode = {
  identity: Integer,
  labels: string[],
  properties: UserProperties,
  elementId: string
}

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

export async function getMetaFollowers(user1: string, user2: string) {
  const session = driver.session()
  // Create a node within a write transaction
  const res = await session.executeRead((tx: any) => {
    return tx.run(`
        MATCH (user1:User {username: $user1 })-[:FOLLOWS]->(followedByBoth:User)
        MATCH (user2:User {username: $user2 })-[:FOLLOWS]->(followedByBoth:User)
        RETURN followedByBoth
        ORDER BY followedByBoth.\`public_metrics.followers_count\`
      `,
      { user1: user1, user2: user2 })
  })

  let metaFollowers = [];
  if (res.records.length > 0) {
    metaFollowers = res.records.map((row: Record) => {
      return row.get('followedByBoth')
    })
  }
  await session.close()
  return metaFollowers;
}

async function pullTweets(
  api: TwitterApi,
  user: userNode,
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

  // TODO: what to do if I have a partially indexed User? aka username, but no id
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

export async function indexUserOlderTweets(api: TwitterApi, user: userNode) {
  console.log(`indexing older tweets for ${user.properties.username}`)

  let newLatestTweetId = user.properties.latestTweetId
  let newEarliestTweetId = user.properties.earliestTweetId;

  let tweetRes = await pullTweets(
    api,
    user,
    null,
    user.properties.earliestTweetId, // get 100 more tweets, going back in time
  )
  console.log(`found ${tweetRes.tweets.length} tweets for ${user.properties.username}`)
  if (tweetRes.tweets.length > 0) {
    newEarliestTweetId = tweetRes.tweets.slice(-1)[0].id
  }

  if (tweetRes.tweets.length > 0) {
    let includes = new TwitterV2IncludesHelper(tweetRes)
    await Promise.all([
      bulkWrites(flattenTwitterUserPublicMetrics(includes.users), addUsers),
      bulkWrites(includes.media, addTweetMedia),
      bulkWrites(flattenTweetPublicMetrics(includes.tweets), addTweetsFrom),
      bulkWrites(flattenTweetPublicMetrics(tweetRes.tweets), addTweetsFrom),
      updateUserIndexedTweetIds(user, newEarliestTweetId, newLatestTweetId)
    ])
  } else (
    log.debug(`no new tweets to index for user '${user.properties.username}'`)
  )
}

export async function indexUserNewTweets(api: TwitterApi, user: userNode) {
  console.log(`indexing New tweets for ${user.properties.username}`)

  let tweetRes;
  let newLatestTweetId = user.properties.latestTweetId; // set to initial values
  let newEarliestTweetId = user.properties.earliestTweetId;

  if (!user.properties.earliestTweetId || !user.properties.latestTweetId) {
    tweetRes = await pullTweets(
      api,
      user
    )
    newLatestTweetId = tweetRes.tweets[0].id
    newEarliestTweetId = tweetRes.tweets.slice(-1)[0].id
  } else {
    tweetRes = await pullTweets(
      api,
      user,
      user.properties.latestTweetId
    )
    if (tweetRes.tweets.length > 0) {
      newLatestTweetId = tweetRes.tweets[0].id
    }
  }

  if (tweetRes.tweets.length > 0) {
    let includes = new TwitterV2IncludesHelper(tweetRes)
    await Promise.all([
      bulkWrites(flattenTwitterUserPublicMetrics(includes.users), addUsers),
      bulkWrites(includes.media, addTweetMedia),
      bulkWrites(flattenTweetPublicMetrics(includes.tweets), addTweetsFrom),
      bulkWrites(flattenTweetPublicMetrics(tweetRes.tweets), addTweetsFrom),
      updateUserIndexedTweetIds(user, newEarliestTweetId, newLatestTweetId)
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
        await bulkWritesMulti(
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
  return await indexUserNewTweets(api, user) // will index the latest 100 tweets to get started for this user.. 
}

export async function updateUserIndexedTweetIds(user: userNode, earliestTweetId: string, latestTweetId: string) {
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
          OPTIONAL MATCH (t)-[r:REFERENCED]->(ref_t:Tweet)<-[:POSTED]-(ref_a:User)
          OPTIONAL MATCH (t)-[ar:ANNOTATED]-(a)
          OPTIONAL MATCH (t)-[tr:INCLUDED]->(entity)
          RETURN u,t,collect(a) as a, collect(r) as refTweetRels, collect(ref_t) as refTweets,collect(ref_a) as refTweetAuthors, collect(entity) as entities
          ORDER by t.created_at DESC
      `,
      { username })
  })
  let tweets = [];
  if (res.records.length > 0) {
    tweets = res.records.map((row: Record) => {
      return {
        tweet: row.get('t'),
        author: row.get('u'),
        annotation: row.get('a'),
        refTweets: row.get('refTweets'),
        refTweetRels: row.get('refTweetRels'),
        refTweetAuthors: row.get('refTweetAuthors'),
        entities: row.get('entities')
      }
    })
  }
  await session.close()
  return tweets;
}

export async function userIndexedEntityDistribution(username: string) {
  const session = driver.session()
  let params = { username: username }
  let query = `
      MATCH (u:User {username: $username})-[:POSTED]->(t:Tweet)
      OPTIONAL MATCH (t)-[tr:INCLUDED]->(entity:Entity)-[:CATEGORY]-(d:Domain {name:"Unified Twitter Taxonomy"})
      WITH collect(entity) as entities, collect(t) as tweets
      RETURN apoc.coll.frequencies(entities) as entityDistribution, size(tweets) as numTotalTweets
  `
  const res = await session.executeRead((tx: any) => {
    return tx.run(query, params)
  })
  let data;
  if (res.records.length == 1) {
    data = {
      "entityDistribution": res.records[0].get("entityDistribution").map((row) => ({ item: row.item, count: row.count.toInt() })),
      "numTotalTweets": res.records[0].get("numTotalTweets").toInt()
    }
  }
  data.entityDistribution.sort((a, b) => (b.count - a.count))
  await session.close()
  return data;
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

export async function getUserNeo4j(username: string): Promise<userNode | null> {
  const session = driver.session()
  const res = await session.executeWrite((tx: any) => {
    return tx.run(`
      MATCH (u:User {username: $username})
      RETURN u`,
      { username: username }
    )
  })
  let node = null;
  if (res.records.length == 1) {
    const singleRecord: Record = res.records[0]
    node = singleRecord.get("u")
    return node;
  }
  await session.close()
  return node;
}

export async function createUserNeo4j(user: UserProperties) {
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

export async function deleteUserNeo4j(username: string) {
  const user = (await getUserNeo4j(username))
  if (!user) {
    throw new Error(`Cannot delete user '${username}', user does not exist in db`)
  }
  const session = driver.session()
  // Create a node within a write transaction
  await session.executeWrite((tx: any) => {
    return tx.run(`
      MATCH(u: User { username: $username })
      DETACH DELETE u`,
      { username })
  })
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
