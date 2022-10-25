import { redirect, json } from "@remix-run/node";
import type { LoaderArgs } from "@remix-run/node";

import { useEffect, useState, useRef } from "react";
import { useParams } from "@remix-run/react";
import type { Session } from '@remix-run/node';
import { Form, useActionData, Link, NavLink, Outlet, useLoaderData } from "@remix-run/react";
import type { LoaderFunction } from '@remix-run/node';
import { TwitterApi } from 'twitter-api-v2';
// import { TwitterApiRateLimitPlugin } from '@twitter-api-v2/plugin-rate-limit';

import cn from 'classnames';
import StreamConfig from "~/components/StreamConfig";
import CompactProfile from "~/components/CompactProfile";

import { prisma } from "~/db.server";
import { log } from '~/log.server';
import { commitSession, getSession } from '~/session.server';
import { getUserTwitterLists } from "~/twitter.server";
import { flattenTwitterUserPublicMetrics } from "~/models/user.server";
// import { TwitterApiRateLimitDBStore } from '~/limit.server';
import { getClient, USER_FIELDS } from '~/twitter.server';
import type { ListV2 } from 'twitter-api-v2';
import {
    getStreams,
    migrateStreams,
    getAllStreams,
    addUserOwnedLists,
    addUserFollowedLists
} from "~/models/streams.server";


import StreamAccordion from '~/components/StreamAccordion';
import CreateAndLogin from "~/components/CreateAndLogin";
import ExportAndDelete from "~/components/ExportAndDelete";



import type { Stream } from "../components/StreamAccordion";


type LoaderData = {
    // this is a handy way to say: "posts is whatever type getStreams resolves to"
    // streams: Awaited<ReturnType<typeof getStreams>>;
    streams: Array<Stream>
    user: any
    lists: any
}

export function getUserIdFromSession(session: Session) {
    const userId = session.get('uid') as string | undefined;
    const uid = userId ? String(userId) : undefined;
    return uid;
}

function flattenTwitterData(data: Array<any>) {
    for (const obj of data) {
        obj.username = obj.username.toLowerCase();
        obj.public_metrics_followers_count = obj.public_metrics.followers_count;
        obj.public_metrics_following_count = obj.public_metrics.following_count;
        obj.public_metrics_tweet_count = obj.public_metrics.tweet_count;
        obj.public_metrics_listed_count = obj.public_metrics.listed_count;
        delete obj.public_metrics;
        delete obj.entities;
    }
    return data;
}

