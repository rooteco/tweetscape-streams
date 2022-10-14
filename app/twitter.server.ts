import {
    ApiResponseError,
    TwitterApi,
    TwitterV2IncludesHelper,
} from 'twitter-api-v2';
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
import type { Decimal } from '@prisma/client/runtime';
import { TwitterApiRateLimitPlugin } from '@twitter-api-v2/plugin-rate-limit';
import invariant from 'tiny-invariant';
import type { Session } from '@remix-run/node';
import { prisma } from "~/db.server";
import { flattenTwitterUserPublicMetrics } from '~/models/streams.server'
import { getUserByUsernameDB } from '~/models/user.server'
// import type {
//     Annotation,
//     AnnotationType,
//     Image,
//     Link,
//     List,
//     ListMember,
//     Mention,
//     Ref,
//     Tag,
//     TagType,
//     Tweet,
//     URL,
//     User,
// } from '~/types';

// import { getUserIdFromSession, log } from '~/utils.server';
// import { TwitterApiRateLimitDBStore } from '~/limit.server';
// import { prisma } from '~/db.server';
import { getSession } from '~/session.server';
import { log } from "~/log.server";

export { TwitterApi, TwitterV2IncludesHelper } from 'twitter-api-v2';

export const USER_FIELDS: TTweetv2UserField[] = [
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
    // 'withheld',
];

export const TWEET_FIELDS: TTweetv2TweetField[] = [
    'created_at',
    'entities',
    'author_id',
    'public_metrics',
    'referenced_tweets',
];
export const TWEET_EXPANSIONS: TTweetv2Expansion[] = [
    'referenced_tweets.id',
    'referenced_tweets.id.author_id',
    'entities.mentions.username',
];

export async function getUserTwitterLists(api: TwitterApi, user: UserV2) {
    try {
        const create = {
            followedLists: [] as ListV2[],
            ownedLists: [] as ListV2[]
        };
        log.info(`Fetching followed lists for ${user.username}...`);
        const resFollowed = await api.v2.listFollowed(user.id, {
            'list.fields': [
                'created_at',
                'follower_count',
                'member_count',
                'private',
                'description',
                'owner_id',
            ],
            'expansions': ['owner_id'],
            'user.fields': USER_FIELDS,
        });
        const includes = new TwitterV2IncludesHelper(resFollowed);
        resFollowed.lists
            .map((l: ListV2) => {
                create.followedLists.push(l)
            });


        log.info(`Fetching owned lists for ${user.username}...`);
        const resOwned = await api.v2.listsOwned(user.id, {
            'list.fields': [
                'created_at',
                'follower_count',
                'member_count',
                'private',
                'description',
                'owner_id',
            ],
        });
        resOwned.lists.map((l: ListV2) => create.ownedLists.push(l));

        return create;
    } catch (e) {
        return handleTwitterApiError(e);
    }
}

export async function getListUsers(api: TwitterApi, listId: string) {
    const membersOfList = await api.v2.listMembers(listId, {
        "user.fields": USER_FIELDS
    });
    let users: UserV2[] = [];
    for await (const user of membersOfList) {
        users.push(user)
    }
    return flattenTwitterUserPublicMetrics(users);
}

export async function createList(api: TwitterApi, listName: string, userUsernames: string[]) {
    const newList = await api.v2.createList({ name: listName, private: false })
    let promises = userUsernames.map(async (username) => {
        let userDb = await getUserByUsernameDB(username)
        return await api.v2.addListMember(newList.data.id, userDb.properties.id)
    })
    const newMembers = await Promise.all(promises)
    return { list: newList, members: newMembers };
}

export function handleTwitterApiError(e: unknown): never {
    if (e instanceof ApiResponseError && e.rateLimitError && e.rateLimit) {
        const msg1 =
            `You just hit the rate limit! Limit for this endpoint is ` +
            `${e.rateLimit.limit} requests!`;
        const reset = new Date(e.rateLimit.reset * 1000).toLocaleString('en-US', {
            dateStyle: 'full',
            timeStyle: 'full',
        });
        const msg2 = `Request counter will reset at ${reset}.`;
        log.error(msg1);
        log.error(msg2);
        throw new Error(`${msg1} ${msg2}`);
    }
    throw e;
}

export function getUserIdFromSession(session: Session) {
    const userId = session.get('uid') as string | undefined;
    const uid = userId ? String(userId) : undefined;
    return uid;
}

