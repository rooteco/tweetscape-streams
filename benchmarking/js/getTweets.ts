import { TwitterApi } from 'twitter-api-v2';

const api = new TwitterApi(TWITTER_TOKEN);

async function getTweetsFromAuthorId(
    api: any,
    id: string,
    startTime: string,
    endTime: string,
) {
    const tweets = await api.v2.userTimeline(
        id,
        {
            'expansions': 'author_id,in_reply_to_user_id,referenced_tweets.id,referenced_tweets.id.author_id,entities.mentions.username,attachments.poll_ids,attachments.media_keys,geo.place_id',
            'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
            'user.fields': 'created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld',
            'media.fields': 'alt_text,duration_ms,height,media_key,preview_image_url,type,url,width,public_metrics',
            'poll.fields': 'duration_minutes,end_datetime,id,options,voting_status',
            'place.fields': 'contained_within,country,country_code,full_name,geo,id,name,place_type',
            'max_results': 100,
            'end_time': endTime,
            'start_time': startTime
        }
    );
    while (!tweets.done) {
        console.log(tweets.data.data.length);
        await tweets.fetchNext();
    }
    return tweets;
}

async function run() {
    const startTime = "2022-08-24T13:58:40Z";
    const endTime = "2022-08-31T13:58:40Z";
    // const id = "803693608419422209";
    const id = "16884623";
    const tweets = await getTweetsFromAuthorId(
        api,
        id,
        startTime,
        endTime
    )
    console.log(tweets.data.data[0]);
    // for (const obj of tweets.data.data) {
    //     console.log(obj.attachments)
    // }
    for (const obj of tweets.data.includes.media) {
        console.log(obj)

    }
}

run()