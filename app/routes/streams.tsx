import { redirect } from "@remix-run/node";
import type { LoaderArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, NavLink, Outlet, useLoaderData } from "@remix-run/react";

// import { getNoteListItems } from "~/models/note.server";
// import { requireUserId } from "~/session.server";
// import { useUser } from "~/utils";

import { getStreams } from "~/models/streams.server";

type LoaderData = {
    // this is a handy way to say: "posts is whatever type getStreams resolves to"
    streams: Awaited<ReturnType<typeof getStreams>>;
}

export async function loader({ request }: LoaderArgs) {
    // const userId = await requireUserId(request);
    // console.log("userId")
    // console.log(userId)

    // const noteListItems = await getNoteListItems({ userId });

    let streams = json<LoaderData>({
        streams: await getStreams(),
    })
    return streams;
}

export default function StreamsPage() {
    const streams = useLoaderData<LoaderData>();
    return (
        <div className="flex h-full min-h-screen flex-col">
            <header className="flex items-center justify-between bg-slate-800 p-4 text-white">
                <h1 className="text-3xl font-bold">
                    <Link to=".">Notes</Link>
                </h1>
                <p>user.email here?</p>
                <Form action="/logout" method="post">
                    <button
                        type="submit"
                        className="rounded bg-slate-600 py-2 px-4 text-blue-100 hover:bg-blue-500 active:bg-blue-600"
                    >
                        Logout
                    </button>
                </Form>
            </header>

            <main className="flex h-full bg-white">
                <div className="h-full w-80 border-r bg-gray-50">
                    <Link to="new" className="block p-4 text-xl text-blue-500">
                        + New Note
                    </Link>

                    <hr />

                    {streams.streams.length === 0 ? (
                        <p className="p-4">No notes yet</p>
                    ) : (
                        <ol>
                            {streams.streams.map((stream) => (
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
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
