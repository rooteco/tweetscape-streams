import type { LoaderArgs } from "@remix-run/node"
import { Form, useLoaderData } from "@remix-run/react";
import { Tooltip } from "@mui/material";
import UpdateIcon from '@mui/icons-material/Update';
import HubIcon from '@mui/icons-material/Hub';

export async function loader({ request, params }: LoaderArgs) {
    return {}
};

export default function Overview() {
    // Responsible for rendering a feed & annotations
    const loaderData = useLoaderData();
    // let errors = {};
    // if (actionData) {
    //     errors = actionData.errors;
    //     // recommendedUsers = actionData.recommendedUsers;
    // }

    return (
        <div className='relative max-h-screen px-4'>
            <div className="sticky top-0 mx-auto backdrop-blur-xl p-1 rounded-xl">
                <div className="flex flex-row justify-between p-3 bg-slate-50 rounded-lg">
                    <p className="text-xl font-medium px-2">OVERVIEW</p>
                    {/* DEV: Update Stream Tweets / Stream Follower Network */}
                    <div className="flex flex-row space-x-2">
                        <Form
                            method='post'
                        >
                            <button
                                type='submit'
                                className='inline-block rounded border border-gray-300 bg-gray-200 w-8 h-8 text-white text-xs'
                                value="updateStreamTweets"
                                name="intent"
                            >
                                <Tooltip title="Update Stream Tweets">
                                    <UpdateIcon fontSize="small" />
                                </Tooltip>

                            </button>
                        </Form>
                        <Form
                            method='post'
                        >
                            <button
                                type='submit'
                                className='\inline-block rounded border border-gray-300 bg-gray-200 w-8 h-8 text-white text-xs'
                                value="updateStreamFollowsNetwork"
                                name="intent"
                            >
                                <Tooltip title="Update Stream Follower">
                                    <HubIcon fontSize="small" />
                                </Tooltip>
                            </button>
                        </Form>
                    </div>
                </div>
                <p>here is a thing</p>
                <p> here is a nother oneadsfasdfjadsfkjdskfjdkfjdsklfljdsk lj  klsdfj ajdslk jflksad</p>
            </div>
        </div>

    );
}