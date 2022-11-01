import { TwitterApi, TwitterV2IncludesHelper } from 'twitter-api-v2';
import type {
    ListV2,
    ReferencedTweetV2,
    TTweetv2Expansion,
    TTweetv2TweetField,
    TTweetv2UserField,
    TweetEntityAnnotationsV2,
    TweetEntityHashtagV2,
    TweetEntityUrlV2,
    TweetSearchRecentV2Paginator,
    TweetV2,
    TweetV2ListTweetsPaginator,
    UserV2,
} from 'twitter-api-v2';
import { list } from 'postcss';

import { parentPort } from "worker_threads";

const api = new TwitterApi("AAAAAAAAAAAAAAAAAAAAAFM3agEAAAAAZBujrfV2sgBQJXadn39uUwXpF2M%3DorQ010miN3ctmdfCcjFDBhh32fNb9xGd74YDo4V4lPOZ6oL8Zf");

const USER_FIELDS: TTweetv2UserField[] = [
    'created_at',
    'description',
    'entities',
    'id',
    'location',
    'name',
    'pinned_tweet_id',
    'profile_image_url',
    'protected',
    'public_metrics',
    'url',
    'username',
    'verified',
    // 'withheld',
];

async function getListTweets() {
    const listTweetsRes = await api.v2.listTweets(
        "1582929574853214209",
        {
            'expansions': 'author_id,in_reply_to_user_id,referenced_tweets.id,referenced_tweets.id.author_id,entities.mentions.username,attachments.poll_ids,attachments.media_keys,geo.place_id',
            'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
            'user.fields': USER_FIELDS,
            'media.fields': 'alt_text,duration_ms,height,media_key,preview_image_url,type,url,width,public_metrics',
            'poll.fields': 'duration_minutes,end_datetime,id,options,voting_status',
            'place.fields': 'contained_within,country,country_code,full_name,geo,id,name,place_type',
            'max_results': 2,
        }
    )
    let results = []
    results.push(listTweetsRes)
    for (let step = 0; step < 5; step++) {
        let last: TweetV2ListTweetsPaginator = results.slice(-1)[0]
        results.push(await last.next())
    }
    parentPort.postMessage(results)
    return results
}

async function main() {

    let tweets = getListTweets()

    // console.time("FETCH LAST")
    // await listTweetsRes.fetchLast(300)
    // console.timeEnd("FETCH LAST")

    // let includes = new TwitterV2IncludesHelper(listTweetsRes)
    // console.log(listTweetsRes)
    // console.log('----')
    // console.log(listTweetsRes.tweets.length)

}

main()
