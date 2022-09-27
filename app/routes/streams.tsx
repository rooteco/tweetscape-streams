import { redirect, json } from "@remix-run/node";
import type { LoaderArgs } from "@remix-run/node";

import type { Session } from '@remix-run/node';
import { Form, useActionData, Link, NavLink, Outlet, useLoaderData } from "@remix-run/react";
import type { LoaderFunction } from '@remix-run/node';
import { TwitterApi } from 'twitter-api-v2';
import { TwitterApiRateLimitPlugin } from '@twitter-api-v2/plugin-rate-limit';

import { prisma } from "~/db.server";
import { log } from '~/log.server';
import { commitSession, getSession } from '~/session.server';
import { getUserTwitterLists } from "~/twitter.server";
import { flattenTwitterUserPublicMetrics } from "~/models/user.server";
import { TwitterApiRateLimitDBStore } from '~/limit.server';
import { getClient, USER_FIELDS } from '~/twitter.server';
import type { ListV2 } from 'twitter-api-v2';
import {
    getStreams,
    getAllStreams,
    addUserOwnedLists,
    addUserFollowedLists
} from "~/models/streams.server";

import Add from "@mui/icons-material/Add";
import StreamAccordion from '~/components/StreamAccordion';

import { Stream } from "../components/StreamAccordion";
import { couldStartTrivia } from "typescript";
import { useEffect } from "react";

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
    let allStreams = await getAllStreams();

    let user = null;
    let userLists = { followedLists: [] as ListV2[], ownedLists: [] as ListV2[] }


    const url = new URL(request.url);
    const redirectURI: string = process.env.REDIRECT_URI as string;
    const stateId = url.searchParams.get('state');
    const code = url.searchParams.get('code');

    let session = await getSession(request.headers.get('Cookie'));
    let uid = getUserIdFromSession(session);
    console.log(`UID = ${uid}`);



    if (process.env.test) {
        const { api, uid, session } = await getClient(request);
        const meData = await api.v2.me({ "user.fields": USER_FIELDS });
        user = meData.data;
    }
    else if (uid) {
        const { api, uid, session } = await getClient(request);
        const meData = await api.v2.me({ "user.fields": USER_FIELDS });
        user = meData.data;
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
            userLists = await getUserTwitterLists(api, user);
            let owned = await addUserOwnedLists(user, userLists.ownedLists)
            let followed = await addUserFollowedLists(user, userLists.followedLists)
        }
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

    useEffect(() => {
        console.log("user: ", user)
        console.log("lists: ", lists)
    })


    const errors = useActionData();

    return (
        <div className="max-h-screen h-screen flex flex-row-reverse bg-white">

            <div className="flex-1 px-4 py-2 max-w-lg max-h-min bg-fade z-10">
                {/* Outlet for Stream Details and Feed (/$streamName) */}
                <Outlet />
            </div>

            <div className="relative flex flex-col border-r space-y-16 w-96 pr-6 pb-6">
                {/* Create A Stream and Login/Logout */}
                <div className="flex flex-row space-x-2 w-full ml-2 mt-4">
                    <div className="h-full flex flex-col space-y-2 z-10">
                        <Link to="/streams" className="button-big py-2 pl-2 pr-8 rounded-2xl text-xl flex space-x-3 items-center" style={{ color: "#439AAF" }}>
                            <div id = "icon" className="center rounded-full hover:bg-slate-300/50">
                                <Add sx = {{fontSize: "2.5rem", fontWeight: "bold", opacity: "0.2" }} />
                            </div>
                            <div className="">
                                <p className="text-sm font-regular  -my-1" > Create </p>
                                <p className="text-sm font-regular" > a Stream </p>
                            </div>
                        </Link>
                        <div className="" >
                            {user ?
                                <Form 
                                    action="/logout" 
                                    method="post" 
                                    
                                >
                                    <button
                                        type="submit"
                                        className= 'pill flex items-center justify-center text-xs rounded-full h-8 w-full'
                                        style = {{color: "#4173C2"}}
                                        
                                    >
                                        <p>Logout</p>
                                    </button>
                                </Form>
                                :
                                <Link
                                    className=' mx-auto pill flex truncate items-center text-white text-xs bg-sky-500 rounded-full px-2 h-6'
                                    style = {{background: "#E5ECF7", border: "1 solid #D2DCED"}}
                                    to='/oauth'
                                >
                                    <span>Login</span>
                                </Link>
                            }
                        </div>
                    </div>
                    <div className="absolute justify-center align-middle -left-36 top-12 flex flex-col space-y-16 z-0">
                        <p className="text-xl font-semibold justify-center align-middle text-gray-100" style={{ fontSize: 96 }}>Stream</p>
                        <p className="text-xl font-bold justify-center align-middle  text-gray-100" style={{ fontSize: 96 }}>Seeding</p>
                    </div>
                </div>

                {/* List of Streams */}
                <div className="flex flex-col space-y-0.5 flex-1 z-10">
                    <p className="ml-2 text-slate-400 font-light text-sm"> {user ? `@${user.username}'s` : "Public"} Streams </p>
                    <div className="accordion-container radial-bg bg-gray-100 border border-gray-200 p-1 grow rounded z-0">
                        <StreamAccordion streams={streams} lists={lists} />
                    </div>
                </div>
            </div>
        </div>
    );
}
