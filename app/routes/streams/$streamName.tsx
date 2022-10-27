import type { ActionArgs, LoaderArgs } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useCatch, useLoaderData, Outlet, useTransition, useFetcher, useSearchParams } from "@remix-run/react";
import { Link, useParams } from "@remix-run/react";
import invariant from "tiny-invariant";
import { ApiResponseError } from "twitter-api-v2";
import { log } from '~/log.server';
import { BiNetworkChart } from 'react-icons/bi';
import { MdUpdate } from 'react-icons/md';
import { MdExpandMore, MdExpandLess } from 'react-icons/md';
import {
    deleteStreamByName,
    addSeedUserToStream,
    getUserFromTwitter,
    getStreamByName,
    removeSeedUserFromStream,
    getStreamTweetsNeo4j,
    writeStreamListTweetsToNeo4j,
    createStream,
    updateStreamTweets,
    indexMoreTweets,
    StreamTweetsEntityCounts
} from "~/models/streams.server";

import Overview from "~/components/Overview";
import { indexUser } from "~/models/user.server";

import { getUserByUsernameDB, createUserDb } from "~/models/user.server";
import { createList, getClient, USER_FIELDS, handleTwitterApiError, getUserOwnedTwitterLists } from '~/twitter.server';


import Tweet from '~/components/Tweet';
import ContextAnnotationChip from '~/components/ContextAnnotationChip';
import { useParams, useLocation } from "@remix-run/react";

import notifierQueue from "~/queues/notifier.server";
import processTweetsQueue from "~/queues/processTweets.server";
import { useEffect, useRef, useState } from "react";
import { int } from "neo4j-driver";
import { url } from "inspector";

const TWEET_LOAD_LIMIT = 25

export async function loader({ request, params }: LoaderArgs) {
    invariant(params.streamName, "streamName not found");
    console.time("getStreamByName")
    const url = new URL(request.url);
    if (url.searchParams.get("clearAllTopics")) {
        return redirect(`/streams/${params.streamName}`)
    }
    let { stream, creator, seedUsers } = await getStreamByName(params.streamName)
    console.timeEnd("getStreamByName")
    if (!stream) {
        throw new Response("Not Found", { status: 404 });
    }
    console.time("getting client in $streamName")
    const { api, uid, session } = await getClient(request);

    // TODO: use for the queue if I go back to that method...
    const activeTokens = api.getActiveTokens()
    const bearerToken = activeTokens.bearerToken;

    console.time("getting loggedInUser in $streamName.tsx")
    const loggedInUser = (await api.v2.me()).data
    console.timeEnd("getting loggedInUser in $streamName.tsx")
    // 2

    if (!stream.properties.twitterListId || stream.properties.twitterListId.length < 1) { // this is for legacy streams
        if (loggedInUser.username != creator.properties.username) {
            throw json(
                { message: "Sorry, you didn't create this stream and it is out of date... please check back later" }
                , 603
            );
        }
        const { list, members } = await createList(api, stream.properties.name, [])
        stream = await createStream(
            stream.properties.name,
            stream.properties.startTime,
            loggedInUser,
            list.data.id
        )
        seedUsers.forEach(async (user) => {
            await addSeedUserToStream(api, stream, user.user)
        })
    } else {
        let list
        //3, load list         
        let listMembers = { errors: [] }
        try {
            listMembers = await api.v2.listMembers(stream.properties.twitterListId)
        } catch (e) {
            log.error(`error getting listMembers for '${list.data}': ${JSON.stringify(e, null, 2)}`);
        }
        // TODO: GO BACK THROUGH THIS LOGIC. HOW DO I WANT TO HANDLE A LIST HAVING BEEN DELETED... 
        if (
            listMembers?.errors.length > 0 &&
            listMembers.errors[0].type == 'https://api.twitter.com/2/problems/resource-not-found'
        ) {
            console.log("list dissapeared... creating a new one")
            if (loggedInUser.username != creator.properties.username) {
                throw json(
                    { message: "FUCK Sorry, you didn't create this stream and it is out of date... please check back later" }
                    , 603
                );
            }
            let newList = await createList(api, stream.properties.name, seedUsers.map((user) => (user.user.properties.username)))
            list = newList.list
            await createStream(
                stream.properties.name,
                stream.properties.startTime,
                loggedInUser,
                list.data.id
            )
        }

        // TODO: update stream :CONTAINS and list members in twitter list
        // this allows people to add users on twitter and seeing the changes in TWeetscape

        // Assume equal for now
        // if (listMembers.data.meta.result_count != seedUsers.length) {
        //     seedUsers.forEach(async (user) => {
        //         console.log(user.user)
        //         await addSeedUserToStream(api, stream, user.user)
        //     })
        // }
    }

    if (url.searchParams.get("indexMoreTweets")) {
        await indexMoreTweets(api, seedUsers)
        url.searchParams.delete("indexMoreTweets")
        return redirect(url.toString())
    }
    await updateStreamTweets(api, seedUsers)
    let tweets = await getStreamTweetsNeo4j(stream, 0, TWEET_LOAD_LIMIT, url.searchParams.getAll("topicFilter"))
    const entityDistribution = await StreamTweetsEntityCounts(params.streamName)
    return json(
        {
            "stream": stream,
            "tweets": tweets,
            seedUsers: seedUsers,
            entityDistribution: entityDistribution
        }
    )
}

