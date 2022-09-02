import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { TwitterApi, TwitterV2IncludesHelper } from 'twitter-api-v2';

const api = new TwitterApi(process.env.TWITTER_TOKEN as string);


const prisma = new PrismaClient();
async function update() {
    let streamsLoaded = await prisma.streams.findMany({
        include: {
            seedUsers: true,
        }
    })
    // console.log(streamsLoaded[0].seedUsers);

    let id = "803693608419422209";
    let follows = await prisma.follows.findMany({
        where: { followerId: id },
        include: {
            following: true,
        }
    });
    console.log(follows.length);
    // let usersLoaded = await prisma.users.findMany();
    console.log(follows[0].following);
}

update()


async function paginate() {
    const { data: user } = await api.v2.userByUsername(
        "nicktorba",
        {
            "tweet.fields": "attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld",
            "user.fields": "created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld",
        }
    );

    let newUsers = [];
    const following = await api.v2.following(
        user.id,
        {
            'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
            'user.fields': 'created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld',
            'max_results': 1000,
            "asPaginator": true
        }
    );
    while (!following.done) { await following.fetchNext(); }
    console.log(following.data.data.length);
    console.log(following.data.data[0]);

    // console.log(Object.keys(following));
    // console.log(Object.keys(following.data));
    // console.log(Object.keys(following.data.data));
    // console.log(Object.keys(following.data.meta));
    // console.log(following.data.length);
    // for (const user in following.data) {
    //     newUsers.push(user)
    // }
    // let nextToken = following.meta.next_token;
    // while (nextToken) {
    //     const following = await api.v2.following(
    //         user.id,
    //         {
    //             'tweet.fields': 'attachments,author_id,context_annotations,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,text,possibly_sensitive,referenced_tweets,reply_settings,source,withheld',
    //             'user.fields': 'created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld',
    //             'max_results': 1000,
    //         }
    //     );
    //     for (const user in following.data) {
    //         newUsers.push(user)
    //     };
    //     nextToken = following.meta.next_token;
}

// paginate()