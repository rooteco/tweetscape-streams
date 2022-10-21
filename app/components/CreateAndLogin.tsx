import React from 'react'
import { Link } from '@remix-run/react'
import { Form } from '@remix-run/react'

import {IoAddOutline} from 'react-icons/io5';

function CreateAndLogin({ user }) {
    return (
        <div className="h-full flex flex-col space-y-2 z-10">
            <Link to="/streams" className="button-big py-2 pl-2 pr-8 rounded-2xl text-xl flex space-x-2 items-center" style={{ color: "#439AAF" }}>
                <div id="icon" className="center rounded-full hover:bg-slate-300/50">
                    <IoAddOutline style={{ fontSize: "1.5rem", fontWeight: "bold", opacity: "0.2" }} />
                </div>
                <div className="py-1">
                    <p className="text-sm font-regular  -my-1" > Create a Stream</p>
                </div>
            </Link>
            <div className="" >
                {user ?
                    <Form
                        action="/logout"
                        method="post"

                    >
                        <button
                            type="submit"
                            className='pill flex items-center justify-center text-xs rounded-full h-8 w-full'
                            style={{ color: "#4173C2" }}

                        >
                            <p>Logout</p>
                        </button>
                    </Form>
                    :
                    <Link
                        className='pill items-center justify-center rounded-full text-xs h-8 flex space-x-2'
                        style={{ background: "#E5ECF7", border: "1 solid #D2DCED" }}
                        to='/oauth'
                    >
                        <span>Login</span>
                    </Link>
                }
            </div>
        </div>
    )
}

export default CreateAndLogin