type ActionData =
    | {
        errors: { seedUserHandle: null | string },
        recommendedUsers: [],
    }
    | undefined;


// export async function action: ActionFunction ({ request, params }: ActionArgs) {
// export const action: ActionFunction = async ({ request, params }: ActionArgs) {
export const action: ActionFunction = async ({
    request, params
}) => {
    // Responsible for editing the stream

    // structure from https://egghead.io/lessons/remix-add-delete-functionality-to-posts-page-in-remix, which was from https://github.com/remix-run/remix/discussions/3138
    invariant(params.streamName, "streamName not found");

    // Load More Data (page should never be part of user facing url, it is fetched with the fetcher as a non-navigation)
    const url = new URL(request.url);
    const nextpage = url.searchParams.get('page');
    if (nextpage) {
        console.log("fetching data for next page")
        console.log(nextpage)
        let { stream, creator, seedUsers } = await getStreamByName(params.streamName)
        let tweets = await getStreamTweetsNeo4j(stream, TWEET_LOAD_LIMIT * int(nextpage), TWEET_LOAD_LIMIT, url.searchParams.getAll("topicFilter"))
        return { "tweets": tweets }
    }
    const formData = await request.formData();

    // Check for and setup Topic Filters 
    const newTopicFilter = formData.get("topicFilter")
    const currentTopicFilterParams = url.searchParams.getAll("topicFilter")
    if (newTopicFilter && currentTopicFilterParams.indexOf(newTopicFilter) == -1) {
        console.log(`adding ${newTopicFilter} to list of current topic filters`)
        url.searchParams.append("topicFilter", newTopicFilter)
        console.log(`redirecting to url ${url.toString()}`)
        return redirect(url.toString())
    } else if (newTopicFilter && currentTopicFilterParams.indexOf(newTopicFilter) != -1) {
        console.log(`removing entity ${newTopicFilter} from list of current entities`)
        // thanks to this person: https://github.com/whatwg/url/issues/335#issuecomment-1142139561
        const allValues = url.searchParams.getAll("topicFilter")
        allValues.splice(allValues.indexOf(newTopicFilter), 1)
        url.searchParams.delete("topicFilter")
        allValues.forEach((val) => url.searchParams.append("topicFilter", val))
        return redirect(url.toString())
    }

    // Handle Seed User Operations
    const intent = formData.get("intent");
    let seedUserHandle: string = formData.get("seedUserHandle");
    if (intent === "delete") {
        const { api, limits, uid, session } = await getClient(request);
        let res = await deleteStreamByName(api, params.streamName);
        return redirect(`/streams`);
    }

    const { stream, seedUsers } = await getStreamByName(params.streamName);

    if (!stream) {
        throw new Response("Not Found", { status: 404 });
    }
    if (intent === "addSeedUser") {
        console.log("GETING TO ADD SEED USER")
        let errors: ActionData = {
            errors: seedUserHandle ? null : "seedUserHandle is required"
        }
        const hasErrors = Object.values(errors).some(
            (errorMessage) => errorMessage
        );
        if (hasErrors) {
            return json<ActionData>(errors);
        }
        const { api, limits, uid, session } = await getClient(request);
        for (const seedUser of seedUsers) {
            console.log(`${seedUser.user.properties.username} == ${seedUserHandle}`);
            if (seedUser.user.username == seedUserHandle) {
                let errors: ActionData = {
                    seedUserHandle: `user '${seedUserHandle}' already seed user of stream '${stream.properties.name}'`
                }
                return json<ActionData>(errors) || null;
            }
        }

        seedUserHandle = seedUserHandle.toLowerCase().replace(/^@/, '')
        let addedUser;
        let user = await getUserByUsernameDB(seedUserHandle);
        if (!user) {
            console.time("getUserFromTwitter")
            user = await getUserFromTwitter(api, seedUserHandle); // This func already flattens the data
            console.timeEnd("getUserFromTwitter")
            if (!user) {
                const errors: ActionData = {
                    seedUserHandle: `handle '${seedUserHandle}' not found... please check spelling"`
                }
                return json<ActionData>(errors); // throw error if user is not found;
            } else {
                user = await createUserDb(user)
            }
        }
        console.time("addSeedUserToStream")
        addedUser = await addSeedUserToStream(api, stream, user) // this adds a list member and an edge, it doesn't do follows or tweets fetching...
        console.timeEnd("addSeedUserToStream")
        await indexUser(api, limits, user)
        console.log(`Added user ${user.properties.username} to stream ${stream.properties.name}`)
        return redirect(`/streams/${params.streamName}`)
    } else if (intent === "removeSeedUser") {
        let user = await getUserByUsernameDB(seedUserHandle);
        const { api, uid, session } = await getClient(request);
        await api.v2.removeListMember(stream.properties.twitterListId, user.properties.id)
        let deletedRel = await removeSeedUserFromStream(
            stream.properties.name,
            user.properties.username
        )
        return deletedRel;
    }
}

