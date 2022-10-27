import { redirect } from "@remix-run/node";
import type { LoaderArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useParams, useSearchParams, useTransition } from "@remix-run/react";
import invariant from "tiny-invariant";

import { getTweet } from "~/models/streams.server";
import { getMetaFollowers, getUserByUsernameDB, getUserIndexedTweets } from "~/models/user.server";
import { getClient } from "~/twitter.server";
import Tweet from '~/components/Tweet';
import { indexUser } from "~/models/user.server";



export async function loader({ request, params }: LoaderArgs) {
    invariant(params.username, "username not found");
    const { api, limits, uid, session } = await getClient(request)
    let user = await getUserByUsernameDB(params.username)
    await indexUser(api, limits, user)
    const loggedInUser = (await api.v2.me()).data
    let metaFollowers = await getMetaFollowers(loggedInUser.username, params.username)
    let tweets = await getUserIndexedTweets(params.username)
    return json({ user, metaFollowers, tweets });
};

export default function TweetRawDataPage() {
    let transition = useTransition();
    if (transition.submission) {
        return (<div>Loading User Info!</div>)
    }
    const params = useParams();
    const searchParams = useSearchParams();
    const data = useLoaderData();
    data.tweets.sort((a, b) => (b.tweet.properties['public_metrics.like_count'] - a.tweet.properties['public_metrics.like_count']))
    return (
        <div className='h-full overflow-y-auto'>
            <div className="flex flex-row flex-nowrap items-top gap-5 justify-center py-12">
                <div className="just-a-border h-full p-6 text-left flex-1 overflow-x-auto">
                    <div className="mb-2 text-sm font-medium uppercase">Account Info</div>
                    <pre>{JSON.stringify(data.user, null, 2)}</pre>
                </div>
                <div className="just-a-border h-full p-6 text-left flex-1 flex-grow">
                    <h1 className="mb-2 text-sm font-medium uppercase">
                        You and {params.username} both follow these accounts:
                    </h1>
                    <pre>
                        {
                            data.metaFollowers.map((row) => (<p>{row.properties.username} - {row.properties["public_metrics.followers_count"]}</p>))
                        }
                    </pre>
                </div>
                <div className="just-a-border h-full p-6 text-left flex-1 flex-grow">
                    <h1 className="mb-2 text-sm font-medium uppercase">
                        {params.username} top 5 liked tweets (from our index)
                    </h1>
                    {
                        data.tweets.slice(0, 5).map((tweet: any, index: number) => (
                            <div key={`showTweets-${tweet.tweet.properties.id}-${index}`}>
                                <Tweet tweet={tweet} />
                            </div>
                        ))
                    }
                </div>
            </div>
        </div>
    );
}
