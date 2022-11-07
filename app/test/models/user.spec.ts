import * as dotenv from "dotenv";
import { createUserNeo4j, deleteUserNeo4j, getUserNeo4j } from '~/models/user.server';
import type { UserProperties } from '~/models/user.server';

dotenv.config();

const testUser: UserProperties = {
    username: "testuser",
    name: "Testing User",
    verified: false,
    created_at: "2015-07-09T16:34:49.000Z",
    description: "describe me",
    profile_image_url: "https://pbs.twimg.com/profile_images/1558153612949323783/drvcfGPY_normal.jpg",
    url: "https://t.co/rqdSgA6HNG",
    protected: false,
    location: "Lisbon, Portugal",
    id: "123456789",
    "public_metrics.tweet_count": 100,
    "public_metrics.listed_count": 100,
    "public_metrics.following_count": 100,
    "public_metrics.followers_count": 100,
}

beforeAll(async () => { })

afterAll(async () => { })

describe("Testing User Functions", () => {
    test("Create and Delete a User", async () => {
        // create a user
        const username = "checkme"
        let user = await createUserNeo4j(testUser)
        expect(user.properties.username).toBe(testUser.username)
        expect(user.properties.name).toBe(testUser.name)
        expect(user.properties.verified).toBe(testUser.verified)
        expect(user.properties.created_at).toBe(testUser.created_at)
        expect(user.properties.description).toBe(testUser.description)
        expect(user.properties.profile_image_url).toBe(testUser.profile_image_url)

        await deleteUserNeo4j(user.properties.username)

        let user2 = await getUserNeo4j(username);
        expect(user2).toBe(null)
    })

    test("Fetching Non-existent User", async () => {
        let user = await getUserNeo4j("not-real-user")
        expect(user).toBe(null)
    })
})