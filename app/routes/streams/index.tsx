import type { ActionArgs, LoaderFunction, LoaderArgs } from "@remix-run/node";
import type { Session } from '@remix-run/node';
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, Link, useLoaderData, useMatches } from "@remix-run/react";
import * as React from "react";
import BirdIcon from '~/icons/bird';
import { commitSession, getSession } from '~/session.server';
import { getClient, USER_FIELDS } from '~/twitter.server';
import { createStream, getStreamByName } from "~/models/streams.server";
import { getUserByUsernameDB, createUserDb } from "~/models/user.server";
import { flattenTwitterUserPublicMetrics } from "~/models/user.server";

export function getUserIdFromSession(session: Session) {
    const userId = session.get('uid') as string | undefined;
    const uid = userId ? String(userId) : undefined;
    return uid;
}

type ActionData =
    | {
        streamName: null | string;
    }
    | undefined;

export async function action({ request }: ActionArgs) {
    const formData = await request.formData();
    const name: string = formData.get("name") as string;
    let { stream, seedUsers } = await getStreamByName(name);
    if (stream) {
        let errors: ActionData = {
            streamName: `stream with name '${name}' already exists, please choose a new name.`
        }
        return json<ActionData>(errors);
    }
    const { api, uid, session } = await getClient(request);
    let user = null;
    if (!api) {
        console.log("YOU ARE NOT LOGGED IN")
        return null
    }
    const meData = await api.v2.me({ "user.fields": USER_FIELDS });
    user = meData.data;
    let username = user.username;
    let userDb = await getUserByUsernameDB(username)
    if (!userDb) {
        createUserDb(flattenTwitterUserPublicMetrics([user])[0])
    }
    const endTime = new Date()
    const startTime = new Date(endTime.getFullYear(), endTime.getMonth(), endTime.getDate() - 7, endTime.getHours(), endTime.getMinutes())
    stream = await createStream(name, startTime.toISOString(), username)
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

    return (
        <div>
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
                        <p>Choose a stream from the sidebar to explore, or login with twitter to create your own</p>
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
            </div>
        </div>
    );
}