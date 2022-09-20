import { getClient, USER_FIELDS, handleTwitterApiError } from '~/twitter.server';
import { getTweet, bulkWrites, addUsers, addTweetMedia, addTweetsFrom, updateStreamTweets, getStreamByName, deleteStreamByName, createStream } from "~/models/streams.server";
import { TwitterApi, TwitterV2IncludesHelper } from 'twitter-api-v2';

import * as dotenv from "dotenv";

dotenv.config();

const streamName = "TEST-STREAM"
const username = "nicktorba"

beforeAll(async () => {
    const endTime = new Date()
    const startTime = new Date(endTime.getFullYear(), endTime.getMonth(), endTime.getDate() - 7, endTime.getHours(), endTime.getMinutes())
    let stream = await createStream(streamName, startTime.toISOString(), username)
})

afterAll(async () => {
    await deleteStreamByName(streamName);
})
const api = new TwitterApi(process.env.TWITTER_TOKEN as string);

const TWEET = [{
    conversation_id: '1572099888682536960',
    created_at: '2022-09-20T05:46:36.000Z',
    text: 'thanks for hyping me up n refreshing what my website can mean 🙌🏻 its a beautiful thing n only a sapling 🌱 https://t.co/Dq20QcbIw5',
    possibly_sensitive: false,
    entities: {
        urls: [
            {
                start: 106,
                end: 129,
                url: 'https://t.co/Dq20QcbIw5',
                expanded_url: 'https://twitter.com/visakanv/status/1571854515896487936',
                display_url: 'twitter.com/visakanv/statu…'
            }
        ]
    },
    lang: 'en',
    id: '1572099888682536960',
    public_metrics: { retweet_count: 0, reply_count: 0, like_count: 2, quote_count: 0 },
    referenced_tweets: [{ type: 'quoted', id: '1571854515896487936' }],
    author_id: '1152673913048051712',
    source: 'Twitter for iPhone',
    context_annotations: [
        {
            domain: {
                id: '30',
                name: 'Entities [Entity Service]',
                description: 'Entity Service top level domain, every item that is in Entity Service should be in this domain'
            },
            entity: { id: '781974596752842752', name: 'Services' }
        },
        {
            domain: {
                id: '46',
                name: 'Business Taxonomy',
                description: 'Categories within Brand Verticals that narrow down the scope of Brands'
            },
            entity: {
                id: '1557697333571112960',
                name: 'Technology Business',
                description: 'Brands, companies, advertisers and every non-person handle with the profit intent related to softwares, apps, communication equipments, hardwares'
            }
        },
        {
            domain: { id: '47', name: 'Brand', description: 'Brands and Companies' },
            entity: { id: '10026378521', name: 'Google ' }
        },
        {
            domain: {
                id: '48',
                name: 'Product',
                description: 'Products created by Brands.  Examples: Ford Explorer, Apple iPhone.'
            },
            entity: { id: '1395474411180892160', name: 'Google brand conversation' }
        },
        {
            domain: {
                id: '30',
                name: 'Entities [Entity Service]',
                description: 'Entity Service top level domain, every item that is in Entity Service should be in this domain'
            },
            entity: {
                id: '848920371311001600',
                name: 'Technology',
                description: 'Technology and computing'
            }
        },
        {
            domain: {
                id: '30',
                name: 'Entities [Entity Service]',
                description: 'Entity Service top level domain, every item that is in Entity Service should be in this domain'
            },
            entity: { id: '849075738321932288', name: 'SEO', description: 'SEO' }
        },
        {
            domain: {
                id: '66',
                name: 'Interests and Hobbies Category',
                description: 'A grouping of interests and hobbies entities, like Novelty Food or Destinations'
            },
            entity: {
                id: '857879016971186177',
                name: 'Marketing',
                description: 'Marketing'
            }
        },
        {
            domain: {
                id: '131',
                name: 'Unified Twitter Taxonomy',
                description: 'A taxonomy view into the Semantic Core knowledge graph'
            },
            entity: {
                id: '848920371311001600',
                name: 'Technology',
                description: 'Technology and computing'
            }
        },
        {
            domain: {
                id: '131',
                name: 'Unified Twitter Taxonomy',
                description: 'A taxonomy view into the Semantic Core knowledge graph'
            },
            entity: { id: '849075738321932288', name: 'SEO', description: 'SEO' }
        },
        {
            domain: {
                id: '131',
                name: 'Unified Twitter Taxonomy',
                description: 'A taxonomy view into the Semantic Core knowledge graph'
            },
            entity: {
                id: '857879016971186177',
                name: 'Marketing',
                description: 'Marketing'
            }
        },
        {
            domain: {
                id: '131',
                name: 'Unified Twitter Taxonomy',
                description: 'A taxonomy view into the Semantic Core knowledge graph'
            },
            entity: {
                id: '1088088915779579905',
                name: 'Digital Marketing',
                description: 'Digital Marketing'
            }
        }
    ],
    reply_settings: 'everyone'
}]


