import { createStream, deleteStreamByName } from "~/models/streams.server"
import { loader, action } from "~/routes/streams/$streamName";

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

describe("Run Loader", () => {
    test("Check the loaded stream", async () => {
        const response: Response = await loader({
            request: new Request(`http://localhost:3000/streams/${streamName}`, { method: "GET" }),
            params: { streamName: streamName },
            context: {},
        });


        expect(response.status).toBe(200)

        let data = await response.json();
        // TODO: check the lengths and stuff, most should be empty at this point
        expect(data).toHaveProperty("stream")
        expect(data.stream.properties).toHaveProperty("name", streamName)
        expect(data.stream.properties.name).toBe(streamName)
        expect(data).toHaveProperty("tweets")
    });

    test("Add Seed User to stream", async () => {
        const streamName = "TEST-STREAM"
        const seedUserHandle = "rhyslindmark"
        const formData = new FormData();
        formData.append("seedUserHandle", seedUserHandle)
        formData.append("intent", "addSeedUser")
        const response: Response = await action({
            request: new Request(`http:localhost:3000/streams/${streamName}`, { method: "POST", body: formData }),
            params: { streamName: streamName },
            context: {}
        })
        // TODO: Why doesn't this action return a promise like the loader...? 
        expect(response).toHaveProperty("u")
        expect(response.u.properties).toHaveProperty("username", seedUserHandle)
    })

});


