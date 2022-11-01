import type { ActionArgs, LoaderArgs } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useCatch, useLoaderData, Outlet, useTransition } from "@remix-run/react";
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
} from "~/models/streams.server";

import { indexUser } from "~/models/user.server";

import { getUserByUsernameDB, createUserDb } from "~/models/user.server";
import { createList, getClient, USER_FIELDS, handleTwitterApiError, getUserOwnedTwitterLists } from '~/twitter.server';


import Tweet from '~/components/Tweet';
import ContextAnnotationChip from '~/components/ContextAnnotationChip';
import { useParams, useLocation } from "@remix-run/react";

import notifierQueue from "~/queues/notifier.server";
import processTweetsQueue from "~/queues/processTweets.server";
import { ConstructionOutlined } from "@mui/icons-material";


export async function loader({ request, params }: LoaderArgs) {
    invariant(params.streamName, "streamName not found");
    console.time("getStreamByName")
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

    let tweets = await getStreamTweetsNeo4j(stream)

    return json(
        {
            "stream": stream,
            "tweets": tweets,
            seedUsers: seedUsers
        }
    )
}


// export async function action: ActionFunction ({ request, params }: ActionArgs) {
// export const action: ActionFunction = async ({ request, params }: ActionArgs) {

export default function Feed() {
    // Responsible for rendering a feed & annotations
    const { streamName } = useParams();
    const overview = useLocation().pathname.split("/").pop() === "overview"
    let transition = useTransition();
    let busy = transition.submission;

    const { tweets, stream } = useLoaderData();

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
        <div className='overflow-auto'>
            <pre>{JSON.stringify(tweets, null, 2)}</pre>
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
