import { deleteStreamByName, createStream, getStreamByName, deleteAllStreams, addSeedUserToStream, getStreamTweetsNeo4j } from "~/models/streams.server";
import * as dotenv from "dotenv";
import type { StreamProperties } from "~/models/streams.server";
import { StreamError } from '~/models/streams.errors';

dotenv.config();

beforeAll(async () => {
    // Delete Test Stream... they can be left laying around from previous, broken tests
    await deleteAllStreams();
})

// delete all streams after all tests are done
afterAll(async () => {
    await deleteAllStreams();
})

describe("Testing Streams Functions", () => {
    test("Create and Delete a Stream", async () => {
        // create a stream
        const stream1Properties: StreamProperties = {
            name: "stream1",
            twitterListId: "fake-id",
        }
        const username = "nicktorba"
        let stream1 = await createStream(stream1Properties, username)
        let { stream, creator, seedUsers } = await getStreamByName(stream1Properties.name)
        expect(stream.properties.name).toBe(stream1Properties.name)
        expect(stream.properties.name).toBe(stream1.properties.name)
        expect(creator.properties.username).toBe(username)
        expect(seedUsers.length).toBe(0)

        await deleteStreamByName(stream.properties.name)
        let { stream: stream2, creator: creator2, seedUsers: seedUsers2 } = await getStreamByName(stream1Properties.name)
        expect(stream2).toBe(null)
        expect(creator2).toBe(null)
        expect(seedUsers2).toBe(null)
    }, 36000)

    test("Fetching Non-existent Stream", async () => {
        let { stream, creator, seedUsers } = await getStreamByName("not-real-stream")
        expect(stream).toBe(null)
        expect(creator).toBe(null)
        expect(seedUsers).toBe(null)
    })

    test("Create duplicate stream", async () => {
        const stream1Properties: StreamProperties = {
            name: "stream1",
            twitterListId: "fake-id",
        }
        const username = "nicktorba"
        await createStream(stream1Properties, username)
        let { stream, creator, seedUsers } = await getStreamByName(stream1Properties.name)
        expect(stream.properties.name).toBe(stream1Properties.name)
        expect(stream.properties.name).toBe(stream.properties.name)
        expect(creator.properties.username).toBe(username)
        expect(seedUsers.length).toBe(0)

        let error = null;
        try {
            await createStream(stream1Properties, username)
        } catch (e) {
            error = e
        }
        expect(error).toBeInstanceOf(StreamError)
        expect(error.message).toBe(`Stream '${stream1Properties.name}' already exists`)
    })

    test("Add Seed User to Stream", async () => {
        const streamProperties: StreamProperties = {
            name: "seedUserStream",
            twitterListId: "fake-id",
        }
        const creatorUsername = "nicktorba"
        const seedUserUsername = "RhysLindmark"
        await createStream(streamProperties, creatorUsername)
        let { seedUsers } = await getStreamByName(streamProperties.name)
        expect(seedUsers.length).toBe(0)
        await addSeedUserToStream(streamProperties.name, seedUserUsername)
        let { creator: creator2, seedUsers: seedUsers2 } = await getStreamByName(streamProperties.name)
        expect(seedUsers2.length).toBe(1)
        expect(seedUsers2[0].user.properties.username).toBe(seedUserUsername)
        expect(creator2.properties.username).toBe(creatorUsername)
    })

    test("Add non-existent user to stream", async () => {
        const streamProperties: StreamProperties = {
            name: "seedUserStream2",
            twitterListId: "fake-id",
        }
        const creatorUsername = "nicktorba"
        const seedUserUsername = "not-real-user"
        await createStream(streamProperties, creatorUsername)
        let { stream } = await getStreamByName(streamProperties.name)

        let error = null;
        try {
            await addSeedUserToStream(stream.properties.name, seedUserUsername)
        }
        catch (e) {
            error = e
        }
        expect(error).toBeInstanceOf(StreamError)
        expect(error.message).toBe(`Cannot add user with username '${seedUserUsername}' to stream '${stream.properties.name}.' User not found in db`)
    })

    test("Get Stream Tweets", async () => {
        const streamProperties: StreamProperties = {
            name: "seedUserStream3",
            twitterListId: "fake-id",
        }
        const creatorUsername = "nicktorba"
        await createStream(streamProperties, creatorUsername)
        let { stream } = await getStreamByName(streamProperties.name)
        await addSeedUserToStream(stream.properties.name, "nicktorba")
        await addSeedUserToStream(stream.properties.name, "RhysLindmark")
        let tweets = await getStreamTweetsNeo4j(stream.properties.name)
        expect(tweets.length).toBe(21) // 21 tweets from Rhys and Nick, 1 of those tweets is included from ref tweets of seed data
        expect(tweets[0].author.properties.username).toBe("RhysLindmark") // Rhys has the most recent tweet of seed data

    })
});