const eqSet = (xs: Set<string>, ys: Set<string>) =>
    xs.size === ys.size &&
    [...xs].every((x) => ys.has(x));

export default function Feed() {
    // Responsible for rendering a feed & annotations
    let { streamName } = useParams();
    const [searchParams] = useSearchParams();
    const topicFilterSearchParams = new Set(searchParams.getAll("topicFilter"));
    const topicFilters = useRef(new Set([]) as Set<string>)

    const [overview, setOverview] = useState(true)
    let transition = useTransition();
    let busy = transition.submission;
    const loaderData = useLoaderData();
    const entityDistribution = loaderData.entityDistribution
    const [tweets, setTweets] = useState(loaderData.tweets);
    const stream = loaderData.stream;
    const page = useRef(0)
    const fetcher = useFetcher()

    useEffect(() => {
        console.log("in topicFiltersSearchparams useEffect")
        if (!eqSet(topicFilterSearchParams, topicFilters.current)) {
            console.log("SEEING A CHANGE, resetting tweets...")
            topicFilters.current = topicFilterSearchParams
            setTweets(loaderData.tweets)
        }
    }, [topicFilterSearchParams])

    useEffect(() => {
        if (fetcher.data) {
            if (fetcher.data.tweets.length == 0) {
                // TODO: actuall go do this
                alert("There are no more tweets indexed in our db for this stream! Please click 'Index More Tweets' to index more tweets!")
            }
            page.current += 1
            console.log(`adding ${fetcher.data.tweets.length} more tweets to tweets in memory`)
            console.log(`at page ${page.current} of tweets`)
            setTweets((prevTweets) => [...prevTweets, ...fetcher.data.tweets])
        }
    }, [fetcher.data])

    // TODO: Decide if I would rather Have a "No Labels" warning...
    // const emptyTopic = {
    //     labels: ['Entity'],
    //     properties: { name: 'No Labels', },
    // }
    // tweets.forEach((row, index: number) => {
    //     if (row.entities.length == 0) {
    //         row.entities.push(emptyTopic)
    //     }
    // })

    let annotations = new Set();
    for (const t of tweets) {
        if (t.annotation && t.annotation.length > 0) {
            for (let annotation of t.annotation) {
                annotations.add(annotation.properties.normalized_text)
            }
        }
    }
    const annotationMap = Array.from(annotations)
    const actionData = useActionData();

    let errors = {};
    if (actionData) {
        errors = actionData.errors;
        // recommendedUsers = actionData.recommendedUsers;
    }

    if (transition.state == "loading") {
        return (
            <div className="flex px-4 py-2  z-10">
                <div className='relative max-h-screen overflow-y-auto pb-12 border-2'>
                    <div className="grow lg:w-3/4 lg:mx-2 2xl:mx-auto">
                        loading newest tweets for your stream...
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex px-4 py-2  z-10">
            <div className='relative max-h-screen overflow-y-auto pb-12 border-2'>
                <div className="sticky top-0 mx-auto backdrop-blur-lg bg-slate-50 bg-opacity-60 p-1 rounded-xl">
                    <div className="flex flex-row justify-between p-3 bg-slate-50 rounded-lg">
                        <p className="text-xl font-medium">{stream.properties.name}</p>
                        <div className="flex flex-wrap mb-4">
                            <p>{tweets.length} tweets loaded for view!</p>
                            <fetcher.Form
                                method="post"
                                action={`/streams/${streamName}?page=${page.current + 1}&${searchParams.toString()}`}
                                className="w-full h-hull"
                            >
                                <button
                                    type='submit'
                                    name="intent"
                                    className="my-1 mx-1  text-center cursor-pointer rounded-full hover:bg-slate-200 bg-purple-200"
                                >
                                    Load More Tweets
                                </button>
                            </fetcher.Form>
                            <Link
                                to={`/streams/${streamName}?${searchParams.toString()}&indexMoreTweets=true`}
                                className="my-1 mx-1  text-center cursor-pointer rounded-full hover:bg-slate-200 bg-red-200"
                            >
                                Index More Tweets
                            </Link>
                        </div>
                        {/* DEV: Update Stream Tweets / Stream Follower Network */}
                        <div className="flex flex-row space-x-2">
                            <Form
                                method='post'
                            >
                                <button
                                    type='submit'
                                    className='inline-block rounded border border-gray-300 bg-gray-200 w-8 h-8 text-white text-xs'
                                    value="updateStreamTweets"
                                    name="intent"
                                >
                                    <MdUpdate />
                                </button>
                            </Form>
                            <Form
                                method='post'
                            >
                                <button
                                    type='submit'
                                    className='\inline-block rounded border border-gray-300 bg-gray-200 w-8 h-8 text-white text-xs'
                                    value="updateStreamFollowsNetwork"
                                    name="intent"
                                >
                                    <BiNetworkChart />
                                </button>
                            </Form>
                        </div>
                    </div>
                    <div>

                        {
                            overview ?
                                <div className="relative w-full mx-auto flex flex-col items-center">
                                    <Overview
                                        entityDistribution={entityDistribution.entityDistribution}
                                        tweets={tweets}  >
                                    </Overview>
                                    <button
                                        type='submit'
                                        value="addSeedUser"
                                        name="intent"
                                        onClick={() => setOverview(false)}
                                        className="w-full my-1 mx-1 flex flex-col items-center cursor-pointer rounded-full bg-slate-100 hover:bg-slate-200"
                                    >
                                        <MdExpandLess className="self-center" style={{ fontSize: "4rem" }} />
                                    </button>
                                </div>
                                :
                                <button
                                    type='submit'
                                    value="addSeedUser"
                                    name="intent"
                                    onClick={() => setOverview(true)}
                                    className="w-full my-1 mx-1 flex flex-col items-center cursor-pointer rounded-full bg-slate-100 hover:bg-slate-200"
                                >
                                    <MdExpandMore style={{ fontSize: "4rem" }} />
                                </button>
                        }
                    </div>

                    <div className="flex flex-row hidden">
                        <p>Tags</p>
                        <ol>
                            {annotationMap.map((annotation: string) => (
                                <li key={annotation}>{annotation}</li>
                            ))}
                        </ol>
                    </div>
                </div>

                <div className="grow lg:w-3/4 lg:mx-2 2xl:mx-auto">
                    {busy ?
                        <div>LOADING</div> :
                        <div>
                            {
                                tweets.map((tweet: any, index: number) => (
                                    <div key={`showTweets-${tweet.tweet.properties.id}-${index}`}>
                                        <Tweet key={tweet.tweet.id} tweet={tweet} searchParams={searchParams} />
                                    </div>
                                ))
                            }

                            <fetcher.Form
                                method="post"
                                action={`/streams/${streamName}?page=${page.current + 1}&${searchParams.toString()}`}
                                className="w-full h-hull"
                            >
                                <button
                                    type='submit'
                                    name="intent"
                                    className="my-1 mx-1  text-center cursor-pointer rounded-full hover:bg-slate-200 bg-purple-200"
                                >
                                    Load More Tweets
                                </button>
                            </fetcher.Form>

                            <Link
                                to={`/streams/${streamName}?${searchParams.toString()}&indexMoreTweets=true`}
                                className="my-1 mx-1  text-center cursor-pointer rounded-full hover:bg-slate-200 bg-red-200"
                            >
                                Index More Tweets
                            </Link>

                        </div>
                    }
                </div>
            </div>

        </div >
    );
}

export function ErrorBoundary({ error }: { error: Error }) {
    console.error(error);

    return <div>An unexpected error occurred: {error.message}</div>;
}

export function CatchBoundary() {
    const caught = useCatch();
    if (caught.status === 404) {
        return <div>Note not found, {caught.data}</div>;
    } else if (caught.status === 603) {
        return <div>{caught.data.message}</div>
    }
    throw new Error(`Unexpected caught response with status: ${caught.status}`);
}
