import type { ActionArgs, LoaderArgs } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useRef } from 'react'
import { Form, useSearchParams, useActionData, useCatch, useLoaderData, Outlet, useTransition, useFetcher } from "@remix-run/react";

import Tweet from '~/components/Tweet';
import {
    TwitterApi,
    TwitterV2IncludesHelper,
    UserV2,
} from 'twitter-api-v2';

import { getClient, USER_FIELDS, TWEET_FIELDS, handleTwitterApiError } from '~/twitter.server';
import { getHomeTimelineTweetsNeo4j, addHomeTimelineTweets } from '~/models/homeTimeline.server';
import { bulkWrites, addUsers, addTweetMedia, addTweetsFrom } from "~/models/streams.server";

import { useParams, useLocation } from "@remix-run/react";

async function getTweetsHomeTimeline(api: TwitterApi, maxResults: number = 100) {//, untilId: string | null = null) {
    let htReq = {
        'max_results': maxResults,
        'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
        'media.fields': 'alt_text,duration_ms,height,media_key,preview_image_url,type,url,width,public_metrics',
        'expansions': 'author_id,in_reply_to_user_id,referenced_tweets.id,referenced_tweets.id.author_id,entities.mentions.username,attachments.poll_ids,attachments.media_keys,geo.place_id',
        'poll.fields': 'duration_minutes,end_datetime,id,options,voting_status',
        'place.fields': 'contained_within,country,country_code,full_name,geo,id,name,place_type',
        'user.fields': USER_FIELDS
    }
    const homeTimelineRes = await api.v2.homeTimeline(htReq)
    let includes = new TwitterV2IncludesHelper(homeTimelineRes)

    let users = flattenTwitterUserPublicMetrics(includes.users);
    let media = includes.media;
    let refTweets = flattenTweetPublicMetrics(includes.tweets)

    return { tweets: homeTimelineRes.data.data, users, media, refTweets }

    //     let feedData = homeTimelineRes.data.data.map((tweet, index) => {
    //         return {
    //             tweet: tweet,
    //             author: includes.users.filter((user) => (user.id == tweet.author_id))[0]
    //         }
    //     })

    // feedData.sort(
    //     (a: any, b: any) =>
    //         new Date(b.tweet.created_at as string).valueOf() -
    //         new Date(a.tweet.created_at as string).valueOf()
    // )
    // return feedData
}

async function getLatestHomeTimelineNeo4j(api: TwitterApi, loggedInUser: any, limit: number = 10) {
    let username = loggedInUser.username;
    let tweets = await getHomeTimelineTweetsNeo4j(username, limit)
    return tweets
}

async function saveHomeTimelineTweets(api: TwitterApi, timelineUser: any) {
    // save homeTimeline tweets to neo4j
    let { tweets, users, media, refTweets } = await getTweetsHomeTimeline(api)
    bulkWrites(users, addUsers)
    bulkWrites(media, addTweetMedia)
    bulkWrites(refTweets, addTweetsFrom)
    // bulkWrites(tweets, addTweetsFrom) // we replace this with addHomeTimelineData to include [:HOMETIMELINE] edge
    // bulkWrites(tweets, addHomeTimelineTweets)
    await addHomeTimelineTweets(tweets, timelineUser)
}


export async function loader({ request, params }: LoaderArgs) {
    const { api, limits, uid, session } = await getClient(request);
    if (!api) {
        throw {} // TODO: make this better...
    }
    const loggedInUser: UserV2 = (await api.v2.me({ "user.fields": USER_FIELDS })).data;
    console.log("logged in user")
    console.log(loggedInUser)
    let latestTweetNeo4j = await getHomeTimelineTweetsNeo4j(loggedInUser.username, 1)
    console.log("empty feed response")
    console.log(latestTweetNeo4j)
    let tweets
    if (latestTweetNeo4j.length < 1) {
        let res = await saveHomeTimelineTweets(api, loggedInUser)
        tweets = await getHomeTimelineTweetsNeo4j(loggedInUser.username, 100)
        console.log(`tweets length = ${tweets.length}`)
        console.log(tweets[0])
        return tweets
    }
    // console.log(`tweets length = ${tweets.length}`)
    // console.log(tweets[0])
    return {}
}

