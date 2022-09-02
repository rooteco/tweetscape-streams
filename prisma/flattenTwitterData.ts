type publicMetrics = {
    followers_count: Number,
    following_count: Number,
    tweet_count: Number,
    listed_count: Number
}

type twitterUser = {
    // public_metrics?: publicMetrics,
    [key: string]: any;
    // public_metrics_followers_count: Number
}

export function flattenTwitterData(data: Array<twitterUser>) {
    for (const obj of data) {
        obj.public_metrics_followers_count = obj.public_metrics.followers_count;
        obj.public_metrics_following_count = obj.public_metrics.following_count;
        obj.public_metrics_tweet_count = obj.public_metrics.tweet_count;
        obj.public_metrics_listed_count = obj.public_metrics.listed_count;
        delete obj.public_metrics;
    }
    return data;
}