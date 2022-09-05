import { redirect } from "@remix-run/node";
import type { LoaderArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, NavLink, Outlet, useLoaderData } from "@remix-run/react";
import invariant from "tiny-invariant";


// import { getNoteListItems } from "~/models/note.server";
// import { requireUserId } from "~/session.server";
// import { useUser } from "~/utils";

import { getTweet } from "~/models/tweets.server";

type LoaderData = {
    // this is a handy way to say: "posts is whatever type getStreams resolves to"
    tweet: Awaited<ReturnType<typeof getTweet>>;
}

export async function loader({ request, params }: LoaderArgs) {
    invariant(params.tweetId, "tweetId not found");
    console.log("LOADING");
    console.log(params.tweetId);
    let tweet = await getTweet(params.tweetId)
    // let tweet = json<LoaderData>({
    //     tweet: getTweet(params.tweetId),
    // })
    console.log(Object.keys(tweet));
    return json(tweet)
};

export default function StreamsPage() {
    const tweet = useLoaderData<LoaderData>();
    console.log("-----")
    console.log(tweet);
    return (
        <div>
            <pre>{JSON.stringify(tweet, null, 2)}</pre>
        </div>
    );
}
