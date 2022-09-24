import { Form, useParams } from '@remix-run/react'
import React from 'react'

import { userNode } from './StreamAccordion'

function CompactProfile({ user, isSeed, streamName }: { user: userNode, isSeed: boolean, streamName: string }) {
    // Renders a Seed/Recommended user profile, with a button to add/remove from the stream
    return (
        <div>
            <img src={user.properties.profile_image_url} alt="profile image" />
            <p>{user.properties.name}</p>
            <p>{user.properties.username}</p>
            <p>{user.properties['public_metrics.followers_count']} Followers </p>

            <Form
                method='post'
                action={`/streams/${streamName}`}
            >
                <input
                    type='hidden'
                    value={user.properties.username}
                    name="seedUserHandle"
                />
                <button
                    type='submit'
                    name="intent"
                    value={isSeed ? "addSeedUser" : "removeSeedUser"}
                >
                    {isSeed ? "Add as Seed" : "Remove Seed User"}
                </button>
            </Form>

        </div>

    )
}

export default CompactProfile