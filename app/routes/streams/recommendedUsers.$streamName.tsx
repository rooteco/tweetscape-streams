import { redirect } from "@remix-run/node";
import type { LoaderArgs } from "@remix-run/node";
import { TimeAgo } from '~/components/timeago';
import { json } from "@remix-run/node";
import { Form, Link, NavLink, Outlet, useLoaderData } from "@remix-run/react";
import invariant from "tiny-invariant";
import { getClient, USER_FIELDS } from '~/twitter.server';

import { getStreamByName, getStreamRecommendedUsersByInteractions, getStreamInteractions, getStreamDistinctInteractionedWithAccounts } from "~/models/streams.server";



// type LoaderData = {
//     // this is a handy way to say: "posts is whatever type getStreams resolves to"
//     tweet: Awaited<ReturnType<typeof getTweet>>;
// }

export async function loader({ request, params }: LoaderArgs) {
    let streamName = params.streamName as string;
    const { stream, seedUsers } = await getStreamByName(streamName);
    let recommendedUsers = await getStreamRecommendedUsersByInteractions(stream.properties.name)

    let interactedUsersFrequency = await getStreamDistinctInteractionedWithAccounts(stream.properties.name)
    console.log(interactedUsersFrequency)
    let accounts = interactedUsersFrequency[0].map((item) => (item.item))

    console.log(accounts)
    let interactions = await getStreamInteractions(stream.properties.name)
    let interactionFeed = interactions.filter((row) => {
        if (accounts.includes(row.interactedUser.properties.username)) {
            return row
        }
    })

    recommendedUsers = recommendedUsers[0]
        .map((item) => ({ username: item.item.properties.username, count: item.count.toInt() }))

    recommendedUsers = recommendedUsers.sort((a, b) => b.count - a.count)

    interactedUsersFrequency = interactedUsersFrequency[0].map((item) => ({ "username": item.item, "count": item.count.toInt() }))
    recommendedUsers.sort((a, b) => b.count - a.count)
    return json({ recommendedUsers, interactionFeed, interactedUsersFrequency })
};

export default function StreamsPage() {
    const data = useLoaderData();
    const recommendedUsers = data.recommendedUsers;
    const interactionFeed = data.interactionFeed;
    const interactedUsersFrequency = data.interactedUsersFrequency
    return (
        <main className='mx-auto max-h-screen max-w-screen-sm overflow-auto'>
            <div>
                <p>Showing accounts that multiple seed users have interacted with</p>
                <pre>{JSON.stringify(interactedUsersFrequency, null, 2)}</pre>
            </div>
            {
                interactionFeed
                    .sort(
                        (a: any, b: any) =>
                            new Date(b.seedUserTweet.properties.created_at as string).valueOf() -
                            new Date(a.seedUserTweet.properties.created_at as string).valueOf()
                    )
                    .map((row: any) => (
                        <div>
                            <div className='mx-2 my-6 flex' key={row.interactionTweet.properties.id}>
                                <img
                                    className='h-12 w-12 rounded-full border border-gray-300 bg-gray-100'
                                    alt=''
                                    src={row.interactedUser.properties.profile_image_url}
                                />
                                <article key={row.interactionTweet.properties.id} className='ml-2.5 flex-1'>
                                    <header>
                                        <h3>
                                            <a
                                                href={`https://twitter.com/${row.interactedUser.properties.username}`}
                                                target='_blank'
                                                rel='noopener noreferrer'
                                                className='mr-1 font-medium hover:underline'
                                            >
                                                {row.interactedUser.properties.name}
                                            </a>
                                            <a
                                                href={`https://twitter.com/${row.interactedUser.properties.username}`}
                                                target='_blank'
                                                rel='noopener noreferrer'
                                                className='text-sm text-gray-500'
                                            >
                                                @{row.interactedUser.properties.username}
                                            </a>
                                            <span className='mx-1 text-sm text-gray-500'>·</span>
                                            <a
                                                href={`https://twitter.com/${row.interactionTweet.properties.username}/status/${row.interactionTweet.properties.id}`}
                                                target='_blank'
                                                rel='noopener noreferrer'
                                                className='text-sm text-gray-500 hover:underline'
                                            >
                                                <TimeAgo
                                                    locale='en_short'
                                                    datetime={new Date(row.interactionTweet.properties.created_at ?? new Date())}
                                                />
                                            </a>
                                            <span className='mx-1 text-sm text-gray-500'>·</span>
                                            <a
                                                href={`/streams/tweets/${row.interactionTweet.properties.id}`}
                                                target='_blank'
                                                rel='noopener noreferrer'
                                                className='text-sm text-gray-500 hover:underline'
                                            >
                                                analyze
                                            </a>
                                        </h3>
                                    </header>
                                    <p
                                        dangerouslySetInnerHTML={{ __html: row.interactionTweet.html ?? row.interactionTweet.properties.text }}
                                    />
                                </article>
                            </div>
                            <div className='mx-2 my-6 flex' key={row.seedUserTweet.properties.id}>
                                <img
                                    className='h-12 w-12 rounded-full border border-gray-300 bg-gray-100'
                                    alt=''
                                    src={row.seedUser.properties.profile_image_url}
                                />
                                <article key={row.seedUserTweet.properties.id} className='ml-2.5 flex-1'>
                                    <header>
                                        <h3>
                                            <a
                                                href={`https://twitter.com/${row.seedUser.properties.username}`}
                                                target='_blank'
                                                rel='noopener noreferrer'
                                                className='mr-1 font-medium hover:underline'
                                            >
                                                {row.seedUser.properties.name}
                                            </a>
                                            <a
                                                href={`https://twitter.com/${row.seedUser.properties.username}`}
                                                target='_blank'
                                                rel='noopener noreferrer'
                                                className='text-sm text-gray-500'
                                            >
                                                @{row.seedUser.properties.username}
                                            </a>
                                            <span className='mx-1 text-sm text-gray-500'>·</span>
                                            <a
                                                href={`https://twitter.com/${row.seedUserTweet.properties.username}/status/${row.seedUserTweet.properties.id}`}
                                                target='_blank'
                                                rel='noopener noreferrer'
                                                className='text-sm text-gray-500 hover:underline'
                                            >
                                                <TimeAgo
                                                    locale='en_short'
                                                    datetime={new Date(row.seedUserTweet.properties.created_at ?? new Date())}
                                                />
                                            </a>
                                            <span className='mx-1 text-sm text-gray-500'>·</span>
                                            <a
                                                href={`/streams/tweets/${row.seedUserTweet.properties.id}`}
                                                target='_blank'
                                                rel='noopener noreferrer'
                                                className='text-sm text-gray-500 hover:underline'
                                            >
                                                analyze
                                            </a>
                                        </h3>
                                    </header>
                                    <p
                                        dangerouslySetInnerHTML={{ __html: row.seedUserTweet.html ?? row.seedUserTweet.properties.text }}
                                    />
                                </article>
                            </div>
                        </div>
                    ))
            }
            <div>
                <pre>{JSON.stringify(recommendedUsers, null, 2)}</pre>
            </div>
        </main >
    );
}
