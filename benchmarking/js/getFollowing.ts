import { TwitterApi } from 'twitter-api-v2';

const api = new TwitterApi(TWITTER_TOKEN);

async function getFollowing() {
    console.log(`PULLING USERS FOLLOWED BY rhys`);
    // Get accounts followed by seed user
    let id = "1917349034";
    const following = await api.v2.following(
        id,
        {
            'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
            'user.fields': 'created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld',
            'max_results': 1000,
            "asPaginator": true
        }
    );
    while (!following.done) { await following.fetchNext(); }
    return following;
}

async function run() {
    console.time("getFollowing")
    let following = await getFollowing();
    console.log(following.data.data[0]);
    console.timeEnd("getFollowing")
}

run();
