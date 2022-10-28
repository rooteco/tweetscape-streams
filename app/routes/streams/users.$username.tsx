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
import CompactProfile from '~/components/CompactProfile';




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
                    {/* <!-- Profile Card! --> */}
                    <div className="border-2 mb-2 rounded">
                        <div className="flex">
                            <h2 className="text-xl mr-4 my-auto leading-6 font-bold text-gray-600">{data.user.properties.name}</h2>
                            <p className="text-sm mr-4 my-auto leading-5 font-medium text-gray-600">{data.user.properties.username}</p>
                            <span
                                className={`bg-purple-200 ml-auto m-2 p-2 rounded-full text-gray-900  font-semibold text-sm ursor-pointer active:bg-gray-300 transition duration-300 ease`}
                            >
                                Person
                            </span>
                        </div>
                        <div className="flex items-center">
                            <img
                                style={{ height: "9rem", width: "9rem" }}
                                className="md rounded-full relative border-4 border-gray-900"
                                src={data.user.properties.profile_image_url.split("_normal")[0] + "_400x400." + data.user.properties.profile_image_url.split(".").slice(-1)[0]} alt=""
                            />
                            <p
                                className="text-gray-400 text-xl p-6 leading-tight"
                            >
                                {data.user.properties.description}
                            </p>
                        </div>
                        <hr />
                        <div className="flex">
                            <div className="text-center pr-3"><span className="font-bold text-gray-400">{data.user.properties["public_metrics.following_count"]}</span><span className="text-gray-600"> Following</span></div>
                            <div className="text-center px-3"><span className="font-bold text-gray-400">{data.user.properties["public_metrics.followers_count"]}</span><span className="text-gray-600"> Followers</span></div>
                        </div>
                    </div>
                    <pre>{JSON.stringify(data.user, null, 2)}</pre>
                </div>
                <div className="just-a-border h-full p-6 text-left flex-1 flex-grow">
                    <h1 className="mb-2 text-sm font-medium uppercase">
                        You and {params.username} both follow these accounts:
                    </h1>
                    {data.metaFollowers.map((user: userNode) => (
                        <CompactProfile user={user} key={user.elementId} streamName={"fakeness for now"} />
                    ))}
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
