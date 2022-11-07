import type { LoaderArgs } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useCatch, useLoaderData, useTransition, useFetcher, useSearchParams } from "@remix-run/react";
import { Link, useParams } from "@remix-run/react";
import invariant from "tiny-invariant";
import { log } from '~/log.server';
import { MdUpdate } from 'react-icons/md';
import { MdExpandMore, MdExpandLess } from 'react-icons/md';
import {
    deleteStreamByName,
    addSeedUserToStream,
    getUserFromTwitter,
    getStreamByName,
    removeSeedUserFromStream,
    getStreamTweetsNeo4j,
    createStream,
    updateStreamTweets,
    indexMoreTweets,
} from "~/models/streams.server";
import Overview from "~/components/Overview";
import { indexUser } from "~/models/user.server";
import { getUserNeo4j, createUserNeo4j } from "~/models/user.server";
import { createList, getTwitterClientForUser } from '~/twitter.server';
import Tweet from '~/components/Tweet';
import { useEffect, useRef, useState } from "react";
import { int } from "neo4j-driver";
import { requireUserSession } from "~/utils";


const TWEET_LOAD_LIMIT = 25

export async function loader({ request, params }: LoaderArgs) {
    invariant(params.streamName, "streamName not found");
    const url = new URL(request.url);
    const { uid } = await requireUserSession(request); // will automatically redirect to login if uid is not in the session

    console.time("getStreamByName")
    let { stream, creator, seedUsers } = await getStreamByName(params.streamName)
    console.timeEnd("getStreamByName")
    if (!stream) {
        throw new Response("Not Found", { status: 404 });
    }

    const { api } = await getTwitterClientForUser(uid)

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
        const { list } = await createList(api, stream.properties.name, [])
        stream = await createStream(
            { name: stream.properties.name, twitterListId: list.data.id },
            loggedInUser.username
        )
        seedUsers.forEach(async (user) => {
            await addSeedUserToStream(stream.properties.name, user.user.properties.username)
            await api.v2.addListMember(stream.properties.twitterListId, user.user.properties.id)
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
                { name: stream.properties.name, twitterListId: list.data.id },
                loggedInUser.username
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
    let tweets = await getStreamTweetsNeo4j(stream.properties.name, 0, TWEET_LOAD_LIMIT)
    return json(
        {
            "stream": stream,
            "tweets": tweets,
            seedUsers: seedUsers,
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
    const { uid } = await requireUserSession(request); // will automatically redirect to login if uid is not in the session

    // Load More Data (page should never be part of user facing url, it is fetched with the fetcher as a non-navigation)
    const url = new URL(request.url);
    const nextpage = url.searchParams.get('page');
    const { stream, seedUsers } = await getStreamByName(params.streamName)

    if (nextpage) {
        console.log("fetching data for next page")
        console.log(nextpage)
        let tweets = await getStreamTweetsNeo4j(stream.properties.name, TWEET_LOAD_LIMIT * int(nextpage), TWEET_LOAD_LIMIT)
        return { "tweets": tweets }
    }
    const formData = await request.formData();

    // Handle Seed User Operations
    const intent = formData.get("intent");
    let seedUserHandle: string = formData.get("seedUserHandle") as string;
    if (intent === "delete") {
        const { api } = await getTwitterClientForUser(uid);
        await deleteStreamByName(params.streamName);
        await api.v2.removeList(stream.properties.twitterListId)
        return redirect(`/streams`);
    }

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
        const { api, limits } = await getTwitterClientForUser(uid);
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
        let user = await getUserNeo4j(seedUserHandle);
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
                user = await createUserNeo4j(user)
            }
        }
        console.time("addSeedUserToStream")
        await addSeedUserToStream(stream.properties.name, user.properties.username) // this adds a list member and an edge, it doesn't do follows or tweets fetching...
        await api.v2.addListMember(stream.properties.twitterListId, user.properties.id)
        console.timeEnd("addSeedUserToStream")
        await indexUser(api, limits, user)
        console.log(`Added user ${user.properties.username} to stream ${stream.properties.name}`)
        return redirect(`/streams/${params.streamName}`)
    } else if (intent === "removeSeedUser") {
        let user = await getUserNeo4j(seedUserHandle);
        const { api } = await getTwitterClientForUser(uid);
        await api.v2.removeListMember(stream.properties.twitterListId, user.properties.id)
        await removeSeedUserFromStream(
            stream.properties.name,
            user.properties.username
        )
        return redirect(`/streams/${params.streamName}`);
    }
}

export default function Feed() {
    // Responsible for rendering a feed & annotations
    let { streamName } = useParams();
    const [searchParams] = useSearchParams();
    const showJsonFeed = searchParams.get("showjsonfeed")
    const [overview, setOverview] = useState(true)
    let transition = useTransition();
    let busy = transition.submission;
    const loaderData = useLoaderData();
    const [seedUsers, setSeedUsers] = useState(loaderData.seedUsers);
    const [tweets, setTweets] = useState(loaderData.tweets);
    const stream = loaderData.stream;

    const page = useRef(0)
    const fetcher = useFetcher()

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

    if (seedUsers != loaderData.seedUsers) {
        setSeedUsers(loaderData.seedUsers)
        setTweets(loaderData.tweets)
    }

    const actionData = useActionData();

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
                        </div>
                    </div>
                    <div>

                        {
                            overview ?
                                <div className="relative w-full mx-auto flex flex-col items-center">
                                    <Overview
                                        tweets={tweets}  >
                                    </Overview>
                                    <button
                                        type='submit'
                                        value="addSeedUser"
                                        name="intent"
                                        onClick={() => setOverview(false)}
                                        className="w-full my-1 mx-1 flex flex-col items-center cursor-pointer rounded-full bg-slate-100 hover:bg-slate-200"
                                    >
                                        <MdExpandLess className="self-center" style={{ fontSize: "2rem" }} />
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
                                    <MdExpandMore style={{ fontSize: "2rem" }} />
                                </button>
                        }
                    </div>
                </div>

                <div className="grow lg:w-3/4 lg:mx-2 2xl:mx-auto">
                    {busy ?
                        <div>LOADING</div> :
                        <div>
                            {
                                !showJsonFeed ?
                                    tweets.map((tweet: any, index: number) => (
                                        <div key={`showTweets-${tweet.tweet.properties.id}-${index}`}>
                                            <Tweet key={tweet.tweet.properties.id} tweet={tweet} />
                                        </div>
                                    )) :
                                    tweets.map((tweet: any, index: number) => (
                                        <div key={`showTweets-${tweet.tweet.properties.id}-${index}`}>
                                            <p>{tweet.author.properties.username}:  {tweet.tweet.properties.text} </p> <br></br>
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