export const action: ActionFunction = async ({
    request, params
}) => {
    // Responsible for editing the stream
    // structure from https://egghead.io/lessons/remix-add-delete-functionality-to-posts-page-in-remix, which was from https://github.com/remix-run/remix/discussions/3138

    const url = new URL(request.url);
    const entities = url.searchParams.getAll("caEntityCount");
    const formData = await request.formData();
    const newEntity = formData.get("caEntityCount")
    console.log(`newEntity = ${newEntity}`)
    console.log(`currentEntities= ${entities}`)
    if (entities.indexOf(newEntity) != -1) {
        entities.pop(newEntity)
    } else {
        entities.push(newEntity)
    }
    console.log(`newly minted entities = ${entities}`)
    return entities
}

export default function HomeTimeline() {
    // Responsible for rendering a feed & annotations
    const feedData = useLoaderData();
    console.log(feedData.slice(0, 2))
    const entities = useActionData();
    if (entities) {
        console.log("RIGHT UNDER ACTION CALL")
        console.log(`entities=${entities}`)
    }
    let transition = useTransition();
    let busy = transition.submission;

    const [searchParams, setSearchParams] = useSearchParams()

    useEffect(() => {
        console.log(`entities = ${entities}`)
        if (entities) {
            var params = new URLSearchParams();
            entities.map((entity) => {
                params.append("caEntityCount", entity)
            })
            setSearchParams(params)
        }
    }, [entities])

    const entitySearchParams = searchParams.getAll("caEntityCount")
    const entityAnnotationCount = new Map()
    const caEntityCount = new Map()
    const caDomainCount = new Map()

    feedData.map((row, index) => {
        if (row.annotation) {
            for (const entity of row.annotation) {
                const curCount = entityAnnotationCount.get(entity.properties.normalized_text)
                if (curCount) {
                    entityAnnotationCount.set(entity.normalized_text, curCount + 1)
                } else {
                    entityAnnotationCount.set(entity.normalized_text, 1)
                }
            }
        }
        if (row.tweet.context_annotations) {
            let ca = row.tweet.context_annotations.filter((ca) => (ca.domain.name == "Unified Twitter Taxonomy"))
            ca.forEach((ca, index) => {
                const curEntityCount = caEntityCount.get(ca.entity.name)

                if (curEntityCount) {
                    caEntityCount.set(ca.entity.name, curEntityCount + 1)
                } else {
                    caEntityCount.set(ca.entity.name, 1)
                }
            })
        }
    })

    // let feedDataShow = feedData;
    // if (searchParams.getAll("caEntityCount").length > 0) {
    //     feedDataShow = feedData.filter(
    //         (tweet) => (tweet.tweet.context_annotations)
    //     ).filter(
    //         (tweet) => {
    //             let cas = tweet.tweet.context_annotations.filter((ca) => (ca.domain.name == "Unified Twitter Taxonomy"))
    //             for (let ca of cas) {

    //                 if (searchParams.getAll("caEntityCount").indexOf(ca.entity.name) != -1) {
    //                     return true
    //                 }
    //             }
    //             return false
    //         }
    //     )
    // }

    return (
        <div className="flex px-4 py-2 max-h-min z-10">
            <div className='relative max-h-screen overflow-y-auto'>
                <div className="flex">
                    <div className="max-w-sm">
                        <h1>Entity Annotations</h1>
                        <div className="flex flex-wrap">
                            {Array.from(entityAnnotationCount).sort((a, b) => b[1] - a[1]).map(([keyValue, value]) => (
                                <EntityAnnotationChip keyValue={keyValue} value={value} entitySearchParams={entitySearchParams} key={`entityAnnotations-${keyValue}`} />
                            ))}
                        </div>
                        <div>
                            <h1>Context Annotation Entities</h1>
                            <div className="flex flex-wrap max-w-sm">
                                {Array.from(caEntityCount).sort((a, b) => b[1] - a[1]).map(([keyValue, value]) => (
                                    <EntityAnnotationChip keyValue={keyValue} value={value} entitySearchParams={entitySearchParams} key={`entityAnnotations-${keyValue}`} />
                                ))}
                            </div>
                        </div>
                    </div>
                    <div>
                        <h1 className="text-2xl">{`Home Timeline, ${feedData.length} tweets with selected tags`}</h1>
                        <div className="max-w-sm h-full">
                            {busy ?
                                <div>LOADING</div> :
                                feedData
                                    .map((tweet: any) => (
                                        <div key={`showTweets-${tweet.tweet.id}`}>
                                            <Tweet key={tweet.tweet.id} tweet={tweet} />
                                            <div className="flex flex-wrap">
                                                {
                                                    tweet.tweet.context_annotations &&
                                                    tweet.tweet.context_annotations.filter((ca) => (ca.domain.name == "Unified Twitter Taxonomy")).map((ca, index) => (
                                                        <span
                                                            key={`${ca.domain.name}-${index}`}
                                                            className="px-4 py-2 rounded-full text-gray-600 bg-indigo-200 font-semibold text-sm flex align-center w-max cursor-pointer hover:bg-gray-400 active:bg-gray-300 transition duration-300 ease">
                                                            {`${ca.entity.name}`}
                                                        </span>
                                                    ))
                                                }
                                            </div>
                                            {/* <pre>{JSON.stringify(tweet.tweet.entities?.annotations, null, 2)}</pre>
                                    <pre>{JSON.stringify(tweet.tweet.context_annotations, null, 2)}</pre> */}
                                        </div>
                                    ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function EntityAnnotationChip({ keyValue, value, entitySearchParams }) {
    let transition = useTransition();
    const entities = useActionData();
    if (entities) {
        console.log("RIGHT UNDER ACTION CALL in chip")
        console.log(`entities=${entities}`)
    }
    // const ref = useRef();

    let isFetching = transition.submission?.formData.get("caEntityCount") == keyValue;

    // useEffect(() => {
    //     if (fetcher.type === "done" && fetcher.data.ok) {
    //         ref.current.reset();
    //     }
    // }, [fetcher])

    if (isFetching) {
        return (
            <p>LOADING...</p>
        )
    }

    return (
        <Form
            method="post"
        >
            <span
                className={`
                    ${entitySearchParams.indexOf(keyValue) > -1 ? 'bg-blue-200 hover:bg-blue-500' : 'bg-gray-200 hover:bg-blue-300'}
                    px-4 py-2 rounded-full text-gray-500  font-semibold text-sm flex align-center w-max cursor-pointer active:bg-gray-300 transition duration-300 ease`}>
                <button className="" type="submit" name="caEntityCount" value={keyValue}>
                    {`${keyValue}, ${value}`}
                </button>
            </span>
        </Form>
    )
}

export function ErrorBoundary({ error }: { error: Error }) {
    console.error(error);

    return <div>An unexpected error occurred: {error.message}</div>;
}

export function CatchBoundary() {
    const caught = useCatch();

    if (caught.status === 404) {
        return <div>Note not found, {caught.data}</div>;
    }

    throw new Error(`Unexpected caught response with status: ${caught.status}`);
}

import { TimeAgo } from '~/components/timeago';
import { useEffect } from "react";
import { flattenTweetPublicMetrics, flattenTwitterUserPublicMetrics } from "~/models/streams.server";
import { write } from "fs";
import TweetsPage from "./timeline";

// function Tweet({ tweet }) {
//     return (
//         <div key={tweet.tweet.id} className='mx-2 my-2 flex py-4 px-3 rounded-lg  bg-white border border-gray-100'>
//             <img
//                 className='h-12 w-12 rounded-full border border-gray-300 bg-gray-100'
//                 alt=''
//                 src={tweet.author.profile_image_url}
//             />
//             <article key={tweet.tweet.id} className='ml-2.5 flex-1'>
//                 <header>
//                     <h3>
//                         <a
//                             href={`https://twitter.com/${tweet.author.username}`}
//                             target='_blank'
//                             rel='noopener noreferrer'
//                             className='mr-1 font-medium hover:underline'
//                         >
//                             {tweet.author.name}
//                         </a>
//                         <a
//                             href={`https://twitter.com/${tweet.author.username}`}
//                             target='_blank'
//                             rel='noopener noreferrer'
//                             className='text-sm text-gray-500'
//                         >
//                             @{tweet.author.username}
//                         </a>
//                         <span className='mx-1 text-sm text-gray-500'>·</span>
//                         <a
//                             href={`https://twitter.com/${tweet.author.username}/status/${tweet.tweet.id}`}
//                             target='_blank'
//                             rel='noopener noreferrer'
//                             className='text-sm text-gray-500 hover:underline'
//                         >
//                             <TimeAgo
//                                 locale='en_short'
//                                 datetime={new Date(tweet.tweet.created_at ?? new Date())}
//                             />
//                         </a>
//                         <span className='mx-1 text-sm text-gray-500'>·</span>
//                         <a
//                             href={`/streams/tweets/${tweet.tweet.id}`}
//                             target='_blank'
//                             rel='noopener noreferrer'
//                             className='text-sm text-gray-500 hover:underline'
//                         >
//                             analyze
//                         </a>
//                     </h3>
//                 </header>
//                 <p
//                     dangerouslySetInnerHTML={{ __html: tweet.html ?? tweet.tweet.text }}
//                 />
//             </article>
//         </div>
//     )
// }