const USERS = [{
    location: 'Helsinki, Finland',
    url: 'https://t.co/N4GinD618l',
    created_at: '2010-02-07T17:05:39.000Z',
    id: '112212512',
    description: 'This is my new bio. It replaces my old one, which I was told was bad.\n' +
        '\n' +
        'Meme alt: @KajPictures',
    name: 'Kaj Sotala',
    pinned_tweet_id: '1082283335336906752',
    verified: false,
    protected: false,
    username: 'xuenay',
    profile_image_url: 'https://pbs.twimg.com/profile_images/1464142459684937732/B4SRFG50_normal.jpg',
    'public_metrics.followers_count': 4441,
    'public_metrics.following_count': 556,
    'public_metrics.tweet_count': 10304,
    'public_metrics.listed_count': 149
}]
const MEDIA = [{
    height: 2048,
    media_key: '3_1568687834524958721',
    width: 1536,
    url: 'https://pbs.twimg.com/media/FcUZRjRWQAE4PdP.jpg',
    type: 'photo'
}]

const REF_TWEET = [{
    conversation_id: '1571851741553102848',
    created_at: '2022-09-19T13:31:34.000Z',
    text: 'a website is speech that endures\n' +
        '\n' +
        'you can direct anybody to it\n' +
        '\n' +
        'if you write a good blogpost, even without Google or SEO or whatever, you can personally share it with every single person you meet for the rest of your life\n' +
        '\n' +
        'tremendous power our ancestors didn’t have',
    possibly_sensitive: false,
    lang: 'en',
    id: '1571854515896487936',
    entities: {},
    referenced_tweets: [{ type: 'replied_to', id: '1571853813971292162' }],
    author_id: '16884623',
    context_annotations: [],
    in_reply_to_user_id: '16884623',
    source: 'Twitter for iPhone',
    reply_settings: 'following',
    'public_metrics.retweet_count': 0,
    'public_metrics.reply_count': 2,
    'public_metrics.like_count': 84,
    'public_metrics.quote_count': 1
}]

describe("Testing Streams Functions", () => {
    test("Get Stream Tweets", async () => {
        const { stream, seedUsers } = await getStreamByName('new-test');
        console.time("newUpdateStreamTweets")
        let tweets = await updateStreamTweets(api, stream, seedUsers.map((item: any) => (item.user)))
        console.timeEnd("newUpdateStreamTweets")
        expect(tweets.length).toBe(4) // promsie for addUsers, addMedia, addTweets, and addTweets for ref tweets
    }, 36000);

    test("Write a Tweet", async () => {
        let data = await Promise.all([
            bulkWrites(USERS, addUsers),
            bulkWrites(MEDIA, addTweetMedia),
            bulkWrites(REF_TWEET, addTweetsFrom),
            bulkWrites(TWEET, addTweetsFrom)
        ])
        const { tweet, relNodes } = await getTweet(TWEET[0]["id"])
        expect(relNodes.filter((row: any) => row.relationship == "INCLUDED").length).toBe(8)
    })
});