export async function getTwitterClientForUser(
    uid: string
): Promise<{ api: TwitterApi, limits: TwitterApiRateLimitPlugin }> {
    log.info(`Fetching token for user (${uid})...`);
    const token = await prisma.tokens.findUnique({ where: { user_id: uid } });
    invariant(token, `expected token for user (${uid})`);
    const expiration = token.updated_at.valueOf() + token.expires_in * 1000;
    // const limits = new TwitterApiRateLimitPlugin(
    //     new TwitterApiRateLimitDBStore(uid)
    // );
    const limits = new TwitterApiRateLimitPlugin();
    let api = new TwitterApi(token.access_token, { plugins: [limits] });

    if (expiration < new Date().valueOf()) {
        log.info(
            `User (${uid}) access token expired at ${new Date(
                expiration
            ).toLocaleString('en-US')}, refreshing...`
        );
        const client = new TwitterApi({
            clientId: process.env.OAUTH_CLIENT_ID as string,
            clientSecret: process.env.OAUTH_CLIENT_SECRET,
        });
        const { accessToken, refreshToken, expiresIn, scope } =
            await client.refreshOAuth2Token(token.refresh_token);
        log.info(`Storing refreshed token for user (${uid})...`);
        await prisma.tokens.update({
            data: {
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_in: expiresIn,
                scope: scope.join(' '),
                updated_at: new Date(),
            },
            where: { user_id: String(uid) },
        });
        api = new TwitterApi(accessToken, { plugins: [limits] });
    }
    return { api, limits };
}

export async function getClient(request: Request) {
    const session = await getSession(request.headers.get('Cookie'));
    let uid;
    if (process.env.TEST) {
        console.log("MANUALLY SETTING UID")
        uid = process.env.TEST_USER_ID
    } else {
        uid = getUserIdFromSession(session)
    }

    // const client = uid
    //     ? await getTwitterClientForUser(uid)
    //     : { api: new TwitterApi(process.env.TWITTER_TOKEN as string) };
    let client;
    if (uid) {
        client = await getTwitterClientForUser(uid)
    } else {
        client = null;
    }
    return { ...client, uid, session };
}



// interface twitterUser extends users {
//     [key: string]: any;
//     // public_metrics_followers_count: Number
// }

// export function toList(l: ListV2): List {
//     return {
//         id: BigInt(l.id),
//         owner_id: BigInt(l.owner_id as string),
//         name: l.name,
//         description: l.description as string,
//         private: l.private as boolean,
//         follower_count: l.follower_count as number,
//         member_count: l.member_count as number,
//         created_at: new Date(l.created_at as string),
//     };
// }

// export function toUser(u: UserV2): User {
//     return {
//         id: BigInt(u.id),
//         name: u.name,
//         username: u.username,
//         verified: u.verified ?? null,
//         description: u.description ?? null,
//         profile_image_url: u.profile_image_url ?? null,
//         followers_count: u.public_metrics?.followers_count ?? null,
//         following_count: u.public_metrics?.following_count ?? null,
//         tweets_count: u.public_metrics?.tweet_count ?? null,
//         created_at: u.created_at ? new Date(u.created_at) : null,
//         updated_at: new Date(),
//     };
// }

// export function toAnnotation(
//     a: TweetEntityAnnotationsV2,
//     t: TweetV2
// ): Annotation {
//     return {
//         tweet_id: BigInt(t.id),
//         normalized_text: a.normalized_text,
//         probability: a.probability as unknown as Decimal,
//         type: a.type as AnnotationType,
//         start: a.start,
//         end: a.end,
//     };
// }

// export function toTag(h: TweetEntityHashtagV2, t: TweetV2, type: TagType): Tag {
//     return {
//         type,
//         tweet_id: BigInt(t.id),
//         tag: h.tag,
//         start: h.start,
//         end: h.end,
//     };
// }

// export function toRef(r: ReferencedTweetV2, t: TweetV2): Ref {
//     return {
//         referenced_tweet_id: BigInt(r.id),
//         referencer_tweet_id: BigInt(t.id),
//         type: r.type,
//     };
// }

// export function toTweet(tweet: TweetV2): Tweet {
//     return {
//         id: BigInt(tweet.id),
//         author_id: BigInt(tweet.author_id as string),
//         text: tweet.text,
//         retweet_count: tweet.public_metrics?.retweet_count as number,
//         reply_count: tweet.public_metrics?.reply_count as number,
//         like_count: tweet.public_metrics?.like_count as number,
//         quote_count: tweet.public_metrics?.quote_count as number,
//         created_at: new Date(tweet.created_at as string),
//     };
// }

// export function toLink(u: TweetEntityUrlV2): Link {
//     return {
//         url: u.expanded_url,
//         display_url: u.display_url,
//         status: u.status ? Number(u.status) : null,
//         title: u.title ?? null,
//         description: u.description ?? null,
//         unwound_url: u.unwound_url,
//     };
// }

