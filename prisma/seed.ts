import { objectEnumValues } from "@prisma/client/runtime";

const twitterUserData = [
    {
        location: 'San Francisco Bay Area, CA',
        pinned_tweet_id: '1271229547053150208',
        profile_image_url: 'https://pbs.twimg.com/profile_images/1558280191083827200/J0myxG6i_normal.jpg',
        created_at: '2013-09-29T15:01:58.000Z',
        id: '1917349034',
        name: 'Rhys Lindmark',
        verified: false,
        url: 'https://t.co/9fWmqYPH37',
        username: 'rhyslindmark',
        description: 'Co-building the Wisdom Age @roote_. Hiring https://t.co/mYM8pbcD4v. Prev @mitDCI @medialab. @EthereumDenver co-founder. Newsletter on solarpunk pluralism in bio 👇',
        protected: false,
        public_metrics_followers_count: 5332,
        public_metrics_following_count: 1644,
        public_metrics_tweet_count: 10202,
        public_metrics_listed_count: 228,

    },
    {
        location: 'Philadelphia, PA',
        pinned_tweet_id: '1499774239922130946',
        profile_image_url: 'https://pbs.twimg.com/profile_images/1375548941538750465/kjPxgiWX_normal.jpg',
        created_at: '2016-11-29T20:14:22.000Z',
        id: '803693608419422209',
        name: 'Nick Torba',
        verified: false,
        url: 'https://t.co/C8yIPStHx3',
        username: 'nicktorba',
        description: 'everywhere I go, there I am | building @TweetscapeHQ | hanging @roote_ | writing https://t.co/PBxsLBeEAO | reading https://t.co/n6w8cS8mcD',
        protected: false,
        public_metrics_followers_count: 271,
        public_metrics_following_count: 534,
        public_metrics_tweet_count: 4086,
        public_metrics_listed_count: 8,

    },
    {
        pinned_tweet_id: '1489090454113046529',
        created_at: '2008-10-21T12:01:00.000Z',
        protected: false,
        id: '16884623',
        name: 'Visakan Veerasamy',
        username: 'visakanv',
        url: 'https://t.co/sob53EDVWM',
        location: '🇸🇬, 🌏, 🌌',
        profile_image_url: 'https://pbs.twimg.com/profile_images/1517530211453050883/6pL25aLr_normal.jpg',
        verified: false,
        description: 'Focus on what you want to see more of. 💪🏾❤️🔥 buy my ebooks ▲ FRIENDLY AMBITIOUS NERD ▲ (https://t.co/ilqQnEYWQz) and ꩜ INTROSPECT ꩜ (https://t.co/K7oSiN66E2)',
        public_metrics_followers_count: 43613,
        public_metrics_following_count: 2096,
        public_metrics_tweet_count: 207451,
        public_metrics_listed_count: 969
    }
]

// const followsDataOG = [
//     {
//         id: '1917349034',
//         following: {
//             connect: ["803693608419422209"]
//         },
//         followers: {
//             connect: ["803693608419422209"]
//         }
//     },
//     {
//         id: '803693608419422209',
//         following: {
//             connect: ["1917349034", "1489090454113046529"]
//         },
//         followers: {
//             connect: ["1917349034"]
//         }
//     }
// ]
const followsData = [
    {
        followerId: "803693608419422209",
        followingId: "1917349034"
    },
    {
        followerId: "803693608419422209",
        followingId: "16884623"
    },
    {
        followerId: "1917349034",
        followingId: "803693608419422209"
    },
]

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export async function seed() {
    // let streamsLoadedHere = await prisma.streams.findMany();

    await prisma.follows.deleteMany();
    await prisma.streams.deleteMany();
    await prisma.users.deleteMany();

    // for (const stream of streamsLoadedHere) {
    //     console.log(`deleting stream ${stream.name}`);
    //     await prisma.streams.delete({ where: { id: stream.id } }).catch(() => {
    //         // no worries if it doesn't exist yet
    //     });
    // }

    // for (const user of twitterUserData) {
    //     console.log(`deleting user ${user.username}`);
    //     await prisma.users.delete({ where: { id: user.id } }).catch(() => {
    //         // no worries if it doesn't exist yet
    //     });
    // }

    for (const user of twitterUserData) {
        try {
            await prisma.users.upsert({
                where: {
                    username: user.username
                },
                update: user,
                create: user,
            });
        } catch (e) {
            console.log(user.username);
            throw e;
        }
    };

    for (const fd of followsData) {
        let user = await prisma.follows.create({
            data: fd
        });
        console.log(user);
    }

    // SEED STREAMS
    const streams = [
        {
            name: "stream-1",
            startTime: "2022-08-24T13:58:40Z",
            endTime: "2022-08-31T13:58:40Z",
        },
        {
            name: "stream-2",
            startTime: "2022-08-24T13:58:40Z",
            endTime: "2022-08-31T13:58:40Z",
            seedUsers: ["1917349034"]
        },
    ];
    let streamsLoaded = await prisma.streams.findMany({
        include: {
            seedUsers: true
        }
    })
    // cleanup the existing database
    for (const stream of streamsLoaded) {
        await prisma.streams.delete({ where: { id: stream.id } }).catch(() => {
            // no worries if it doesn't exist yet
        });
    }

    for (const stream of streams) {
        const streamUp = await prisma.streams.create({
            data: {
                ...stream,
                seedUsers: {
                    connect: [{ id: "1917349034" }]
                }
            },
        });
    }
}
seed()