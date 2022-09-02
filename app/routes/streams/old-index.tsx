

import { useLoaderData, useParams } from '@remix-run/react';
import { json } from "@remix-run/node";
import { useState } from 'react';

import type { ActionFunction } from "@remix-run/node"; // or cloudflare/deno

import { getStreams } from "~/models/streams.server";


export const action: ActionFunction = async ({
    request,
}) => {
    console.log("LOOK BELOW HERE");
    // console.log(request);
    let formData = await request.formData();
    let values = Object.fromEntries(formData);
    console.log(values);
    return values;
}

export default function streamIndexPage() {
    // const { username } = useParams();
    const username = "nicktorba";
    const streams = useLoaderData<LoaderData>();
    console.log("here are streams!!");
    console.log(streams);
    const [handle, setHandle] = useState(username ?? 'elonmusk');
    return (
        <>
            <form method="post" className='sticky top-2 my-8 mx-auto flex max-w-sm'>
                <input name="name" type="text" className='flex-1 rounded border-2 border-black px-2 py-1' />{" "}
                <button type="submit" className='ml-2 inline-block rounded border-2 border-black bg-black px-2 py-1 text-white'>Create</button>
            </form>

            <form
                method='get'
                className='sticky top-2 my-8 mx-auto flex max-w-sm'
                action={`/${encodeURIComponent(handle)}/feed`}
            >
                <input
                    required
                    type='text'
                    placeholder='Enter any Twitter handle'
                    value={handle}
                    onChange={(evt) => setHandle(evt.currentTarget.value)}
                    className='flex-1 rounded border-2 border-black px-2 py-1'
                />
                <button
                    type='submit'
                    className='ml-2 inline-block rounded border-2 border-black bg-black px-2 py-1 text-white'
                >
                    See their feed
                </button>
            </form>
        </>
    );
}
