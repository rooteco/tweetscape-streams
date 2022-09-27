import { Form, useParams } from '@remix-run/react'
import React from 'react'


import { userNode } from './StreamAccordion'

import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';

function CompactProfile({ user, isSeed, streamName }: { user: userNode, isSeed: boolean, streamName: string }) {
    // Renders a Seed/Recommended user profile, with a button to add/remove from the stream
    return (
        <div className='relative border border-gray-100 shadow-lg flex items-center space-x-2 rounded-md bg-white p-2'>
            <img 
                src={user.properties.profile_image_url} 
                alt="profile image"
                className="rounded-full w-8 h-8" />
            
            <div className='flex flex-col shrink'>
                <p className='text-sm font-medium'>{user.properties.name}</p>
                <p className='text-xs'>{user.properties['public_metrics.followers_count']} Followers </p>
            </div>

            <Form
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
                    value={isSeed ?  "removeSeedUser" : "addSeedUser"}
                    className = "hover:bg-slate-200 bg-slate-100 rounded-full h-8 w-8 flex items-center justify-center"
                >
                    {isSeed ? <RemoveIcon fontSize='small'/> : <AddIcon fontSize='small'/>}
                </button>
            </Form>

        </div>

    )
}

export default CompactProfile