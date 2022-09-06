import { redirect } from "@remix-run/node";
import type { LoaderArgs } from "@remix-run/node";
import BirdIcon from '~/icons/bird';
import { json } from "@remix-run/node";
import type { Session } from '@remix-run/node';

import { Form, useActionData, Link, NavLink, Outlet, useLoaderData } from "@remix-run/react";
import { prisma } from "~/db.server";
import { log } from '~/log.server';
import type { LoaderFunction } from '@remix-run/node';

import { commitSession, getSession } from '~/session.server';
import { TwitterApi } from 'twitter-api-v2';
import { flattenTwitterData } from "~/models/streams.server";
import { getClient } from '~/twitter.server';

import { getStreams } from "~/models/streams.server";
type LoaderData = {
    // this is a handy way to say: "posts is whatever type getStreams resolves to"
    streams: Awaited<ReturnType<typeof getStreams>>;
    user: any
}

export function getUserIdFromSession(session: Session) {
    const userId = session.get('uid') as string | undefined;
    const uid = userId ? String(userId) : undefined;
    return uid;
}

// export async function loader({ request }: LoaderArgs) {
export const loaderAuth2: LoaderFunction = async ({ request }: LoaderArgs) => {
    let streams = await getStreams();
    let user = null;
    const url = new URL(request.url);
    const redirectURI = "http://localhost:3000/streams";



    // const { session, uid } = await getLoggedInSession(request);
    // const { api } = await getTwitterClientForUser(uid);

    const stateId = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const session = await getSession(request.headers.get('Cookie'));
    const uid = getUserIdFromSession(session);
    console.log(`UID = ${uid}`);
    if (uid) {
        const { api, uid, session } = await getClient(request);

        // console.log("searching users...")
        // const users = await api.v1.searchUsers("nick");
        // console.log("SHOW SEARCH OBJECT");
        // console.log(users.users);

        const meData = await api.v2.me({ "user.fields": "created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld", });
        user = meData.data;
    }
    if (stateId && code) {
        console.log("STATEID AND CODE MATCHED...");
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
            log.info('Fetching logged in user from Twitter API...');
            const { data } = await api.v2.me({ "user.fields": "created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld", });
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
        }
    }
    const headers = { 'Set-Cookie': await commitSession(session) };
    return json<LoaderData>(
        {
            streams: streams,
            user: user,
        },
        { headers }
    )
}

export default function StreamsPage() {
    const data = useLoaderData<LoaderData>();
    const streams = data.streams;
    const user = data.user;
    const errors = useActionData();

    console.log(`USER = ${user}`);
    return (
        <div className="flex h-full min-h-screen flex-col">
            <header className="flex items-center justify-between bg-slate-800 p-4 text-white">
                <h1 className="text-3xl font-bold">
                    <Link to=".">Streams</Link>
                </h1>
                <p>Build Tweetscape Streams!</p>
                {
                    user && (
                        <Form action="/logout" method="post" className='hover:bg-blue-500 active:bg-blue-600 mr-1.5 flex truncate items-center text-white text-xs bg-sky-800 rounded px-2 h-6'>
                            <BirdIcon className='shrink-0 w-3.5 h-3.5 mr-1 fill-white' />
                            <button
                                type="submit"
                                className="rounded py-2 px-4 text-blue-100"
                            >
                                Logout {user.username}
                            </button>
                        </Form>
                    )
                }
                {!user && (
                    <div className="flex">
                        <Link
                            className='hover:bg-blue-500 active:bg-blue-600 mr-1.5 flex truncate items-center text-white text-xs bg-sky-500 rounded px-2 h-6'
                            to='/oauth'
                        >
                            <BirdIcon className='shrink-0 w-3.5 h-3.5 mr-1 fill-white' />
                            <span>Login with Twitter</span>
                        </Link>
                    </div>
                )}
            </header>

            <main className="flex h-full bg-white">
                <div className="h-full w-80 border-r bg-gray-50">
                    <Link to="/streams" className="block p-4 text-xl text-blue-500">
                        + New Stream
                    </Link>

                    <hr />

                    {streams.length === 0 ? (
                        <p className="p-4">No streams yet</p>
                    ) : (
                        <ol>
                            {streams.map((stream) => (
                                <li key={stream.id}>
                                    <NavLink
                                        className={({ isActive }) =>
                                            `block border-b p-4 text-xl ${isActive ? "bg-white" : ""}`
                                        }
                                        to={stream.name}
                                    >
                                        📝 {stream.name}
                                    </NavLink>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>

                <div className="flex-1 p-6">
                    {
                        user && (
                            <div>
                                <h1>Create New Stream</h1>
                                <Form method="post" className='flex my-8 max-w-sm'>
                                    <label> Stream Name
                                        {errors?.streamName ? (
                                            <em className="text-red-600">{errors.streamName}</em>
                                        ) : null}
                                        <input name="name" type="text" className='flex-1 rounded border-2 border-black px-2 py-1' />{" "}
                                    </label>
                                    <br />
                                    <button type="submit" className='ml-2 inline-block rounded border-2 border-black bg-black px-2 py-1 text-white'>Create Stream</button>
                                </Form>
                            </div>
                        )
                    }
                    {!user && (
                        <div>
                            <p className="pb-4">Choose a stream from the sidebar to explore, or login with twitter to create your own</p>
                            <div className="flex">
                                <Link
                                    className='hover:bg-blue-500 active:bg-blue-600 w-auto mr-1.5 flex truncate items-center text-white text-xs bg-sky-500 rounded px-2 h-6'
                                    to='/oauth'
                                >
                                    <BirdIcon className='shrink-0 w-3.5 h-3.5 mr-1 fill-white' />
                                    <span>Login with Twitter to Create Streams</span>
                                </Link>
                            </div>
                        </div>
                    )}
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
