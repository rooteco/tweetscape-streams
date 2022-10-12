import type { ActionArgs, LoaderArgs } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useRef, useState } from 'react'
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
import { useEffect } from "react";
import { flattenTweetPublicMetrics, flattenTwitterUserPublicMetrics } from "~/models/streams.server";

async function getTweetsHomeTimeline(api: TwitterApi, maxResults: number = 100, sinceId: string | null = null) {//, untilId: string | null = null) {
    let htReq = {
        'max_results': maxResults,
        'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
        'media.fields': 'alt_text,duration_ms,height,media_key,preview_image_url,type,url,width,public_metrics',
        'expansions': 'author_id,in_reply_to_user_id,referenced_tweets.id,referenced_tweets.id.author_id,entities.mentions.username,attachments.poll_ids,attachments.media_keys,geo.place_id',
        'poll.fields': 'duration_minutes,end_datetime,id,options,voting_status',
        'place.fields': 'contained_within,country,country_code,full_name,geo,id,name,place_type',
        'user.fields': USER_FIELDS
    }
    if (sinceId) {
        htReq['since_id'] = sinceId
    }
    const homeTimelineRes = await api.v2.homeTimeline(htReq)
    if (!homeTimelineRes.data.data) {
        return { tweets: [], users: [], media: [], refTweets: [] }
    }

    let includes = new TwitterV2IncludesHelper(homeTimelineRes)

    let users = flattenTwitterUserPublicMetrics(includes.users);
    let media = includes.media;
    let refTweets = flattenTweetPublicMetrics(includes.tweets)

    return { tweets: homeTimelineRes.data.data, users, media, refTweets }
}

async function saveHomeTimelineTweets(api: TwitterApi, timelineUser: any, sinceId: string | null = null) {
    // save homeTimeline tweets to neo4j
    let { tweets, users, media, refTweets } = await getTweetsHomeTimeline(api, 100, sinceId)
    console.log(`pull ${tweets.length} new tweets for ${timelineUser.username}`)
    await Promise.all([
        bulkWrites(users, addUsers),
        bulkWrites(media, addTweetMedia),
        bulkWrites(refTweets, addTweetsFrom),
        addHomeTimelineTweets(tweets, timelineUser)
    ])
}


export async function loader({ request, params }: LoaderArgs) {
    const { api, limits, uid, session } = await getClient(request);
    if (!api) {
        throw {} // TODO: make this better...
    }
    const loggedInUser: UserV2 = (await api.v2.me({ "user.fields": USER_FIELDS })).data;
    const num1 = Math.floor(Math.random() * 100)
    console.time(`homeTimeline${num1}`)
    let latestTweetNeo4j = await getHomeTimelineTweetsNeo4j(loggedInUser.username, 1)
    console.timeEnd(`homeTimeline${num1}`)
    let tweets
    if (latestTweetNeo4j.length < 1) {
        let res = await saveHomeTimelineTweets(api, loggedInUser)
        tweets = await getHomeTimelineTweetsNeo4j(loggedInUser.username, 100)
        return tweets
    }
    let latestSavedId = latestTweetNeo4j[0].tweet.properties.id
    let res = await saveHomeTimelineTweets(api, loggedInUser, latestSavedId)
    const num = Math.floor(Math.random() * 100)
    console.time(`homeTimeline${num}`)
    tweets = await getHomeTimelineTweetsNeo4j(loggedInUser.username, 100)
    console.timeLog(`homeTimeline${num}`)
    return tweets
}

export const action: ActionFunction = async ({
    request, params
}) => {
    // Responsible for editing the stream
    // structure from https://egghead.io/lessons/remix-add-delete-functionality-to-posts-page-in-remix, which was from https://github.com/remix-run/remix/discussions/3138
    console.log("I'M IN ACTION")
    // const url = new URL(request.url);
    // const entities = url.searchParams.getAll("caEntityCount");
    const formData = await request.formData();
    const newEntity = formData.get("caEntityCount")
    const hideEntity = formData.get("hideTopic")

    console.log(`adding or removing this entity = ${newEntity}`)
    return json({ newEntity, hideEntity })
}

