import type { ActionArgs, LoaderArgs } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useCatch, useLoaderData } from "@remix-run/react";
import invariant from "tiny-invariant";

import { TimeAgo } from '~/components/timeago';


import { getStream, getStreamTweets, deleteStreamByName, addSeedUserToStream, getUserFromTwitter, getStreamByName, removeSeedUserFromStream } from "~/models/streams.server";
import { getUserByUsernameDB, createUser, getUsersFollowedById } from "~/models/user.server";
import { log } from '~/log.server';
import { seed } from "prisma/seed";
import { getClient } from '~/twitter.server';

async function getStreamByNameNeo(name: string) {
    let res = await fetch(`http://localhost:5000/api/streams/${name}`)
    // console.log("HERE IS THE PROBLEM");
    // console.log(await res.text());
    let data = await res.json();
    return data
}

export async function loader({ request, params }: LoaderArgs) {
    // const userId = await requireUserId(request);
    invariant(params.streamName, "streamName not found");
    // const stream = await getStreamByName({ name: params.streamName });
    const stream = await getStreamByNameNeo(params.streamName)
    if (!stream.stream) {
        throw new Response("Not Found", { status: 404 });
    }

    let followingMap = new Map();
    for (let seedUser of stream.seedUsers) {
        let follows = await getUsersFollowedById(seedUser.id);
        // let followsUsernames: Array<String> = [];
        follows.map((i: any) => {
            if (followingMap.get(i.following.username)) {
                let cur = followingMap.get(i.following.username);
                cur.push(seedUser.username)
                followingMap.set(
                    i.following.username,
                    cur
                );
            } else {
                followingMap.set(i.following.username, [seedUser.username])
            }

        });
    }
    let recommended_users: Array<object> = []
    followingMap.forEach(
        (val, key) => {
            if (val.length > 2) {
                recommended_users.push(
                    {
                        "num_followers": val.length,
                        "username": key,
                        "followed_by": val
                    }
                )
            }
        }
    );
    console.log("recommended_users");
    console.log(recommended_users.length);


    // Get Stream Tweets 
    const tweets = await getStreamTweets(stream);

    return json({
        "stream": stream,
        "recommended_users": recommended_users,
        "tweets": tweets
    });
}

type ActionData =
    | {
        seedUserHandle: null | string;
    }
    | undefined;


// export async function action: ActionFunction ({ request, params }: ActionArgs) {
// export const action: ActionFunction = async ({ request, params }: ActionArgs) {
export const action: ActionFunction = async ({
    request, params
}) => {
    // structure from https://egghead.io/lessons/remix-add-delete-functionality-to-posts-page-in-remix, which was from https://github.com/remix-run/remix/discussions/3138
    invariant(params.streamName, "streamName not found");
    const formData = await request.formData();
    const intent = formData.get("intent");
    console.log("intent = ");
    console.log(intent);
    if (intent === "delete") {
        let res = await deleteStreamByName(params.streamName);
        return redirect("/streams");
    }
    let seedUserHandle = formData.get("seedUserHandle");
    let errors: ActionData = {
        seedUserHandle: seedUserHandle ? null : "seedUserHandle is required"
    }
    const hasErrors = Object.values(errors).some(
        (errorMessage) => errorMessage
    );
    if (hasErrors) {
        return json<ActionData>(errors);
    }

    let stream = await getStreamByNameNeo(params.streamName);
    if (!stream) {
        throw new Response("Not Found", { status: 404 });
    }

    if (intent === "addSeedUser") {
        const { api, uid, session } = await getClient(request);
        for (const seedUser of stream.seedUsers) {
            console.log(`${seedUser.username} == ${seedUserHandle}`);
            if (seedUser.username == seedUserHandle) {
                let errors: ActionData = {
                    seedUserHandle: `user '${seedUserHandle}' already seed user of stream '${stream.name}'`
                }
                return json<ActionData>(errors);
            }
        }
        seedUserHandle = seedUserHandle.toLowerCase().replace(/^@/, '')
        console.log("ABOUT TOO MAKE REQEUST...")
        console.log(`http://localhost:5000/api/streams/${params.streamName}`)
        const res = await fetch(
            `http://localhost:5000/api/streams/${params.streamName}`,
            {
                method: "POST",
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: seedUserHandle,
                })
            }
        );
        const data = await res.text()
        return redirect(`/streams/${params.streamName}`)

    } else if (intent === "removeSeedUser") {
        let user = await getUserByUsernameDB(seedUserHandle);
        removeSeedUserFromStream(
            stream,
            user
        )
        return null;
    }
}

