import type { ActionArgs, LoaderArgs } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useCatch, useLoaderData, Outlet, useTransition } from "@remix-run/react";
import { Link, useParams } from "@remix-run/react";
import invariant from "tiny-invariant";
import { ApiResponseError } from "twitter-api-v2";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { log } from '~/log.server';

import {
    deleteStreamByName,
    addSeedUserToStream,
    getUserFromTwitter,
    getStreamByName,
    removeSeedUserFromStream,
    getStreamTweetsFromList,
    createStream,
} from "~/models/streams.server";


import { getUserByUsernameDB, createUserDb } from "~/models/user.server";
import { createList, getClient, USER_FIELDS, handleTwitterApiError, getUserOwnedTwitterLists } from '~/twitter.server';

import { Tooltip } from "@mui/material";

import HubIcon from '@mui/icons-material/Hub';
import UpdateIcon from '@mui/icons-material/Update';

import Tweet from '~/components/Tweet';
import ContextAnnotationChip from '~/components/ContextAnnotationChip';
import { useParams, useLocation } from "@remix-run/react";


export async function loader({ request, params }: LoaderArgs) {
    // TODO: refactor to get only tweets and annotations
    // TODO: move lists and recommended users logic to /streams

    invariant(params.streamName, "streamName not found");
    console.time("getStreamByName")
    let { stream, creator, seedUsers } = await getStreamByName(params.streamName)
    console.timeEnd("getStreamByName")
    if (!stream) {
        throw new Response("Not Found", { status: 404 });
    }
    console.time("getting client in $streamName")
    const { api, uid, session } = await getClient(request);
    console.timeEnd("getting client in $streamName")
    console.time("getting loggedInUser in $streamName.tsx")
    const loggedInUser = (await api.v2.me()).data
    console.timeEnd("getting loggedInUser in $streamName.tsx")
    // 2
    let tweets;
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
    console.time("getStreamTweetsFromList in $streamName.tsx")
    tweets = await getStreamTweetsFromList(api, stream, stream.properties.name, stream.properties.startTime);
    console.timeEnd("getStreamTweetsFromList in $streamName.tsx")
    return json({
        "stream": stream,
        "tweets": tweets,
        seedUsers: seedUsers,
    });

    // TWEET FILTERING IDKKKK MAN
    // tweets = tweets.filter((tweetData: any) => {
    //     for (let rel of tweetData.refTweetRels) {
    //         if (rel.properties.type == "retweeted") {
    //             return false
    //         } else if (rel.properties.type == "replied_to" && tweetData.tweet.properties.text.length < 150) {
    //             return false
    //         }
    //         else {
    //             return true
    //         }
    //     }
    // })
    return json({
        "stream": stream,
        "tweets": tweets,
        seedUsers: seedUsers,
    });
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
    const formData = await request.formData();
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
        addedUser = await addSeedUserToStream(api, stream, user)
        console.timeEnd("addSeedUserToStream")
        console.log(`Added user ${user.properties.username} to stream ${stream.properties.name}`)
        return redirect(`/streams/${params.streamName}/overview`)
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
    // else if (intent === "addSeedUsersFromList") {
    //     const { api, uid, session } = await getClient(request);
    //     let listId = formData.get("listId") as string;
    //     addTwitterListToStream(api, stream, listId);
    //     return null;
    // } else if (intent === "updateStreamTweets") {
    //     const { api, limits } = await getClient(request);
    //     updateStreamTweets(api, stream, seedUsers.map((item: any) => (item.user)))
    //     return null;
    // } else if (intent === "updateStreamFollowsNetwork") {
    //     const { api, limits } = await getClient(request);
    //     updateStreamFollowsNetwork(api, limits, stream, seedUsers)
    //     return null;
    // }
}

export default function Feed() {
    // Responsible for rendering a feed & annotations
    const { streamName } = useParams();
    const overview = useLocation().pathname.split("/").pop() === "overview"
    let transition = useTransition();
    let busy = transition.submission;

    const { tweets, stream } = useLoaderData();

    const emptyTopic = {
        labels: ['Entity'],
        properties: { name: 'No Labels', },
    }
    tweets.forEach((row, index: number) => {
        if (row.entities.length == 0) {
            row.entities.push(emptyTopic)
        }
    })

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

    return (
        <div className="flex px-4 py-2  z-10">
            <div className='relative max-h-screen overflow-y-auto pb-12 border-2'>
                <div className="sticky top-0 mx-auto backdrop-blur-lg bg-slate-50 bg-opacity-60 p-1 rounded-xl">
                    <div className="flex flex-row justify-between p-3 bg-slate-50 rounded-lg">
                        <p className="text-xl font-medium">{stream.properties.name}</p>
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
                                    <Tooltip title="Update Stream Tweets">
                                        <UpdateIcon fontSize="small" />
                                    </Tooltip>

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
                                    <Tooltip title="Update Stream Follower">
                                        <HubIcon fontSize="small" />
                                    </Tooltip>
                                </button>
                            </Form>
                        </div>
                    </div>

                    <div className="relative w-full mx-auto flex flex-col items-center">
                        <Outlet />
                        {overview ?
                            <Link className="w-full h-hull" to={`/streams/${streamName}`}>
                                <div className="my-1 mx-1  text-center cursor-pointer rounded-full bg-slate-50 hover:bg-slate-200">
                                    <ExpandLessIcon sx={{ fontSize: "1rem" }} />
                                </div>
                            </Link>
                            :
                            <Link className="w-full h-hull" to={`/streams/${streamName}/overview`}>
                                <div className="my-1 mx-1  text-center cursor-pointer rounded-full bg-slate-50 hover:bg-slate-200">
                                    <ExpandMoreIcon sx={{ fontSize: "1rem" }} />
                                </div>
                            </Link>

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
                        tweets.map((tweet: any, index: number) => (
                            <div key={`showTweets-${tweet.tweet.properties.id}-${index}`}>
                                <Tweet key={tweet.tweet.id} tweet={tweet} />
                                <div className="flex flex-wrap">
                                    {
                                        tweet.entities &&
                                        tweet.entities.map((entity: Record, index: number) => (
                                            <div>
                                                <ContextAnnotationChip keyValue={entity.properties.name} value={null} caEntities={[]} hideTopics={[]} key={`entityAnnotationsUnderTweet-${entity.properties.name}-${index}`} />
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        ))}
                </div>
            </div>

        </div>
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
    } else if (caught.status === 400) {
        return <div>here the fuck i am baby</div>
    } else if (caught.status === 603) {
        return <div>{caught.data.message}</div>
    }
    throw new Error(`Unexpected caught response with status: ${caught.status}`);
}
