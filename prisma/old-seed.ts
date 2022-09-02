import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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


async function seed() {
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
      username: 'RhysLindmark',
      description: 'Co-building the Wisdom Age @roote_. Hiring https://t.co/mYM8pbcD4v. Prev @mitDCI @medialab. @EthereumDenver co-founder. Newsletter on solarpunk pluralism in bio 👇',
      protected: false,
      public_metrics: {
        followers_count: 5332,
        following_count: 1644,
        tweet_count: 10202,
        listed_count: 228
      }
    },
    {
      location: 'Philadelphia, PA',
      pinned_tweet_id: '1499774239922130946',
      profile_image_url: 'https://pbs.twimg.com/profile_images/1375548941538750465/kjPxgiWX_normal.jpg',
      created_at: '2016-11-29T20:14:22.000Z',
      id: '803693608419422209',
      name: 'Nick Torba',
      verified: false,
      entities: {
        url: { urls: [Array] },
        description: { urls: [Array], mentions: [Array] }
      },
      url: 'https://t.co/C8yIPStHx3',
      username: 'nicktorba',
      description: 'everywhere I go, there I am | building @TweetscapeHQ | hanging @roote_ | writing https://t.co/PBxsLBeEAO | reading https://t.co/n6w8cS8mcD',
      protected: false,
      public_metrics: {
        followers_count: 271,
        following_count: 534,
        tweet_count: 4086,
        listed_count: 8
      }
    }
  ]
  for (const user in flattenTwitterData(twitterUserData)) {
    console.log("USER");
    console.log(user);
    console.log(
      {
        data: {
          ...user,
          streams: {
            create: []
          }
        }
      }
    )
    await prisma.users.create({
      data: {
        ...user,
        streams: {
          create: []
        }
      }
    });
  }

  const posts = [
    {
      slug: "my-first-post",
      title: "My First Post",
      markdown: `
# This is my first post

Isn't it great?
    `.trim(),
    },
    {
      slug: "90s-mixtape",
      title: "A Mixtape I Made Just For You",
      markdown: `
# 90s Mixtape

- I wish (Skee-Lo)
- This Is How We Do It (Montell Jordan)
    `.trim(),
    },
  ];
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
      data: stream
    });
    console.log("pushed stream, here is id");
    console.log(streamUp.id);
    console.log(streamUp.name);
    // await prisma.streams.upsert({
    //   where: { id: stream.id },
    //   update: stream,
    //   create: stream,
    // });
  }

  for (const post of posts) {
    await prisma.post.upsert({
      where: { slug: post.slug },
      update: post,
      create: post,
    });
  }
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// async function seedUser() {
//   const email = "rachel@remix.run";

//   // cleanup the existing database
//   await prisma.user.delete({ where: { email } }).catch(() => {
//     // no worries if it doesn't exist yet
//   });

//   const hashedPassword = await bcrypt.hash("racheliscool", 10);

//   const user = await prisma.user.create({
//     data: {
//       email,
//       password: {
//         create: {
//           hash: hashedPassword,
//         },
//       },
//     },
//   });

// await prisma.note.create({
//   data: {
//     title: "My first note",
//     body: "Hello, world!",
//     userId: user.id,
//   },
// });

// await prisma.note.create({
//   data: {
//     title: "My second note",
//     body: "Hello, world!",
//     userId: user.id,
//   },
// });

// console.log(`Database has been seeded. 🌱`);
// }

// seedUser()
//   .catch((e) => {
//     console.error(e);
//     process.exit(1);
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//   });