// export function toURL(u: TweetEntityUrlV2, t: TweetV2): URL {
//     return {
//         link_url: u.expanded_url,
//         tweet_id: BigInt(t.id),
//         start: u.start,
//         end: u.end,
//     };
// }

// export function toImages(u: TweetEntityUrlV2): Image[] {
//     return (u.images ?? []).map((i) => ({
//         link_url: u.expanded_url,
//         url: i.url,
//         width: i.width,
//         height: i.height,
//     }));
// }

// export type CreateQueue = {
//     users: User[];
//     list_members: ListMember[];
//     tweets: Tweet[];
//     mentions: Mention[];
//     annotations: Annotation[];
//     tags: Tag[];
//     refs: Ref[];
//     links: Link[];
//     images: Image[];
//     urls: URL[];
// };

// export function initQueue(): CreateQueue {
//     return {
//         users: [] as User[],
//         list_members: [] as ListMember[],
//         tweets: [] as Tweet[],
//         mentions: [] as Mention[],
//         annotations: [] as Annotation[],
//         tags: [] as Tag[],
//         refs: [] as Ref[],
//         links: [] as Link[],
//         images: [] as Image[],
//         urls: [] as URL[],
//     };
// }

// export function toCreateQueue(
//     res: TweetV2ListTweetsPaginator | TweetSearchRecentV2Paginator,
//     queue: CreateQueue = initQueue(),
//     listId?: bigint
// ) {
//     const includes = new TwitterV2IncludesHelper(res);
//     const authors = includes.users.map(toUser);
//     authors.forEach((i) => queue.users.push(i));
//     includes.tweets.map(toTweet).forEach((r) => queue.tweets.push(r));
//     res.tweets.map(toTweet).forEach((t) => queue.tweets.push(t));
//     res.tweets.forEach((t) => {
//         if (listId)
//             queue.list_members.push({
//                 user_id: BigInt(t.author_id as string),
//                 list_id: listId,
//             });
//         t.entities?.mentions?.forEach((m) => {
//             const mid = authors.find((u) => u.username === m.username)?.id;
//             if (mid)
//                 queue.mentions.push({
//                     tweet_id: BigInt(t.id),
//                     user_id: mid,
//                     start: m.start,
//                     end: m.end,
//                 });
//         });
//         t.entities?.annotations?.forEach((a) =>
//             queue.annotations.push(toAnnotation(a, t))
//         );
//         t.entities?.hashtags?.forEach((h) =>
//             queue.tags.push(toTag(h, t, 'hashtag'))
//         );
//         t.entities?.cashtags?.forEach((c) =>
//             queue.tags.push(toTag(c, t, 'cashtag'))
//         );
//         t.referenced_tweets?.forEach((r) => {
//             // Address edge-case where the referenced tweet may be
//             // inaccessible to us (e.g. private account) or deleted.
//             if (queue.tweets.some((tw) => tw.id === BigInt(r.id)))
//                 queue.refs.push(toRef(r, t));
//         });
//         t.entities?.urls?.forEach((u) => {
//             queue.links.push(toLink(u));
//             queue.urls.push(toURL(u, t));
//             toImages(u).forEach((i) => queue.images.push(i));
//         });
//     });
//     return queue;
// }

// export async function executeCreateQueue(queue: CreateQueue) {
//     log.info(`Creating ${queue.users.length} tweet authors...`);
//     log.info(`Creating ${queue.list_members.length} list members...`);
//     log.info(`Creating ${queue.tweets.length} tweets...`);
//     log.info(`Creating ${queue.mentions.length} mentions...`);
//     log.info(`Creating ${queue.tags.length} hashtags and cashtags...`);
//     log.info(`Creating ${queue.refs.length} tweet refs...`);
//     log.info(`Creating ${queue.links.length} links...`);
//     log.info(`Creating ${queue.images.length} link images...`);
//     log.info(`Creating ${queue.urls.length} tweet urls...`);
//     const skipDuplicates = true;
//     await prisma.$transaction([
//         prisma.users.createMany({ data: queue.users, skipDuplicates }),
//         prisma.list_members.createMany({ data: queue.list_members, skipDuplicates }),
//         prisma.tweets.createMany({ data: queue.tweets, skipDuplicates }),
//         prisma.mentions.createMany({ data: queue.mentions, skipDuplicates }),
//         prisma.annotations.createMany({ data: queue.annotations, skipDuplicates }),
//         prisma.tags.createMany({ data: queue.tags, skipDuplicates }),
//         prisma.refs.createMany({ data: queue.refs, skipDuplicates }),
//         prisma.links.createMany({ data: queue.links, skipDuplicates }),
//         prisma.images.createMany({ data: queue.images, skipDuplicates }),
//         prisma.urls.createMany({ data: queue.urls, skipDuplicates }),
//     ]);
// }
