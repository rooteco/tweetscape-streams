import type { ActionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import * as React from "react";

import { createStream, getStreamByName } from "~/models/streams.server";
import { requireUserId } from "~/session.server";

type ActionData =
    | {
        streamName: null | string;
    }
    | undefined;

export async function action({ request }: ActionArgs) {
    // const userId = await requireUserId(request);

    const formData = await request.formData();
    const name = formData.get("name");
    const seedUsers = formData.get("seedUsers");

    console.log("FORMDATA");
    console.log(formData);
    console.log(name);
    // if (typeof title !== "string" || title.length === 0) {
    //     return json(
    //         { errors: { title: "Title is required", body: null } },
    //         { status: 400 }
    //     );
    // }

    // if (typeof body !== "string" || body.length === 0) {
    //     return json(
    //         { errors: { body: "Body is required", title: null } },
    //         { status: 400 }
    //     );
    // }

    let checkStreamName = await getStreamByName({ name: name });
    console.log("STREAM");
    console.log(checkStreamName);
    if (checkStreamName) {
        let errors: ActionData = {
            streamName: `stream with name '${name}' already exists, please choose a new name.`
        }
        return json<ActionData>(errors);
    }
    const startTime = "2022-08-24T13:58:40Z";
    const endTime = "2022-08-31T13:58:40Z";
    const stream = await createStream({ name, seedUsers, startTime, endTime });
    return redirect(`/streams/${stream.name}`);
}

export default function NewNotePage() {
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
            <h1>Create New Stream</h1>
            <Form method="post" className='sticky top-2 my-8 mx-auto flex max-w-sm'>
                <label> Stream Name
                    {errors?.streamName ? (
                        <em className="text-red-600">{errors.streamName}</em>
                    ) : null}
                    <input name="name" type="text" className='flex-1 rounded border-2 border-black px-2 py-1' />{" "}
                </label>
                <label> seed users (comma separated)
                    <input name="seedUsers" type="text" className='flex-1 rounded border-2 border-black px-2 py-1'></input>{" "}
                </label>
                <button type="submit" className='ml-2 inline-block rounded border-2 border-black bg-black px-2 py-1 text-white'>Create</button>
            </Form>
            <Form
                method="post"
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    width: "100%",
                }}
            >
                <div>
                    <label className="flex w-full flex-col gap-1">
                        <span>Title: </span>
                        <input
                            ref={titleRef}
                            name="title"
                            className="flex-1 rounded-md border-2 border-blue-500 px-3 text-lg leading-loose"
                            aria-invalid={actionData?.errors?.title ? true : undefined}
                            aria-errormessage={
                                actionData?.errors?.title ? "title-error" : undefined
                            }
                        />
                    </label>
                    {actionData?.errors?.title && (
                        <div className="pt-1 text-red-700" id="title-error">
                            {actionData.errors.title}
                        </div>
                    )}
                </div>

                <div>
                    <label className="flex w-full flex-col gap-1">
                        <span>Body: </span>
                        <textarea
                            ref={bodyRef}
                            name="body"
                            rows={8}
                            className="w-full flex-1 rounded-md border-2 border-blue-500 py-2 px-3 text-lg leading-6"
                            aria-invalid={actionData?.errors?.body ? true : undefined}
                            aria-errormessage={
                                actionData?.errors?.body ? "body-error" : undefined
                            }
                        />
                    </label>
                    {actionData?.errors?.body && (
                        <div className="pt-1 text-red-700" id="body-error">
                            {actionData.errors.body}
                        </div>
                    )}
                </div>

                <div className="text-right">
                    <button
                        type="submit"
                        className="rounded bg-blue-500  py-2 px-4 text-white hover:bg-blue-600 focus:bg-blue-400"
                    >
                        Save
                    </button>
                </div>
            </Form>
        </div>
    );
}
