import { PrismaClient } from '@prisma/client';
import { TwitterApi, TwitterV2IncludesHelper } from 'twitter-api-v2';

import type { users, streams, tweets } from "@prisma/client";


const api = new TwitterApi("AAAAAAAAAAAAAAAAAAAAAFM3agEAAAAAZBujrfV2sgBQJXadn39uUwXpF2M%3DorQ010miN3ctmdfCcjFDBhh32fNb9xGd74YDo4V4lPOZ6oL8Zf");

const prisma = new PrismaClient();

async function getTweetsFromId(id: string) {
    const startTime = "2022-08-24T13:58:40Z";
    const endTime = "2022-08-31T13:58:40Z";
    const tweets = await api.v2.userTimeline(
        id,
        {
            'expansions': 'author_id,in_reply_to_user_id,referenced_tweets.id,referenced_tweets.id.author_id,entities.mentions.username,attachments.poll_ids,attachments.media_keys,geo.place_id',
            'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
            'user.fields': 'created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld',
            'media.fields': 'alt_text,duration_ms,height,media_key,preview_image_url,type,url,width,public_metrics',
            'poll.fields': 'duration_minutes,end_datetime,id,options,voting_status',
            'place.fields': 'contained_within,country,country_code,full_name,geo,id,name,place_type',
            'max_results': 5,
            'end_time': endTime,
            'start_time': startTime
        }
    );
    let num = 0;
    while (!tweets.done && num < 2) {
        console.log(tweets.data.data.length);
        await tweets.fetchNext();
        num++;
    }
    return tweets;
    // console.log(tweets.data.meta);
    // console.log(tweets.data.data[0]);
    // console.log("---------")
    // console.log(tweets.data.data[0].context_annotations)
    // console.log("--------")
    // console.log(tweets.data.data[0].entities)

    // for (const tweet of tweets.data.data) {
    //     console.log("-------")
    //     console.log(tweet.author_id)
    //     console.log(tweet);

    //     prisma.tweets.create({
    //         data: {
    //             ...tweet,
    //             // author: {
    //             //     connect: [{ id: tweet.author_id }]
    //             // }
    //         },
    //     })
    // }
    // console.log(tweets.data.data);
    // console.log(tweets.includes.tweets.length);
}

async function run() {
    // let tweets = getTweetsFromId('16884623');
    // for (const tweet of (await tweets).data.data) {
    //     console.log(tweet)
    // }

    let tweetsdb = await prisma.tweets.findMany({
        include: {
            author: true
        }
    })
    console.log(tweetsdb);
}

run();