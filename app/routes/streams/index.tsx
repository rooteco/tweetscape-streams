import type { ActionArgs, LoaderFunction, LoaderArgs } from "@remix-run/node";
import type { Session } from '@remix-run/node';
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, Link, useMatches } from "@remix-run/react";
import * as React from "react";
import BirdIcon from '~/icons/bird';
import { commitSession, getSession } from '~/session.server';
import { getClient, USER_FIELDS } from '~/twitter.server';
import { createStream, getStreamByName } from "~/models/streams.server";
import { getUserByUsernameDB, createUserDb } from "~/models/user.server";
import { flattenTwitterUserPublicMetrics } from "~/models/user.server";

import { Paper } from "@mui/material";

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
    return stream;
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

        <div className="flex h-full w-full justify-center align-middle items-center">
            {
                user && (
                    <Paper variant="outlined" sx={{ width: "fit-content", borderRadius: 4, backgroundColor: "white !important"}}>
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
                    </Paper>
                )
            }
            {!user && (
                <div>
                    <Paper variant="outlined" sx={{ width: "fit-content", maxWidth: "30vw", borderRadius: 4 }}>
                        <div className="flex flex-col p-4 space-y-2">
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
                    </Paper>

                </div>
            )}
        </div>
    );
}