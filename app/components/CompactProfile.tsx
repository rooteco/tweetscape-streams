import { Form, useParams } from '@remix-run/react'
import React from 'react'

import { userNode } from './StreamAccordion'

function CompactProfile({ user, isSeed }: { user: userNode, isSeed: boolean }) {
    const { streamName } = useParams();

    return (
        <div>
            <img src={user.properties.profile_image_url} alt="profile image" />
            <p>{user.properties.name}</p>
            <p>{user.properties.username}</p>
            <p>{user.properties['public_metrics.followers_count']}</p>

            {isSeed ?
                <Form
                    method='post'
                    action={`/streams/sample%20stream`}
                >
                    <input
                        type='hidden'
                        value={user.properties.username}
                        name="seedUserHandle"
                    />
                    <button
                        type='submit'
                        className='ml-2 inline-block rounded border-2 border-black bg-black px-2 py-1 text-white'
                        name="intent"
                        value="addSeedUser"
                    >
                        Add as Seed
                    </button>
                </Form>
                :
                <Form
                    method='post'
                    className='top-2 my-8 flex'
                >
                    <input
                        type='hidden'
                        name="seedUserHandle"
                        className='flex-1 rounded border-2 border-black px-2 py-1'
                        value={user.properties.username}
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

            }
        </div>

    )
}

export default CompactProfile