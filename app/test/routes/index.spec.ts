import { loader } from "~/routes/streams";

describe("Run Loader", () => {
    test("Check the loader", async () => {
        const response: Response = await loader({
            request: new Request("http://localhost:3000/", { method: "GET" }),
            params: {},
            context: {},
        });
        expect(response.status).toBe(200);
    });
});
