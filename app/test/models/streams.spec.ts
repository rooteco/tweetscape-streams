import { getClient, USER_FIELDS, handleTwitterApiError } from '~/twitter.server';
import { updateStreamTweetsPromiseAll, updateStreamTweets, getStreamByName, deleteStreamByName, createStream } from "~/models/streams.server";
import { TwitterApi, TwitterV2IncludesHelper } from 'twitter-api-v2';

import * as dotenv from "dotenv";

dotenv.config();

const streamName = "TEST-STREAM"
const username = "nicktorba"

beforeAll(async () => {
    const endTime = new Date()
    const startTime = new Date(endTime.getFullYear(), endTime.getMonth(), endTime.getDate() - 7, endTime.getHours(), endTime.getMinutes())
    let stream = await createStream(streamName, startTime.toISOString(), username)
})

afterAll(async () => {
    await deleteStreamByName(streamName);
})
const api = new TwitterApi(process.env.TWITTER_TOKEN as string);

describe("Testing Streams Functions", () => {
    test("Get Stream Tweets", async () => {
        const { stream, seedUsers } = await getStreamByName('new-test');
        console.time("newUpdateStreamTweets")
        // let tweets = await updateStreamTweetsPromiseAll(api, stream, seedUsers.map((item: any) => (item.user)))
        let tweets = await updateStreamTweets(api, stream, seedUsers.map((item: any) => (item.user)))
        console.timeEnd("newUpdateStreamTweets")
        expect(tweets.length).toBe(4) // promsie for addUsers, addMedia, addTweets, and addTweets for ref tweets
    }, 36000);
});
