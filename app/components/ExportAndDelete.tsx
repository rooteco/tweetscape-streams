import React from 'react'
import { useParams } from '@remix-run/react'

import { Link } from '@remix-run/react'
import { Form } from '@remix-run/react'

import  { FiShare } from 'react-icons/fi';

function ExportAndDelete({ user }) {
    const { streamName } = useParams()

    if (user) {
        return (
            <div className="h-full flex flex-col space-y-2 z-10">
                <Link to={`/streams/${streamName}/exportList`} className="button-big py-2 pl-2 pr-8 rounded-2xl text-xl flex space-x-3 items-center" style={{ color: "#439AAF" }}>
                    <div id="icon" className="center rounded-full hover:bg-slate-300/50">
                        <FiShare sx={{ fontSize: "2.5rem", fontWeight: "bold", opacity: "0.2", padding: "8px" }} />
                    </div>
                    <div className="py-1">
                        <p className="text-sm font-regular  -my-1" > Export Stream </p>
                        <p className="text-sm font-regular" > to Twitter List </p>
                    </div>
                </Link>
                <div>
                    <Form
                        action={`/streams/${streamName}`}
                        method="post"
                    >

                    <button
                        type="submit"
                        value="delete"
                        name="intent"
                        className='pill-red flex items-center justify-center text-xs rounded-full h-8 w-full'
                        style={{ color: "#C24158" }}

                    >
                        <p>Delete Stream</p>
                    </button>
                </Form>
            </div>
            </div >
        )
    }
    return (
        <div className="h-full flex flex-col space-y-2 z-10">
            <Link
                className="button-big py-2 pl-2 pr-8 rounded-2xl text-xl flex space-x-3 items-center"
                style={{ color: "#439AAF" }}
                to='/oauth'
            >
                <span>Login to Create your own Stream</span>
            </Link>
        </div>
    )
}

export default ExportAndDelete