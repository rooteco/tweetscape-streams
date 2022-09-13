import type { ActionArgs, LoaderArgs } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useCatch, useLoaderData } from "@remix-run/react";
import invariant from "tiny-invariant";
import { TimeAgo } from '~/components/timeago';
import { getStreamRecommendedUsers, getStreamTweets, deleteStreamByName, addSeedUserToStream, getUserFromTwitter, getStreamByName, removeSeedUserFromStream } from "~/models/streams.server";
import { getUserByUsernameDB, createUserDb } from "~/models/user.server";
import { getClient } from '~/twitter.server';


export async function loader({ request, params }: LoaderArgs) {
    console.log("IN DATA LOADER")
    // const userId = await requireUserId(request);
    invariant(params.streamName, "streamName not found");
    console.time("getStreamByName")
    const { stream, seedUsers } = await getStreamByName(params.streamName)
    console.timeEnd("getStreamByName")
    if (!stream) {
        throw new Response("Not Found", { status: 404 });
    }
    console.time("getStreamTweets")
    const tweets = await getStreamTweets(stream.properties.name, stream.properties.startTime, stream.properties.endTime);
    console.timeEnd("getStreamTweets")


    // Getting Recommended Users
    // The getStreamRecommendedUsers returns a list of nodes, and a count of the number of seed users those accounts as followed by
    // This makes sure that we check all the way down to 2 overlapping seed users to make sure recommendations are provided
    let recommendedUsers = [];
    if (seedUsers.length > 1) {
        console.time("getStreamRecommendedUsers")
        recommendedUsers = await getStreamRecommendedUsers(stream.properties.name)
        console.timeEnd("getStreamRecommendedUsers")
    }

    let numSeedUsersFollowedBy = seedUsers.length + 1;
    let recommendedUsersTested = [];
    if (recommendedUsers.length > 0) {
        while (recommendedUsersTested.length < 5 && numSeedUsersFollowedBy > 1) {
            recommendedUsersTested = [];
            numSeedUsersFollowedBy--;
            recommendedUsers[0].map((row: any) => {
                if (row.count.toInt() >= numSeedUsersFollowedBy) {
                    recommendedUsersTested.push(row.item)
                }
            })
            console.log(`found ${recommendedUsersTested.length} users followed by ${numSeedUsersFollowedBy} users`)
        }
    }

    return json({
        "stream": stream,
        "seedUsers": seedUsers,
        "tweets": tweets,
        "recommendedUsers": recommendedUsersTested,
        "numSeedUsersFollowedBy": numSeedUsersFollowedBy
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
    // structure from https://egghead.io/lessons/remix-add-delete-functionality-to-posts-page-in-remix, which was from https://github.com/remix-run/remix/discussions/3138
    invariant(params.streamName, "streamName not found");
    const formData = await request.formData();
    const intent = formData.get("intent");
    if (intent === "delete") {
        let res = await deleteStreamByName(params.streamName);
        return redirect("/streams");
    }
    let seedUserHandle: string = formData.get("seedUserHandle");
    console.time("getStreamByName")
    const { stream, seedUsers } = await getStreamByName(params.streamName);
    console.timeEnd("getStreamByName")

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
        console.log(hasErrors);
        if (hasErrors) {
            return json<ActionData>(errors);
        }
        const { api, uid, session } = await getClient(request);
        for (const seedUser of seedUsers) {
            console.log(`${seedUser.properties.username} == ${seedUserHandle}`);
            if (seedUser.username == seedUserHandle) {
                let errors: ActionData = {
                    seedUserHandle: `user '${seedUserHandle}' already seed user of stream '${stream.properties.name}'`
                }
                return json<ActionData>(errors);
            }
        }
        seedUserHandle = seedUserHandle.toLowerCase().replace(/^@/, '')
        let user = await getUserByUsernameDB(seedUserHandle);
        if (!user) {

            console.time("getUserFromTwitter")
            let user = await getUserFromTwitter(api, seedUserHandle); // This func already flattens the data
            console.timeEnd("getUserFromTwitter")
            if (!user) {
                const errors: ActionData = {
                    seedUserHandle: `handle '${seedUserHandle}' not found... please check spelling"`
                }
                return json<ActionData>(errors); // throw error if user is not found;
            } else {
                user = await createUserDb(user)
                console.time("addSeedUserToStream")
                addSeedUserToStream(api, stream, user)
                console.timeEnd("addSeedUserToStream")
            }
        } else {
            console.time("addSeedUserToStream")
            addSeedUserToStream(api, stream, user)
            console.timeEnd("addSeedUserToStream")
        }
        console.log("Done adding seed user to stream")
        // return redirect(`/streams/${params.streamName}`)
        return null;

    } else if (intent === "removeSeedUser") {
        console.log("IN REMOVESEEDUSER")
        let user = await getUserByUsernameDB(seedUserHandle);
        console.log(stream.properties.name)
        console.log(user.properties.name)
        removeSeedUserFromStream(
            stream.properties.name,
            user.properties.username
        )
        return null;
    }
}

export default function StreamDetailsPage() {
    const data = useLoaderData<typeof loader>();
    const stream = data.stream;
    const seedUsers = data.seedUsers;
    const tweets = data.tweets;
    const numSeedUsersFollowedBy = data.numSeedUsersFollowedBy
    let annotations = new Set();
    for (const t of tweets) {
        if (t.annotation) {
            annotations.add(t.annotation.properties.normalized_text)
        }
    }
    const annotationMap = Array.from(annotations)
    const recommendedUsers = data.recommendedUsers;
    const actionData = useActionData();
    let errors = {};
    if (actionData) {
        errors = actionData.errors;
        // recommendedUsers = actionData.recommendedUsers;
    }
    return (
        <div className="flex">
            <div>
                <h2 className="text-2xl font-bold">{stream.properties.name}</h2>
                <p>startTime: {stream.properties.startTime}, endTime: {stream.properties.endTime}</p>
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
                    {seedUsers.map((seedUser: any) => (
                        <li className="flex" key={seedUser.properties.id}>
                            <p className="my-auto">{seedUser.properties.username}</p>
                            <Form
                                method='post'
                                className='top-2 my-8 flex'
                            >
                                <input
                                    type='hidden'
                                    name="seedUserHandle"
                                    placeholder='Enter any Twitter handle'
                                    className='flex-1 rounded border-2 border-black px-2 py-1'
                                    value={seedUser.properties.username}
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

                <div>
                    {(recommendedUsers.length > 0) && (
                        <div>
                            <h2 className="text-2xl">Showing {recommendedUsers.length} recommended users, follwed by at least {numSeedUsersFollowedBy} seed users</h2>
                            <ol>
                                {recommendedUsers.map((user: any) => (
                                    <li className="flex" key={user.properties.username}>
                                        <p className="my-auto">{user.properties.username}</p>
                                        <Form
                                            method='post'
                                            className='my-2 py-2 my-auto flex'
                                        >

                                            <input
                                                type='hidden'
                                                value={user.properties.username}
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
                        </div>
                    )}
                </div>
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
                <p>Tags included in this feed (turn this into a filter)</p>
                <ol>
                    {annotationMap.map((annotation: string) => (
                        <li key={annotation}>{annotation}</li>
                    ))}
                </ol>
                {tweets
                    .sort(
                        (a: any, b: any) =>
                            new Date(b.tweet.created_at as string).valueOf() -
                            new Date(a.tweet.created_at as string).valueOf()
                    )
                    .map((tweet: any) => (
                        <div className='mx-2 my-6 flex' key={tweet.tweet.properties.id}>
                            <img
                                className='h-12 w-12 rounded-full border border-gray-300 bg-gray-100'
                                alt=''
                                src={tweet.author.properties.profile_image_url}
                            />
                            <article key={tweet.tweet.properties.id} className='ml-2.5 flex-1'>
                                <header>
                                    <h3>
                                        <a
                                            href={`https://twitter.com/${tweet.author.properties.username}`}
                                            target='_blank'
                                            rel='noopener noreferrer'
                                            className='mr-1 font-medium hover:underline'
                                        >
                                            {tweet.author.properties.name}
                                        </a>
                                        <a
                                            href={`https://twitter.com/${tweet.author.properties.username}`}
                                            target='_blank'
                                            rel='noopener noreferrer'
                                            className='text-sm text-gray-500'
                                        >
                                            @{tweet.author.properties.username}
                                        </a>
                                        <span className='mx-1 text-sm text-gray-500'>·</span>
                                        <a
                                            href={`https://twitter.com/${tweet.author.properties.username}/status/${tweet.tweet.properties.id}`}
                                            target='_blank'
                                            rel='noopener noreferrer'
                                            className='text-sm text-gray-500 hover:underline'
                                        >
                                            <TimeAgo
                                                locale='en_short'
                                                datetime={new Date(tweet.tweet.properties.created_at ?? new Date())}
                                            />
                                        </a>
                                        <span className='mx-1 text-sm text-gray-500'>·</span>
                                        <a
                                            href={`/streams/tweets/${tweet.tweet.properties.id}`}
                                            target='_blank'
                                            rel='noopener noreferrer'
                                            className='text-sm text-gray-500 hover:underline'
                                        >
                                            analyze
                                        </a>
                                    </h3>
                                </header>
                                <p
                                    dangerouslySetInnerHTML={{ __html: tweet.html ?? tweet.tweet.properties.text }}
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
        return <div>Note not found, {caught.data}</div>;
    }

    throw new Error(`Unexpected caught response with status: ${caught.status}`);
}
