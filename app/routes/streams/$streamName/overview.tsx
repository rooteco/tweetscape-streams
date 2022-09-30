import type { LoaderArgs } from "@remix-run/node"
import { Form, useLoaderData, useMatches } from "@remix-run/react";
import { Tooltip } from "@mui/material";
import UpdateIcon from '@mui/icons-material/Update';
import HubIcon from '@mui/icons-material/Hub';
import { couldStartTrivia } from "typescript";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

import { Link, useParams } from "@remix-run/react";

export async function loader({ request, params }: LoaderArgs) {
    return {}
};

export default function Overview() {
    // Responsible for rendering the overview page for a stream

    const {streamName} = useParams();
    const loaderData = useLoaderData();
    const matches = useMatches(); // gives access to all the routes, https://remix.run/docs/en/v1/api/remix#usematches
    const tweets = matches.filter((route) => route.id == 'routes/streams/$streamName')[0].data.tweets

    const now = new Date()
    const todayMinus7Days = new Date();
    todayMinus7Days.setDate(todayMinus7Days.getDate() - 7);

    const numTweetsToday = tweets.filter((row) => row.tweet.properties.created_at > now.toISOString().slice(0, 10)).length
    const tweetsLastWeek = tweets.filter((row) => row.tweet.properties.created_at > todayMinus7Days.toISOString().slice(0, 10))
    const numTweetsLastWeek = tweetsLastWeek.length

    const tweetAuthorCount = new Map()
    tweetsLastWeek.map((row) => {
        const author = row.author.properties.username
        const curCount = tweetAuthorCount.get(author)
        if (curCount) {
            tweetAuthorCount.set(author, curCount + 1)
        } else {
            tweetAuthorCount.set(author, 1)
        }
    })
    let tweetAuthorCountRows = []; // create array to map author distribution values in the component below
    tweetAuthorCount.forEach((value, key) => {
        tweetAuthorCountRows.push(`${key}=${value}`)
    })

    const receivedReferenceCount = new Map()
    tweets.map((row) => {
        const tweetAuthorId = row.author.properties.id
        for (let refA of row.refTweetAuthors) {
            if (refA.properties.id != tweetAuthorId) {
                const curCount = receivedReferenceCount.get(refA.properties.username)
                if (curCount) {
                    receivedReferenceCount.set(refA.properties.username, curCount + 1)
                } else {
                    receivedReferenceCount.set(refA.properties.username, 1)
                }
            }
        }
    })

    let referencedAccountCounts = []; // create array to map author distribution values in the component below
    receivedReferenceCount.forEach((value, key) => {
        referencedAccountCounts.push({ key: key, value: value })
    })
    referencedAccountCounts.sort((a, b) => b.value - a.value)


    // ENTITY COUNTS
    const entityCounts = new Map()
    tweets.map((row) => {
        for (let entity of row.entities) {
            const curCount = entityCounts.get(entity.properties.name)
            if (curCount) {
                entityCounts.set(entity.properties.name, curCount + 1)
            } else {
                entityCounts.set(entity.properties.name, 1)
            }
        }
    })

    let entityCountsArray = []; // create array to map author distribution values in the component below
    entityCounts.forEach((value, key) => {
        entityCountsArray.push({ key: key, value: value })
    })
    entityCountsArray.sort((a, b) => b.value - a.value)

    // let errors = {};
    // if (actionData) {
    //     errors = actionData.errors;
    //     // recommendedUsers = actionData.recommendedUsers;
    // }

    return (
        <>
            <div className='relative max-h-screen px-4'>
                <div className="sticky top-0 mx-auto backdrop-blur-xl p-1 rounded-xl">

                    <p>num tweets today: <b>{numTweetsToday}</b></p>
                    <p>num tweets in last week: <b>{numTweetsLastWeek}</b></p>
                    <p className="text-md">Tweet Distribution</p>
                    {
                        tweetAuthorCountRows.map((row) => (<p>{row}</p>))
                    }
                    <p className="text-md text-bold">Top Referenced Accounts of Stream</p>
                    {
                        referencedAccountCounts.slice(0, 6).map((row) => (
                            <p>{`${row.key} referenced ${row.value} times`}</p>
                        ))
                    }
                    <p className="text-md text-bold">Top Referenced Entities of Stream</p>
                    {
                        entityCountsArray.slice(0, 6).map((row) => (
                            <p>{`${row.key} referenced ${row.value} times`}</p>
                        ))
                    }
                </div>
            </div>
            
        </>

    );
}