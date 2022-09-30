import { getStreamByName } from "~/models/streams.server";
import { loader, action } from "~/routes/streams/index";

const streamName = "TEST-STREAM-in-index"

describe("Check Streams Index", () => {
    test("Create a Stream", async () => {
        const formData = new FormData();
        formData.append("name", streamName)
        const response: Response = await action({
            request: new Request("http:localhost:3000/streams", { method: "POST", body: formData }),
            params: { streamName: streamName },
            context: {}
        })
        expect(response.status).toBe(200)
        let { stream, seedUsers } = await getStreamByName(streamName);
        expect(stream.properties.name).toBe(streamName);
        expect(seedUsers.length).toBe(0);
    });

    // TODO: dumb bug happening here
    // test("Delete a Stream", async () => {
    //     const formData = new FormData();
    //     formData.append("intent", "delete")
    //     // console.log("INTENT RIGHT HERE")
    //     // for (var key of formData.entries()) {
    //     //     console.log(key[0] + ', ' + key[1]);
    //     // }
    //     const response: Response = await action({
    //         request: new Request(`http://localhost:3000/streams/${streamName}`, { method: "POST", body: formData }),
    //         params: { streamName: streamName },
    //         context: {}
    //     })

    //     expect(response.status).toBe(200)
    //     // let { stream, seedUsers } = await getStreamByName(streamName);
    //     // expect(stream.properties.name).toBe(null);
    // });

})
