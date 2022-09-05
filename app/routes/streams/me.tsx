import { redirect } from "@remix-run/node";
import type { LoaderArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, NavLink, Outlet, useLoaderData } from "@remix-run/react";
import invariant from "tiny-invariant";
import { getClient } from '~/twitter.server';


// import { getTweet } from "~/models/tweets.server";

// type LoaderData = {
//     // this is a handy way to say: "posts is whatever type getStreams resolves to"
//     tweet: Awaited<ReturnType<typeof getTweet>>;
// }

export async function loader({ request, params }: LoaderArgs) {
    const { api, uid, session } = await getClient(request);
    const meData = await api.v2.me({ "user.fields": "created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld", });
    let user = meData.data;
    return json(user)
};

export default function StreamsPage() {
    const user = useLoaderData();
    console.log("-----")
    console.log(user);
    return (
        <div>
            <pre>{JSON.stringify(user, null, 2)}</pre>
        </div>
    );
}
