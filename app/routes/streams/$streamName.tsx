import type { ActionArgs, LoaderArgs } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useCatch, useLoaderData, Outlet, useTransition } from "@remix-run/react";


import Downshift from "downshift";
import { useEffect } from "react";
import invariant from "tiny-invariant";


import {
    addTwitterListToStream,
    getStreamRecommendedUsers,
    getStreamTweets, deleteStreamByName,
    addSeedUserToStream,
    getUserFromTwitter,
    getStreamByName,
    removeSeedUserFromStream,
    getAllUserLists,
    updateStreamTweets,
    updateStreamFollowsNetwork
} from "~/models/streams.server";


import { getUserByUsernameDB, createUserDb } from "~/models/user.server";
import { getClient, USER_FIELDS, handleTwitterApiError } from '~/twitter.server';

import { Tooltip } from "@mui/material";

import HubIcon from '@mui/icons-material/Hub';
import UpdateIcon from '@mui/icons-material/Update';

import Tweet from '~/components/Tweet';

import { useParams } from "@remix-run/react";

export async function loader({ request, params }: LoaderArgs) {
    // TODO: refactor to get only tweets and annotations
    // TODO: move lists and recommended users logic to /streams

    invariant(params.streamName, "streamName not found");

    console.time("getStreamByName")
    const { stream, seedUsers } = await getStreamByName(params.streamName)
    console.timeEnd("getStreamByName")

    if (!stream) {
        throw new Response("Not Found", { status: 404 });
    }

    console.time("getStreamTweets")
    const tweets = await getStreamTweets(stream.properties.name, stream.properties.startTime);
    console.timeEnd("getStreamTweets")

    // console.log(tweets.map((item) => (item.author.properties.username)))

    // Getting Recommended Users
    // The getStreamRecommendedUsers returns a list of nodes, and a count of the number of seed users those accounts as followed by
    // This makes sure that we check all the way down to 2 overlapping seed users to make sure recommendations are provided
    /* 
    let recommendedUsers = [];
    if (seedUsers.length > 1) {
        recommendedUsers = await getStreamRecommendedUsers(stream.properties.name)
    }

    let numSeedUsersFollowedBy = seedUsers.length + 1;
    let recommendedUsersTested: any[] = [];
    if (recommendedUsers.length > 0) {
        while (recommendedUsersTested.length < 5 && numSeedUsersFollowedBy > 1) {
            recommendedUsersTested = [];
            numSeedUsersFollowedBy--;
            recommendedUsers[0].map((row: any) => {
                if (row.count.toInt() >= numSeedUsersFollowedBy) {
                    recommendedUsersTested.push(row.item)
                }
            })
            // console.log(`found ${recommendedUsersTested.length} users followed by ${numSeedUsersFollowedBy} users`)
        }
    
    }

    recommendedUsersTested.sort((a, b) => a.properties['public_metrics.followers_count'] - b.properties['public_metrics.followers_count'])


    let userLists = [];
    const { api, uid, session } = await getClient(request)
    if (api) {
        const meData = await api.v2.me({ "user.fields": USER_FIELDS });
        userLists = await getAllUserLists(meData.data.username)
    }
    */

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
        let res = await deleteStreamByName(params.streamName);
        return res
    }

    const { stream, seedUsers } = await getStreamByName(params.streamName);
    if (!stream) {
        throw new Response("Not Found", { status: 404 });
    }
    try {
        if (intent === "addSeedUser") {
            let errors: ActionData = {
                errors: seedUserHandle ? null : "seedUserHandle is required"
            }

            const hasErrors = Object.values(errors).some(
                (errorMessage) => errorMessage
            );
            console.log(hasErrors);
            if (hasErrors) {
                console.log(errors)
                return json<ActionData>(errors);
            }
            const { api, limits, uid, session } = await getClient(request);
            for (const seedUser of seedUsers) {
                console.log(`${seedUser.user.properties.username} == ${seedUserHandle}`);
                if (seedUser.user.username == seedUserHandle) {
                    let errors: ActionData = {
                        seedUserHandle: `user '${seedUserHandle}' already seed user of stream '${stream.properties.name}'`
                    }
                    return json<ActionData>(errors);
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
                    console.time("addSeedUserToStream")
                    addedUser = await addSeedUserToStream(api, limits, stream, user)
                    console.timeEnd("addSeedUserToStream")
                }
            } else {
                console.time("addSeedUserToStream")
                addedUser = await addSeedUserToStream(api, limits, stream, user)
                console.timeEnd("addSeedUserToStream")
            }
            console.log(`Added user ${user.properties.username} to stream ${stream.properties.name}`)
            // return redirect(`/streams/${params.streamName}/overview`)
            return addedUser;

        } else if (intent === "removeSeedUser") {
            let user = await getUserByUsernameDB(seedUserHandle);
            console.log(stream.properties.name)
            console.log(user.properties.name)
            let deletedRel = await removeSeedUserFromStream(
                stream.properties.name,
                user.properties.username
            )
            return deletedRel;
        } else if (intent === "addSeedUsersFromList") {
            const { api, uid, session } = await getClient(request);
            let listId = formData.get("listId") as string;
            addTwitterListToStream(api, stream, listId);
            return null;
        } else if (intent === "updateStreamTweets") {
            const { api, limits } = await getClient(request);
            updateStreamTweets(api, stream, seedUsers.map((item: any) => (item.user)))
            return null;
        } else if (intent === "updateStreamFollowsNetwork") {
            const { api, limits } = await getClient(request);
            updateStreamFollowsNetwork(api, limits, stream, seedUsers)
            return null;
        }
    } catch (e) {
        return handleTwitterApiError(e);
    }
}

export default function Feed() {
    // Responsible for rendering a feed & annotations
    console.log("STREAMNAME LOADER")
    
    let transition = useTransition();
    let busy = transition.submission;

    const { tweets, stream } = useLoaderData();

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
        <div className="flex px-4 py-2 max-h-min z-10">
            <div className='relative max-h-screen overflow-y-auto'>
                <div className="sticky top-0 mx-auto backdrop-blur-lg p-1 rounded-xl">
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

                    <div className="flex flex-row hidden">
                        <p>Tags</p>
                        <ol>
                            {annotationMap.map((annotation: string) => (
                                <li key={annotation}>{annotation}</li>
                            ))}
                        </ol>
                    </div>
                </div>

                <div className="h-full mx-2">
                    {busy ?
                        <div>LOADING</div> :
                        tweets
                            .sort(
                                (a: any, b: any) =>
                                    new Date(b.tweet.created_at as string).valueOf() -
                                    new Date(a.tweet.created_at as string).valueOf()
                            )
                            .map((tweet: any) => (
                                <Tweet key={tweet.tweet.id} tweet={tweet} />
                            ))}
                </div>
            </div>
            <Outlet />
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
    }

    throw new Error(`Unexpected caught response with status: ${caught.status}`);
}
