import type { LoaderArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { USER_FIELDS } from '~/twitter.server';
import { getUserContextAnnotationFrequency, getStreamsUserIn, getUserIndexedTweets } from '~/models/user.server';

import { getTwitterClientForUser } from '~/twitter.server';
import { requireUserSession } from "~/utils";


export async function loader({ request }: LoaderArgs) {
    const { uid } = await requireUserSession(request); // will automatically redirect to login if uid is not in the session
    const { api } = await getTwitterClientForUser(uid)
    const meData = await api.v2.me({ "user.fields": USER_FIELDS });
    let user = meData.data;
    const streams = await getStreamsUserIn(user.username)
    const tweets = await getUserIndexedTweets(user.username)
    const frequencies = await getUserContextAnnotationFrequency(user.username)
    frequencies[0].forEach((item: any) => { item.count = item.count.toInt() })
    return json({ user, frequencies: frequencies[0], streams, tweets })
};

export default function StreamsPage() {
    const data = useLoaderData();
    const user = data.user
    const frequencies = data.frequencies
    frequencies.sort((a, b) => b.count - a.count);
    return (
        <div>
            <h1>Streams You are Included In</h1>
            <ol>
                {data.streams.map((stream: Node) => {
                    return (
                        <li key={stream.properties.name}>
                            {stream.properties.name}
                        </li>
                    )
                })}
            </ol>
            <p>We've indexed {data.tweets.length} tweets, in date ranges for {data.streams.length} streams</p>
            <br />
            <section>
                <h2>Top Tags From Your Tweets</h2>
                {/* <D3BarChart data={data.frequencies.slice(0, 5)} /> */}
            </section>
            <pre>{JSON.stringify(user, null, 2)}</pre>
        </div >
    );
}