export default function StreamDetailsPage() {
    const data = useLoaderData<typeof loader>();
    const stream = data.stream;
    const recommended_users = data.recommended_users;
    const tweets = data.tweets;
    const errors = useActionData();

    return (
        <div className="flex">
            <div>
                <h2 className="text-2xl font-bold">{stream.stream.name}</h2>
                <p>startTime: {stream.stream.start_time}, endTime: {stream.stream.end_time}</p>
                <hr className="my-4" />
                <Form
                    method='post'
                    className='sticky top-2 my-8 mx-auto flex max-w-sm'
                >
                    <label>
                        {errors?.seedUserHandle ? (
                            <em className="text-red-600">{errors.seedUserHandle}</em>
                        ) : null}
                        <input
                            type='text'
                            name="seedUserHandle"
                            placeholder='Enter any Twitter handle'
                            className='flex-1 rounded border-2 border-black px-2 py-1'
                        />
                    </label>
                    <button
                        type='submit'
                        className='ml-2 inline-block rounded border-2 border-black bg-black px-2 py-1 text-white'
                        value="addSeedUser"
                        name="intent"
                    >
                        Add Seed User
                    </button>
                </Form>
                <h1 className="text-2xl">Seed Users</h1>
                <ol>
                    {stream.seedUsers.map((seedUser) => (
                        <li className="flex" key={seedUser.id}>
                            <p className="my-auto">{seedUser.username}</p>
                            <Form
                                method='post'
                                className='top-2 my-8 flex'
                            >
                                <input
                                    type='hidden'
                                    name="seedUserHandle"
                                    placeholder='Enter any Twitter handle'
                                    className='flex-1 rounded border-2 border-black px-2 py-1'
                                    value={seedUser.username}
                                />
                                <button
                                    type='submit'
                                    className='ml-2 inline-block rounded border-2 border-black bg-black px-2 py-1 text-white'
                                    value="removeSeedUser"
                                    name="intent"
                                >
                                    Remove Seed User
                                </button>
                            </Form>
                        </li>
                    ))}
                </ol>
                <h2 className="text-2xl">Showing {recommended_users.length} recommended users</h2>
                <ol>
                    {recommended_users.map((user) => (
                        <li className="flex" key={user.username}>
                            <p className="my-auto">{user.username}</p>
                            <Form
                                method='post'
                                className='my-2 py-2 my-auto flex'
                            >

                                <input
                                    type='hidden'
                                    value={user.username}
                                    name="seedUserHandle"
                                    placeholder='Enter any Twitter handle'
                                    className='flex-1 rounded border-2 border-black px-2 py-1'
                                />
                                <button
                                    type='submit'
                                    className='ml-2 inline-block rounded border-2 border-black bg-black px-2 py-1 text-white'
                                    value="addSeedUser"
                                    name="intent"
                                >
                                    Add Seed User
                                </button>
                            </Form>
                        </li>
                    ))}
                </ol>
                <Form method="post">
                    <button
                        type="submit"
                        className="rounded bg-blue-500  py-2 px-4 text-white hover:bg-blue-600 focus:bg-blue-400"
                        value="delete"
                        name="intent"
                    >
                        Delete Stream
                    </button>
                </Form>
            </div>
            <main className='mx-auto max-h-screen max-w-screen-sm overflow-auto'>
                <h2 className="text-2xl font-bold">Feed</h2>
                <hr className="my-4" />
                {tweets
                    .sort(
                        (a, b) =>
                            new Date(b.created_at as string).valueOf() -
                            new Date(a.created_at as string).valueOf()
                    )
                    .map((tweet) => (
                        <div className='mx-2 my-6 flex' key={tweet.id}>
                            <img
                                className='h-12 w-12 rounded-full border border-gray-300 bg-gray-100'
                                alt=''
                                src={tweet.author.profile_image_url}
                            />
                            <article key={tweet.id} className='ml-2.5 flex-1'>
                                <header>
                                    <h3>
                                        <a
                                            href={`https://twitter.com/${tweet.author.username}`}
                                            target='_blank'
                                            rel='noopener noreferrer'
                                            className='mr-1 font-medium hover:underline'
                                        >
                                            {tweet.author.name}
                                        </a>
                                        <a
                                            href={`https://twitter.com/${tweet.author.username}`}
                                            target='_blank'
                                            rel='noopener noreferrer'
                                            className='text-sm text-gray-500'
                                        >
                                            @{tweet.author.username}
                                        </a>
                                        <span className='mx-1 text-sm text-gray-500'>·</span>
                                        <a
                                            href={`https://twitter.com/${tweet.author.username}/status/${tweet.id}`}
                                            target='_blank'
                                            rel='noopener noreferrer'
                                            className='text-sm text-gray-500 hover:underline'
                                        >
                                            <TimeAgo
                                                locale='en_short'
                                                datetime={new Date(tweet.created_at ?? new Date())}
                                            />
                                        </a>
                                    </h3>
                                </header>
                                <p
                                    dangerouslySetInnerHTML={{ __html: tweet.html ?? tweet.text }}
                                />
                            </article>
                        </div>
                    ))}
            </main>
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
        return <div>Note not found</div>;
    }

    throw new Error(`Unexpected caught response with status: ${caught.status}`);
}
