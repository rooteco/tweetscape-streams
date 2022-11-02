var fs = require('fs')
require('dotenv').config()
import { TwitterApi, TTweetv2UserField, Tweetv2TimelineResult } from "twitter-api-v2";

const TWITTER_TOKEN = process.env.TWITTER_TOKEN as string
const api = new TwitterApi(TWITTER_TOKEN);

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
];

async function dumpTweetData() {
    const data = await api.v2.usersByUsernames(
        ["nicktorba", "rhyslindmark"],
        { 'user.fields': 'created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld', }
    );

    const jsonStr = JSON.stringify(data.data, null, 2)
    const filename = '/home/nick/Documents/GitHub/tweetscape-streams/data/neo4j/users.json'
    fs.writeFile(filename, jsonStr, (err: any) => {
        if (err) {
            console.log('Error writing file', err)
        } else {
            console.log(`Successfully wrote file ${filename}`)
        }
    })

    type UserTweets = { [author_id: string]: Tweetv2TimelineResult }; // https://stackoverflow.com/questions/41045924/how-to-represent-a-variable-key-name-in-typescript-interface
    const tweets: UserTweets = {} as UserTweets;

    for await (const user of data.data) { // for loop of this style has the operations complete before moving on to writing files
        let userTweets = await api.v2.userTimeline(
            user.id,
            {
                'expansions': 'author_id,in_reply_to_user_id,referenced_tweets.id,referenced_tweets.id.author_id,entities.mentions.username,attachments.poll_ids,attachments.media_keys,geo.place_id',
                'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
                'user.fields': USER_FIELDS,
                'media.fields': 'alt_text,duration_ms,height,media_key,preview_image_url,type,url,width,public_metrics',
                'poll.fields': 'duration_minutes,end_datetime,id,options,voting_status',
                'place.fields': 'contained_within,country,country_code,full_name,geo,id,name,place_type',
                'max_results': 10,
            }
        )
        tweets[user.id] = userTweets.data;
    }
    const tweetsJsonStr = JSON.stringify(tweets, null, 2)
    const tweetsFileName = '/home/nick/Documents/GitHub/tweetscape-streams/data/neo4j/tweets.json'
    fs.writeFile(tweetsFileName, tweetsJsonStr, (err: any) => {
        if (err) {
            console.log('Error writing file', err)
        } else {
            console.log(`Successfully wrote file ${tweetsFileName}`)
        }
    })
}

dumpTweetData();