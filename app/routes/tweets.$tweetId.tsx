import { redirect } from "@remix-run/node";
import type { LoaderArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import invariant from "tiny-invariant";

import { getTweet } from "~/models/streams.server";

export async function loader({ request, params }: LoaderArgs) {
    invariant(params.tweetId, "tweetId not found");
    let data = await getTweet(params.tweetId)
    return json(data);
};

export default function TweetRawDataPage() {
    const data = useLoaderData();
    const tweet = data[0]
    console.log(tweet.entities.map((entity, index) => {
        return `${index}) ${entity.properties.name}, domain=${tweet.domains[index].properties.name}`
    }))
    return (
        <div className='overflow-auto max-h-screen'>
            <pre>{JSON.stringify(data, null, 2)}</pre>
            <pre>{JSON.stringify(data.map((row) => (``)), null, 2)}</pre>
        </div>
    );
}
