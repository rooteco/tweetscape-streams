import { loader } from "~/routes/streams/$streamName";

const streamName = "TEST-STREAM"

describe("Testing $streamName", () => {
    test("Check the loader when accessing without auth", async () => {
        let error = null;
        await loader({
            request: new Request("http://localhost:3000/streams/streamName", { method: "GET" }),
            params: { streamName: streamName },
            context: {},
        })
            .then(() => { })
            .catch((e) => {
                // catching the redirect
                error = e
            });
        expect(error.status).toBe(302)
    });

});


// TODO: Add tests for the logged in View

// describe("Run Loader", () => {
//     test("Logged out View ", async () => {
//         const url = `http:localhost:3000/streams/${streamName}`
//         console.log("MAKING REQUEST TO URL")
//         console.log(url)
//         const response: Response = await loader({
//             request: new Request(`http://localhost:3000/streams/${streamName}`, { method: "GET", headers: {} }),
//             params: { streamName: streamName },
//             context: {},
//         });


//         console.log("HERE IS THE RES")
//         console.log(response)
//         expect(response.status).toBe(200)

//         let data = await response.json();
//         // TODO: check the lengths and stuff, most should be empty at this point
//         expect(data).toHaveProperty("stream")
//         expect(data.stream.properties).toHaveProperty("name", streamName)
//         expect(data.stream.properties.name).toBe(streamName)
//         expect(data).toHaveProperty("tweets")
//     });

    // test("Add Seed User to stream", async () => {
    //     const streamName = "TEST-STREAM"
    //     const seedUserHandle = "rhyslindmark"
    //     const url = `http:localhost:3000/streams/${streamName}`
    //     console.log("MAKING REQUEST TO URL")
    //     console.log(url)
    //     const formData = new FormData();
    //     formData.append("seedUserHandle", seedUserHandle)
    //     formData.append("intent", "addSeedUser")
    //     const response: Response = await action({
    //         request: new Request(url, { method: "POST", body: formData }),
    //         params: { streamName: streamName },
    //         context: {}
    //     })
    //     // TODO: Why doesn't this action return a promise like the loader...?
    //     expect(response).toHaveProperty("u")
    //     expect(response.u.properties).toHaveProperty("username", seedUserHandle)
    // })

// });


