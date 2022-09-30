import { redirect } from "@remix-run/node";
import type { LoaderArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, NavLink, Outlet, useLoaderData } from "@remix-run/react";
import invariant from "tiny-invariant";
import type { Record } from 'neo4j-driver'
import { driver } from "~/neo4j.server";

import type { getTweet } from "~/models/tweets.server";

type LoaderData = {
    // this is a handy way to say: "posts is whatever type getStreams resolves to"
    tweet: Awaited<ReturnType<typeof getTweet>>;
}

async function readTweets(driver: any) {
    // Create a Session for the `people` database
    const session = driver.session()

    // Create a node within a write transaction
    const res = await session.writeTransaction((tx: any) => {
        return tx.run(
            `MATCH (u:User {username: 'nicktorba'})-[:POSTED]->(t:Tweet) Return t`
        )
    })
    // Get the `p` value from the first record
    console.log("first record:")
    console.log(res.records[0]);
    const tweets = res.records.map((row: Record) => {
        return row.get("t")
    })
    // Close the sesssion
    await session.close()

    // Return the properties of the node
    // console.log(p.properties)
    return tweets
}

export async function loader({ request, params }: LoaderArgs) {
    // let tweet = await getTweet(params.tweetId)

    let tweets = await readTweets(driver)

    // let tweet = json<LoaderData>({
    //     tweet: getTweet(params.tweetId),
    // })
    return json(tweets)
};

export default function StreamsPage() {
    const tweet = useLoaderData<LoaderData>();
    return (
        <div>
            <pre>{JSON.stringify(tweet, null, 2)}</pre>
        </div>
    );
}