export default function HomeTimeline() {
    // Responsible for rendering a feed & annotations
    const num1 = Math.floor(Math.random() * 100)
    console.time(`userLoaderData${num1}`)
    const feedData = useLoaderData();
    console.timeEnd(`userLoaderData${num1}`)
    const actionData = useActionData();
    console.log("ACTION DATA")
    console.log(actionData)
    let newEntity: string | null = null
    let hideEntity: string | null = null
    if (actionData) {
        newEntity = actionData.newEntity
        hideEntity = actionData.hideEntity
    }
    const [searchParams, setSearchParams] = useSearchParams()
    const entitySearchParams = searchParams.getAll("caEntityCount")
    const hideTopicParams = searchParams.getAll("hideTopic")

    useEffect(() => {
        if (newEntity && entitySearchParams.indexOf(newEntity) == -1) {
            console.log(`adding ${newEntity} to list of current entities`)
            searchParams.append("caEntityCount", newEntity)
            setSearchParams(searchParams)
        } else if (newEntity && entitySearchParams.indexOf(newEntity) != -1) {
            console.log(`removing entity ${newEntity} from list of current entities`)
            // thanks to this person: https://github.com/whatwg/url/issues/335#issuecomment-1142139561
            const allValues = searchParams.getAll("caEntityCount")
            allValues.splice(allValues.indexOf(newEntity), 1)
            searchParams.delete("caEntityCount")
            allValues.forEach((val) => searchParams.append("caEntityCount", val))
            setSearchParams(searchParams)
        }

        if (hideEntity && hideTopicParams.indexOf(hideEntity) == -1) {
            console.log(`adding ${hideEntity} to list of topics to hide`)
            searchParams.append("hideTopic", hideEntity)
            setSearchParams(searchParams)
        } else if (hideEntity && hideTopicParams.indexOf(hideEntity) != -1) {
            console.log(`removing entity ${hideEntity} from list of topics top hide`)
            // thanks to this person: https://github.com/whatwg/url/issues/335#issuecomment-1142139561
            const allValues = searchParams.getAll("hideTopic")
            allValues.splice(allValues.indexOf(hideEntity), 1)
            searchParams.delete("hideTopic")
            allValues.forEach((val) => searchParams.append("hideTopic", val))
            setSearchParams(searchParams)
        }
    }, [newEntity, hideEntity])
    let caEntities = searchParams.getAll("caEntityCount")
    let hideTopics = searchParams.getAll("hideTopic")
    console.log("HIDE TOPICS")
    console.log(hideTopics)
    let transition = useTransition();
    let busy = transition.submission;
    const caEntityCount = new Map()

    const num = Math.floor(Math.random() * 100)
    console.time(`feedDataMap${num}`)
    const emptyTopic = {
        labels: ['Entity'],
        properties: { name: 'No Labels', },
    }
    feedData.map((row, index: number) => {
        if (row.entities.length == 0) {
            row.entities.push(emptyTopic)
        }
        if (row.entities.length > 0) {
            // let ca = row.entities.filter((ca) => (ca.domain.name == "Unified Twitter Taxonomy"))
            row.entities.forEach((entity: Record, index: number) => {
                const curEntityCount = caEntityCount.get(entity.properties.name)
                if (curEntityCount) {
                    caEntityCount.set(entity.properties.name, curEntityCount + 1)
                } else {
                    caEntityCount.set(entity.properties.name, 1)
                }
            })
        }
    })
    console.timeEnd(`feedDataMap${num}`)

    let feedDataShow = feedData;
    // if (searchParams.getAll("caEntityCount").length > 0) {
    if (hideTopics.length > 0) {
        feedDataShow = feedData.filter(
            (tweet) => {
                for (let ca of tweet.entities) {
                    if (hideTopics.indexOf(ca.properties.name) != -1) {
                        return false
                    }
                }
                return true
            }
        )
    }
    if (caEntities.length > 0) {
        feedDataShow = feedDataShow.filter(
            (tweet) => {
                for (let ca of tweet.entities) {
                    // if (searchParams.getAll("caEntityCount").indexOf(ca.properties.name) != -1) {
                    if (caEntities.indexOf(ca.properties.name) != -1) {
                        return true
                    }
                }
                return false
            }
        )
    }

    return (
        <div className="flex px-4 py-2 max-h-min z-10 bg-gray-200">
            <div className='relative max-h-screen overflow-y-auto'>
                <div className="flex">
                    <div className="max-w-sm">
                        <h1 className="text-2xl">Twitter Topics</h1>
                        <div className="flex flex-wrap max-w-sm">
                            {Array.from(caEntityCount).sort((a, b) => b[1] - a[1]).map(([keyValue, value]) => (
                                <EntityAnnotationChip keyValue={keyValue} value={value} caEntities={caEntities} hideTopics={hideTopics} key={`entityAnnotations-${keyValue}`} />
                            ))}
                        </div>
                    </div>
                    <div className="grow">
                        <h1 className="text-2xl">{`Home Timeline, ${feedDataShow.length} tweets with selected tags`}</h1>
                        <div className="h-full">
                            {busy ?
                                <div>LOADING</div> :
                                feedDataShow
                                    .map((tweet: any) => (
                                        <div key={`showTweets-${tweet.tweet.properties.id}`}>
                                            <Tweet key={tweet.tweet.id} tweet={tweet} />
                                            <div className="flex flex-wrap">
                                                {
                                                    tweet.entities &&
                                                    tweet.entities.map((entity, index) => (
                                                        <div>
                                                            <EntityAnnotationChip keyValue={entity.properties.name} value={null} caEntities={caEntities} hideTopics={hideTopics} key={`entityAnnotationsUnderTweet-${entity.properties.name}`} />
                                                        </div>
                                                    ))
                                                }
                                            </div>
                                        </div>
                                    ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function EntityAnnotationChip({ keyValue, value, caEntities, hideTopics }) {
    if (!caEntities) {
        caEntities = []
    }
    let transition = useTransition();
    let isFetching = transition.submission?.formData.get("caEntityCount") == keyValue;
    if (isFetching) {
        return (
            <p>LOADING...</p>
        )
    }

    let bg
    if (hideTopics.indexOf(keyValue) > -1) {
        bg = "bg-red-300 hover:bg-blue-500"
    } else if (caEntities.indexOf(keyValue) > -1) {
        bg = 'bg-green-200 hover:bg-blue-500'
    } else {
        bg = 'bg-blue-200 hover:bg-blue-300'
    }

    return (
        <Form
            method="post"
        >
            <span
                className={`
                    ${bg}
                    px-4 py-2 rounded-full text-gray-500  font-semibold text-sm flex align-center w-max cursor-pointer active:bg-gray-300 transition duration-300 ease`}>
                <button className="" type="submit" name="caEntityCount" value={keyValue}>
                    {`${keyValue} ${value ? ', ' + value : ''}`}
                </button>
                <button
                    type="submit"
                    name="hideTopic"
                    value={keyValue}
                    className="bg-transparent hover:bg-red-200 focus:outline-none">
                    <svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="times"
                        className="w-3 ml-3" role="img" xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 352 512">
                        <path fill="currentColor"
                            d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z">
                        </path>
                    </svg>
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


