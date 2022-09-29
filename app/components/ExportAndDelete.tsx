import React from 'react'
import { useParams } from '@remix-run/react'

import { Link } from '@remix-run/react'
import { Form } from '@remix-run/react'
import IosShareIcon from '@mui/icons-material/IosShare';

function ExportAndDelete({ user }) {
    const { streamName } = useParams()
    return (
        <div className="h-full flex flex-col space-y-2 z-10">
            <Link to={`/streams/${streamName}/exportList`} className="button-big py-2 pl-2 pr-8 rounded-2xl text-xl flex space-x-3 items-center" style={{ color: "#439AAF" }}>
                <div id="icon" className="center rounded-full hover:bg-slate-300/50">
                    <IosShareIcon sx={{ fontSize: "2.5rem", fontWeight: "bold", opacity: "0.2", padding: "8px" }} />
                </div>
                <div className="py-1">
                    <p className="text-sm font-regular  -my-1" > Export Stream </p>
                    <p className="text-sm font-regular" > to Twitter List </p>
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
                            <p>Delete Stream</p>
                        </button>
                    </Form>
                    :
                    <Link
                        className=' mx-auto pill flex truncate items-center text-white text-xs bg-sky-500 rounded-full px-2 h-6'
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

export default ExportAndDelete