import { redirect } from "@remix-run/node";
import type { LoaderArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, NavLink, Outlet, useLoaderData } from "@remix-run/react";
import invariant from "tiny-invariant";


// import { getNoteListItems } from "~/models/note.server";
// import { requireUserId } from "~/session.server";
// import { useUser } from "~/utils";

import { getTweet } from "~/models/streams.server";

// type LoaderData = {
//     // this is a handy way to say: "posts is whatever type getStreams resolves to"
//     tweet: Awaited<ReturnType<typeof getTweet>>;

// }

export async function loader({ request, params }: LoaderArgs) {
    console.log("in tweets laoder")
    console.log(params.tweetId)
    invariant(params.tweetId, "tweetId not found");
    console.log("LOADING");
    console.log(params.tweetId);
    let { tweet, relNodes } = await getTweet(params.tweetId)
    return json({ tweet, relNodes });
};

export default function StreamsPage() {
    const { tweet, relNodes } = useLoaderData();
    console.log("-----")
    console.log(relNodes);
    return (
        <div>
            <pre>{JSON.stringify(tweet.properties, null, 2)}</pre>
            <pre>{JSON.stringify(relNodes, null, 2)}</pre>
        </div>
    );
}