// export async function loader({ request }: LoaderArgs) {
export const loader: LoaderFunction = async ({ request }: LoaderArgs) => {
    console.time("getAllStreams in streams.tsx")
    let allStreams = await getAllStreams();
    console.timeEnd("getAllStreams in streams.tsx")
    let user = null;
    let userLists = { followedLists: [] as ListV2[], ownedLists: [] as ListV2[] }

    const url = new URL(request.url);
    const redirectURI: string = process.env.REDIRECT_URI as string;
    const stateId = url.searchParams.get('state');
    const code = url.searchParams.get('code');

    let session = await getSession(request.headers.get('Cookie'));
    let uid = getUserIdFromSession(session);
    console.log(`UID = ${uid}`);
    try {
        if (process.env.test) {
            const { api, uid, session } = await getClient(request);
            const meData = await api.v2.me({ "user.fields": USER_FIELDS });
            user = meData.data;
        }
        else if (uid) {
            console.time("getting client")
            const { api, uid, session } = await getClient(request);
            console.timeEnd("getting client")
            console.time("getting me in streams.tsx")
            user = (await api.v2.me()).data// fields not needed here { "user.fields": USER_FIELDS });
            console.timeEnd("getting me in streams.tsx")
        }
        else if (stateId && code) {
            const storedStateId = session.get('stateIdTwitter') as string;
            log.debug(`Checking if state (${stateId}) matches (${storedStateId})...`);
            if (storedStateId === stateId) {
                log.info('Logging in with Twitter OAuth2...');
                const client = new TwitterApi({
                    clientId: process.env.OAUTH_CLIENT_ID as string,
                    clientSecret: process.env.OAUTH_CLIENT_SECRET,
                });
                const {
                    client: api,
                    scope,
                    accessToken,
                    refreshToken,
                    expiresIn,
                } = await client.loginWithOAuth2({
                    code,
                    codeVerifier: session.get('codeVerifier') as string,
                    redirectUri: redirectURI
                    // redirectUri: getBaseURL(request),
                });

                //TODO: INSTANTIATE THIS API WITH THE RATE LIMIT PLUGIN SO IT STORES THIS IN REDIS AND RATE LIMITS ARE ACCURATE...

                log.info('Fetching logged in user from Twitter API...');
                const { data } = await api.v2.me({ "user.fields": USER_FIELDS });
                const context = `${data.name} (@${data.username})`;
                log.info(`Upserting user for ${context}...`);
                user = flattenTwitterData([data])[0];
                await prisma.users.upsert({
                    where: { id: user.id },
                    create: user,
                    update: user,
                })
                log.info(`Upserting token for ${context}...`);
                const token = {
                    user_id: user.id,
                    token_type: 'bearer',
                    expires_in: expiresIn,
                    access_token: accessToken,
                    scope: scope.join(' '),
                    refresh_token: refreshToken as string,
                    created_at: new Date(),
                    updated_at: new Date(),
                };
                await prisma.tokens.upsert({
                    create: token,
                    update: token,
                    where: { user_id: token.user_id },
                });
                log.info(`Setting session uid (${user.id}) for ${context}...`);
                session.set('uid', user.id.toString());
                // userLists = await getUserTwitterLists(api, user);
                // let owned = await addUserOwnedLists(user, userLists.ownedLists)
                // let followed = await addUserFollowedLists(user, userLists.followedLists)
            }
        }
    } catch (e) {
        console.log("you are unauthorized while getting client... please log back in...")
        console.log(e)
        const res = await fetch(url.origin + "/logout", {
            method: "POST"
        })
        return redirect("/streams")
    }
    const headers = { 'Set-Cookie': await commitSession(session) };
    return json<LoaderData>(
        {
            streams: allStreams,
            user: user,
            lists: userLists
        },
        { headers }
    )
}

export default function StreamsPage() {
    const { streams, user, lists } = useLoaderData<LoaderData>();
    const params = useParams();

    const errors = useActionData();

    const streamsRoot = useParams().streamName === undefined;

    return (
        <div className="h-screen flex flex-row-reverse">

            {/* Outlet for Stream Details and Feed (/$streamName) */}
            <div className="bg-gradient-to-r from-gray-50 via-white to-white grow px-4 py-2 lg:max-w-2xl 2xl:max-w-full  z-10">
                <Outlet />
            </div>

            <div className="flex flex-col border-r space-y-16 w-96 max-w-96 pr-4 pb-6 pl-6">
                <div className="relative flex flex-row space-x-2 w-full ml-2 mt-4">
                    {/* Either 'Create A Stream and Login/Logout' or 'Export Stream or Delete Stream' */}
                    {streamsRoot ? <CreateAndLogin user={user} /> : <ExportAndDelete user={user} />}

                    <div className="absolute right-6 top-12 flex flex-col items-end space-y-6 z-0">
                        <p className="text-lg font-bold justify-center align-middle text-gray-100/50" style={{ fontSize: 64 }}>Stream</p>
                        <p className="text-lg font-bold justify-center align-middle  text-gray-100/50" style={{ fontSize: 64 }}>Seeding</p>
                    </div>
                </div>

                {/* List of Streams */}
                <div className="flex flex-col space-y-0.5 flex-1 z-10">
                    <p className="ml-2 text-slate-400 font-medium text-xs"> {user ? `@${user.username}'s` : "Public"} Streams </p>
                    <StreamAccordion streams={streams} lists = {lists}/>
                </div>
            </div>
        </div>
    );
}


export function ErrorBoundary({ error }: { error: Error }) {
    console.error(error);
    return <div>An unexpected error occurred: {error.message}</div>;
}
