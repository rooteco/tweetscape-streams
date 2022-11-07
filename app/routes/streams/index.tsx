import type { ActionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, Link, useMatches, useTransition } from "@remix-run/react";
import * as React from "react";
import BirdIcon from '~/icons/bird';
import { getTwitterClientForUser, USER_FIELDS } from '~/twitter.server';
import { createStream, getStreamByName } from "~/models/streams.server";
import { getUserNeo4j, createUserNeo4j } from "~/models/user.server";
import { flattenTwitterUserPublicMetrics } from "~/models/user.server";
import type { UserV2 } from 'twitter-api-v2';
import { createList, getUserOwnedTwitterLists } from '~/twitter.server'
import { requireUserSession } from "~/utils";


type ActionData =
    | {
        streamName: null | string;
    }
    | undefined;

export async function action({ request }: ActionArgs) {
    const formData = await request.formData();
    const name: string = formData.get("name") as string;
    let { stream } = await getStreamByName(name);
    if (stream) {
        let errors: ActionData = {
            streamName: `stream with name '${name}' already exists, please choose a new name.`
        }
        return json<ActionData>(errors);
    }

    let { uid } = await requireUserSession(request);

    if (!uid) {
        console.log("YOU ARE NOT LOGGED IN")
        return null
    }
    const { api } = await getTwitterClientForUser(uid);
    const meData = await api.v2.me({ "user.fields": USER_FIELDS });
    let user = meData.data as UserV2;

    let userDb = await getUserNeo4j(user.username)
    if (!userDb) {
        createUserNeo4j(flattenTwitterUserPublicMetrics([user])[0])
    }

    const userOwnedListsNames = (await getUserOwnedTwitterLists(api, user)).map((row) => (row.name));

    if (userOwnedListsNames.indexOf(name) > -1) {
        let errors: ActionData = {
            "streamName": `You already have a list named '${name}', you should import that list instead of creating a new stream`
        }
        return json<ActionData>(errors)
    }
    console.log(`Creating Twitter List ${name}`)
    const { list } = await createList(api, name, [])

    stream = await createStream({ name, twitterListId: list.data.id }, user.username)
    if (stream.errors) {
        let errors: ActionData = stream.errors;
        return json<ActionData>(errors);
    }
    return redirect(`/streams/${stream.properties.name}`);
}

export default function NewNotePage() {
    const matches = useMatches(); // gives access to all the routes, https://remix.run/docs/en/v1/api/remix#usematches
    const user = matches.filter((route) => route.id == 'routes/streams')[0].data.user
    const actionData = useActionData<typeof action>();
    const titleRef = React.useRef<HTMLInputElement>(null);
    const bodyRef = React.useRef<HTMLTextAreaElement>(null);
    const errors = useActionData();

    React.useEffect(() => {
        if (actionData?.errors?.title) {
            titleRef.current?.focus();
        } else if (actionData?.errors?.body) {
            bodyRef.current?.focus();
        }
    }, [actionData]);

    const transition = useTransition();

    if (transition.state == "loading") {
        return (
            <div className="flex h-full w-full justify-center align-middle items-center">
                <div className="bg-white" style={{ width: "fit-content", borderRadius: 4, backgroundColor: "white !important" }}>
                    <div className="flex flex-col p-4 space-y-2">
                        <h1 className="text-lg font-medium pb-6">Loading your Stream!</h1>
                    </div>
                </div>
            </div>
        )
    }

    return (

        <div className="flex h-full w-full justify-center align-middle items-center">
            {
                user && (
                    <div className="bg-white" style={{ width: "fit-content", borderRadius: 4, backgroundColor: "white !important" }}>
                        <div className="flex flex-col p-4 space-y-2">
                            <h1 className="text-lg font-medium pb-6">Create a New Stream</h1>
                            <Form method="post" className='flex flex-col space-x-1 space-y-6 max-w-sm'>
                                <label className="flex flex-col text-sm"> Stream Name
                                    {errors?.streamName ? (
                                        <em className="text-red-600">{errors.streamName}</em>
                                    ) : null}
                                    <input name="name" type="text" className='flex-1 rounded border border-gray-200 bg-gray-100 px-2 py-1' />{" "}
                                </label>
                                <button
                                    type="submit"
                                    className='ml-1 inline-block rounded-full border-2  pill px-2 py-1'
                                    onSubmit={async (event) => {
                                        event.preventDefault();
                                    }}
                                >
                                    Create Stream
                                </button>
                            </Form>
                        </div>
                    </div>
                )
            }
            {!user && (
                <div>
                    <div style={{ width: "fit-content", maxWidth: "30vw", borderRadius: 4 }}>
                        <div className="flex flex-col p-4 space-y-2">
                            <p>Login with Twitter get started with Tweetscape!</p>
                            <div className="flex">
                                <Link
                                    className='hover:bg-blue-500 active:bg-blue-600 w-auto mr-1.5 flex truncate items-center text-white text-xs bg-sky-500 rounded px-2 h-6'
                                    to='/oauth'
                                >
                                    <BirdIcon className='shrink-0 w-3.5 h-3.5 mr-1 fill-white' />
                                    <span>Login with Twitter</span>
                                </Link>
                            </div>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}