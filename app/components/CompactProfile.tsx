import { Link, useFetcher } from '@remix-run/react'
import type { userNode } from './StreamAccordion'


import { IoAddOutline, IoRemoveOutline } from 'react-icons/io5';

function CompactProfile({ user, isSeed, streamName }: { user: userNode, isSeed: boolean, streamName: string }) {
    // Renders a Seed/Recommended user profile, with a button to add/remove from the stream
    let fetcher = useFetcher()

    let isDeleting = fetcher.submission?.formData.get("intent") == "removeSeedUser";

    let isAdding = fetcher.submission?.formData.get("intent") == "addSeedUser";

    let bg = "bg-white"

    if (isDeleting) {
        return (<div>I'M DELETING {`${fetcher.submission?.formData.get("seedUserHandle")}`}</div>)
    }
    if (isAdding) {
        // return (<div>Adding {`${fetcher.submission?.formData.get("seedUserHandle")}`}...</div>)
        bg = "bg-purple-400"
    }

    return (
        <div className={'relative border border-gray-100 shadow-lg flex items-center space-x-2 rounded-lg p-2 ' + bg}>
            <Link
                to={`/streams/users/${user.properties.username}`}
                target="_blank"
                rel="noreferrer"
            >
                <img
                    src={user.properties.profile_image_url}
                    alt="profile pic"
                    className="rounded-full w-8 h-8" />
            </Link>

            <div className='flex flex-col shrink'>
                <a
                    className="text-sm font-medium "
                    href={`https://twitter.com/${user.properties.username}`}
                    target="_blank"
                    rel="noreferrer"
                >
                    <p className='text-sm font-medium hover:text-gray-500'>{user.properties.name}</p>
                </a>
                <p className='text-xs'>{user.properties['public_metrics.followers_count']} Followers </p>
            </div>

            <fetcher.Form
                method='post'
                action={`/streams/${streamName}`}
                className="absolute right-4"
            >
                <input
                    type='hidden'
                    value={user.properties.username}
                    name="seedUserHandle"
                />
                <button
                    type='submit'
                    name="intent"
                    value={isSeed ? "removeSeedUser" : "addSeedUser"}
                    className="hover:bg-slate-200 bg-slate-100 rounded-full h-8 w-8 flex items-center justify-center"
                >
                    {isSeed ? <IoRemoveOutline fontSize='small' /> : <IoAddOutline fontSize='small' />}
                </button>
            </fetcher.Form>

        </div>

    )
}

export default CompactProfile