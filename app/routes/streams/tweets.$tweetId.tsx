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
    return (
        <div className='overflow-y-auto'>
            <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
    );
}
