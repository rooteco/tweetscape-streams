import type { LoaderArgs, ActionArgs, ActionFunction } from "@remix-run/node"
import { redirect, json } from '@remix-run/node';
import { Form, useMatches, useTransition, useParams, useActionData } from "@remix-run/react";
import { useEffect } from 'react';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import { createList, getClient } from '~/twitter.server';
import { ConstructionOutlined } from "@mui/icons-material";

export async function loader({ request, params }: LoaderArgs) {
    return {}
};

export const action: ActionFunction = async ({
    request, params
}: ActionArgs) => {
    const streamName = params.streamName
    const formData = await request.formData();
    const listName = formData.get('name') as string;
    const listUserUsernames = formData.getAll("seedUserUsername")
    const { api, limits, uid, session } = await getClient(request);
    console.log("CALLING CREATE LIST")
    console.log(listUserUsernames)
    const { list, members } = await createList(api, listName, listUserUsernames);
    console.log(members)
    return redirect(`https://twitter.com/i/lists/${list.data.id}`)
    // return json({ members, list: list })
};

export default function ExportListMod() {
    const { streamName } = useParams();

    const matches = useMatches(); // gives access to all the routes, https://remix.run/docs/en/v1/api/remix#usematches
    const seedUsers = matches.filter((route) => route.id == 'routes/streams/$streamName')[0].data.seedUsers
    console.log("here we are gagain.a.dsf")
    return (
        <div>
            <Dialog open={true}>
                <DialogTitle>Create twitter list from your stream!</DialogTitle>
                <Form
                    method="post"
                    action={`/streams/${streamName}/exportList`}
                    className='my-8 max-w-sm'
                >
                    <label> List Name
                        {/* {errors?.streamName ? (
                            <em className="text-red-600">{errors.streamName}</em>
                        ) : null} */}
                        <input name="name" type="text" defaultValue={streamName} className='flex-1 rounded border-2 border-black px-2 py-1' />{" "}
                    </label>
                    <br />
                    <h1 className="text-xl">Curent Users</h1>
                    <ol>
                        {seedUsers.map((row) => (
                            <li><input name="seedUserUsername" type="hidden" value={row.user.properties.username} />{row.user.properties.username}</li>
                        ))}
                    </ol>
                    <button type="submit" className='ml-2 inline-block rounded border-2 border-black bg-black px-2 py-1 text-white'>Create List!</button>
                </Form>
            </Dialog>
        </div>
    );
}