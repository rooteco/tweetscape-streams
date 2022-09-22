import type { ActionArgs, LoaderArgs } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useCatch, useLoaderData } from "@remix-run/react";
import invariant from "tiny-invariant";
import { TimeAgo } from '~/components/timeago';
import { addTwitterListToStream, getStreamRecommendedUsers, getStreamTweets, deleteStreamByName, addSeedUserToStream, getUserFromTwitter, getStreamByName, removeSeedUserFromStream, getAllUserLists, updateStreamTweets, updateStreamFollowsNetwork } from "~/models/streams.server";
import { getUserByUsernameDB, createUserDb } from "~/models/user.server";
import { getClient, USER_FIELDS, handleTwitterApiError } from '~/twitter.server';
import Downshift from "downshift";

export async function loader({ request, params }: LoaderArgs) {
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
            console.log(`found ${recommendedUsersTested.length} users followed by ${numSeedUsersFollowedBy} users`)
        }
    }

    recommendedUsersTested.sort((a, b) => a.properties['public_metrics.followers_count'] - b.properties['public_metrics.followers_count'])


    let userLists = [];
    const { api, uid, session } = await getClient(request)
    if (api) {
        const meData = await api.v2.me({ "user.fields": USER_FIELDS });
        userLists = await getAllUserLists(meData.data.username)
    }
    return json({
        "stream": stream,
        "seedUsers": seedUsers,
        "tweets": tweets,
        "recommendedUsers": recommendedUsersTested,
        "numSeedUsersFollowedBy": numSeedUsersFollowedBy,
        "userLists": userLists
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
                return json<ActionData>(errors);
            }
            const { api, uid, session } = await getClient(request);
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
                    addedUser = await addSeedUserToStream(stream, user)
                    console.timeEnd("addSeedUserToStream")
                }
            } else {
                console.time("addSeedUserToStream")
                addedUser = await addSeedUserToStream(stream, user)
                console.timeEnd("addSeedUserToStream")
            }
            console.log(`Added user ${user.properties.username} to stream ${stream.properties.name}`)
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
            console.log("CORRECT INTENT")
            const { api, limits } = await getClient(request);
            updateStreamFollowsNetwork(api, limits, stream, seedUsers)
            return null;
        }
    } catch (e) {
        return handleTwitterApiError(e);
    }
}

export default function StreamDetailsPage() {
    const data = useLoaderData<typeof loader>();
    const stream = data.stream;
    const seedUsers = data.seedUsers;
    const tweets = data.tweets;
    const numSeedUsersFollowedBy = data.numSeedUsersFollowedBy
    const userLists = data.userLists;
    // const getItems = (value: any) => value ? matchSorter(userLists.map((i: any) => i.properties), value, { keys: ['name'] }) : userLists
    // const getItems = (value: any) => userLists.map((i: any) => i.properties.name)
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
                <p>startTime: {stream.properties.startTime}</p>
                <p>Following Network lastUpdatedAt: {stream.properties.followingLastUpdatedAt}</p>
                <div className="flex">
                    <Form
                        method='post'
                        className='sticky top-2 my-8 mx-auto flex max-w-sm'
                    >
                        <button
                            type='submit'
                            className='ml-2 inline-block rounded border-2 border-black bg-green-300 px-2 py-1 text-white'
                            value="updateStreamTweets"
                            name="intent"
                        >
                            Update Stream Tweets
                        </button>
                    </Form>
                    <Form
                        method='post'
                        className='sticky top-2 my-8 mx-auto flex max-w-sm'
                    >
                        <button
                            type='submit'
                            className='ml-2 inline-block rounded border-2 border-black bg-green-300 px-2 py-1 text-white'
                            value="updateStreamFollowsNetwork"
                            name="intent"
                        >
                            Update Stream Follower Network
                        </button>
                    </Form>
                </div>
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

                <div>
                    <Downshift
                        itemToString={item => (item ? item.value : '')}
                    >
                        {({
                            getInputProps,
                            getItemProps,
                            getLabelProps,
                            getMenuProps,
                            getToggleButtonProps,
                            isOpen,
                            inputValue,
                            highlightedIndex,
                            selectedItem,
                        }) => (
                            <div>
                                {/* <label {...getLabelProps()}>Import Seed Users From List</label>
                                <input className="ml-2 inline-block rounded border-2 border-black bg-blue px-2 py-1 text-black" {...getInputProps()} /> */}
                                <span>Select one of your lists to import all users as seed users</span>
                                <button
                                    {...getToggleButtonProps()}
                                    className='ml-2 inline-block rounded border-2 border-black bg-green-800 px-2 py-1 text-white'
                                >
                                    {isOpen ? 'close' : 'open'}
                                </button>
                                <ul
                                    {...getMenuProps({
                                        style: { maxHeight: 300, overflowY: 'scroll' }
                                    })}
                                >
                                    {isOpen
                                        ?
                                        userLists
                                            .map((item: any, index: number) => (
                                                <li>
                                                    <Form
                                                        method='post'
                                                        className='top-2 my-8 flex'
                                                        {...getItemProps({
                                                            item,
                                                            key: item.properties.id,
                                                            index,
                                                            style: {
                                                                backgroundColor:
                                                                    highlightedIndex === item.properties.id ? 'lightgray' : 'white',
                                                                fontWeight: selectedItem === item.properties.id ? 'bold' : 'normal',
                                                            },
                                                            disabled: true,
                                                        })}
                                                    >
                                                        <input
                                                            type='hidden'
                                                            name="listId"
                                                            placeholder='enter list name'
                                                            className='flex-1 rounded border-2 border-black px-2 py-1'
                                                            value={item.properties.id}
                                                        />
                                                        <button
                                                            type='submit'
                                                            className='ml-2 inline-block rounded border-2 border-black bg-blue-600 px-2 py-1 text-white'
                                                            value="addSeedUsersFromList"
                                                            name="intent"
                                                        >
                                                            Import {item.properties.member_count} seed users from list '{item.properties.name}'
                                                        </button>
                                                    </Form>
                                                </li>
                                            ))
                                        : null}
                                </ul>



                            </div>
                        )}
                    </Downshift>
                </div>


                <h1 className="text-2xl">{seedUsers.length} Seed Users</h1>
                <ol>
                    {seedUsers.map((seedUser: any) => (
                        <li className="flex" key={seedUser.user.properties.id}>
                            <p className="my-auto">{seedUser.user.properties.username}</p>
                            <Form
                                method='post'
                                className='top-2 my-8 flex'
                            >
                                <input
                                    type='hidden'
                                    name="seedUserHandle"
                                    placeholder='Enter any Twitter handle'
                                    className='flex-1 rounded border-2 border-black px-2 py-1'
                                    value={seedUser.user.properties.username}
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
                            <span>tweets last updated: {seedUser.rel.properties.tweetsLastUpdatedAt}</span>
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
                                            <p>{user.properties["public_metrics.followers_count"]}</p>
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
                        // <div className='mx-2 my-6 flex' key={tweet.tweet.properties.id}>
                        <div className='mx-2 my-6 flex' >
                            <img
                                className='h-12 w-12 rounded-full border border-gray-300 bg-gray-100'
                                alt=''
                                src={tweet.author.properties.profile_image_url}
                            />
                            {/* <article key={tweet.tweet.properties.id} className='ml-2.5 flex-1'> */}
                            <article className='ml-2.5 flex-1'>
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
