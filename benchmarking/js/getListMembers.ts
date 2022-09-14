import { TwitterApi, TwitterV2IncludesHelper } from 'twitter-api-v2';

import * as dotenv from "dotenv";
import { Console } from 'console';

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

dotenv.config();


const api = new TwitterApi(process.env.TWITTER_TOKEN as string);


export async function getListUsers(api: TwitterApi, listId: string) {
    const membersOfList = await api.v2.listMembers(listId);
    let users: UserV2[] = [];
    for await (const user of membersOfList) {
        users.push(user)
    }
    console.log(users);
}

getListUsers(api, "1234587728957886465");
