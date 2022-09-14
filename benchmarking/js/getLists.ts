import { TwitterApi, TwitterV2IncludesHelper } from 'twitter-api-v2';

import * as dotenv from "dotenv";
import { Console } from 'console';

dotenv.config();


const api = new TwitterApi(process.env.TWITTER_TOKEN as string);

async function getOwnedListsAuthorId(
    api: TwitterApi,
    id: string,
) {
    const lists = await api.v2.listsOwned(
        id,
        {
            'list.fields': [
                'created_at',
                'follower_count',
                'member_count',
                'private',
                'description',
                'owner_id',
            ],
        }
    );
    console.log("lists")
    console.log(lists)
    console.log("------")
    console.log(lists.data)
    console.log("LISTS DONE")
    console.log(lists.done);
    while (!lists.done) {
        console.log(lists.data.data.length);
        await lists.fetchNext();
    }
    return lists;
}

async function getFollowedListsAuthorId(
    api: TwitterApi,
    id: string,
) {
    const lists = await api.v2.listFollowed(
        id,
        {
            'list.fields': [
                'created_at',
                'follower_count',
                'member_count',
                'private',
                'description',
                'owner_id',
            ],
        }
    );
    console.log("lists")
    console.log(lists)
    console.log("------")
    console.log(lists.data)
    console.log("LISTS DONE")
    console.log(lists.done);
    while (!lists.done) {
        console.log(lists.data.data.length);
        await lists.fetchNext();
    }
    return lists;
}

async function run() {
    const startTime = "2022-08-24T13:58:40Z";
    const endTime = "2022-08-31T13:58:40Z";
    const id = "803693608419422209";
    // const id = "16884623";
    const lists = await getFollowedListsAuthorId(api, id,)
    const includes = new TwitterV2IncludesHelper(lists);
    console.log("-----")
    console.log(includes.users)
    // console.log(tweets.data.data[0]);
    // // for (const obj of tweets.data.data) {
    // //     console.log(obj.attachments)
    // // }
    // for (const obj of tweets.data.includes.media) {
    //     console.log(obj)

    // }
}

run()