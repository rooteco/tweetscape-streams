import { prisma } from "~/db.server";
import { TwitterApi } from 'twitter-api-v2';
import type { tweets } from "@prisma/client";

const api = new TwitterApi(process.env.TWITTER_TOKEN as string);


export async function getTweetByIdDB(id: tweets["id"]) {
    return prisma.tweets.findUnique({ where: { id } });
}

export async function getTweet(tweetId: string) {
    let tweet = await getTweetByIdDB(tweetId);
    console.log("in getTweet")
    console.log(tweet);
    if (!tweet) {
        console.log("pulling from twitter");
        let tweet = await api.v2.tweets([tweetId])
        return tweet;
    } else {
        return tweet;
    }
}
