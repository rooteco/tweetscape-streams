import { getUserFromTwitter, deleteStreamByName, createStream, addSeedUserToStream } from "~/models/streams.server";
import { TwitterApi } from 'twitter-api-v2';
import { deleteUserIndexedTweets, getUserByUsernameDB, getUserIndexedTweets } from '~/models/user.server';
import * as dotenv from "dotenv";
import { createUserDb } from '~/models/user.server';
import { TwitterApiRateLimitPlugin } from '@twitter-api-v2/plugin-rate-limit';
import { TwitterApiRateLimitDBStore } from '~/limit.server';



dotenv.config();

const streamName = "TEST-STREAM"
const username = "nicktorba"

beforeAll(async () => {
    const endTime = new Date()
    const startTime = new Date(endTime.getFullYear(), endTime.getMonth(), endTime.getDate() - 7, endTime.getHours(), endTime.getMinutes())
    await createStream(streamName, startTime.toISOString(), username)
    await deleteUserIndexedTweets("nicktorba")
})

afterAll(async () => {
    await deleteStreamByName(streamName);
})

const TWITTER_TOKEN = process.env.TWITTER_TOKEN as string
const limits = new TwitterApiRateLimitPlugin(
    new TwitterApiRateLimitDBStore(TWITTER_TOKEN)
);
let api = new TwitterApi(TWITTER_TOKEN, { plugins: [limits] });

describe("Testing Streams Functions", () => {
    // test("Get Stream Tweets", async () => {
    //     const { stream, seedUsers } = await getStreamByName('new-test');
    //     console.time("newUpdateStreamTweets")
    //     let tweets = await updateStreamTweets(api, stream, seedUsers.map((item: any) => (item.user)))
    //     console.timeEnd("newUpdateStreamTweets")
    //     expect(tweets.length).toBe(4) // promsie for addUsers, addMedia, addTweets, and addTweets for ref tweets
    // }, 36000);

    // test("Write a Tweet", async () => {
    //     let data = await Promise.all([
    //         bulkWrites(USERS, addUsers),
    //         bulkWrites(MEDIA, addTweetMedia),
    //         bulkWrites(REF_TWEET, addTweetsFrom),
    //         bulkWrites(TWEET, addTweetsFrom)
    //     ])
    //     const { tweet, relNodes } = await getTweet(TWEET[0]["id"])
    //     expect(relNodes.filter((row: any) => row.relationship == "INCLUDED").length).toBe(8)
    // })

    test("User Tweet Fetching Date Strategy", async () => {

        // create stream1, with endtime before starttime of stream2
        // add seedUser who we know has tweets on these days
        // update Tweet Network for stream1
        // create stream2
        // update tweet network
        // make sure that the tweets between 
        const stream1Name = 'stream1TESTING'
        const stream1StartTime = '2022-09-07T15:08:02.484Z'
        const stream1EndTime = '2022-09-10T15:08:02.484Z'

        let stream1 = await createStream(stream1Name, stream1StartTime, username)
        const userFromTwitter = await getUserFromTwitter(api, "nicktorba");
        let userDb = await createUserDb(userFromTwitter)
        await addSeedUserToStream(api, limits, stream1, userDb, stream1EndTime)
        // let { seedUsers: stream1SeedUsers } = await getStreamByName(stream1.properties.name);

        let checkTweets = await getUserIndexedTweets("nicktorba")
        userDb = await getUserByUsernameDB("nicktorba")
        expect(userDb.properties.tweetscapeIndexedTweetsEndTime).toBe('2022-09-10T02:28:32.000Z')
        expect(checkTweets.length).toBe(31)

        const stream2Name = 'stream2TESTING'
        const stream2StartTime = '2022-09-17T15:08:02.484Z'
        const stream2EndTime = '2022-09-21T15:56:07.000Z'
        let stream2 = await createStream(stream2Name, stream2StartTime, username)

        await addSeedUserToStream(api, limits, stream2, userDb, stream2EndTime)
        // let { seedUsers: stream2SeedUsers } = await getStreamByName(stream2.properties.name);

        checkTweets = await getUserIndexedTweets("nicktorba")
        userDb = await getUserByUsernameDB("nicktorba")
        expect(new Date(userDb.properties.tweetscapeIndexedTweetsEndTime)).greaterThan(new Date("2022-09-21"))
        expect(new Date(userDb.properties.tweetscapeIndexedTweetsEndTime)).lessThan(new Date("2022-09-22"))
        expect(userDb.properties.tweetscapeIndexedTweetsStartTime).toBe("2022-09-07T17:54:07.000Z")
    }, 36000)
});
