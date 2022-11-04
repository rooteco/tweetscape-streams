import {
    ApiResponseError,
    TwitterApi,
} from 'twitter-api-v2';
import type {
    ListV2,
    TTweetv2Expansion,
    TTweetv2TweetField,
    TTweetv2UserField,
    UserV2,
} from 'twitter-api-v2';
import { TwitterApiRateLimitPlugin } from '@twitter-api-v2/plugin-rate-limit';
import invariant from 'tiny-invariant';
import { prisma } from "~/db.server";
import { flattenTwitterUserPublicMetrics } from '~/models/streams.server'
import { getUserNeo4j } from '~/models/user.server'
import { TwitterApiRateLimitDBStore } from '~/limit.server';
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

export async function getTwitterClientForUser(
    uid: string
): Promise<{ api: TwitterApi, limits: TwitterApiRateLimitPlugin }> {
    log.info(`Fetching token for user (${uid})...`);
    const token = await prisma.tokens.findUnique({ where: { user_id: uid } });
    invariant(token, `No token found for user (${uid})`);
    const expiration = token.updated_at.valueOf() + token.expires_in * 1000;
    const limits = new TwitterApiRateLimitPlugin(
        new TwitterApiRateLimitDBStore(uid)
    );
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
        try {
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
            api = new TwitterApi(accessToken, { plugins: [limits] })
        } catch (e) {
            console.log("caught twitter api error in getTwitterClientForUser")
            handleTwitterApiError(e)
            // if (e instanceof ApiResponseError && e.data && e.data.error_description == "Value passed for the token was invalid.") {
            //     console.log("LOGGING TF OUT FOR YOU")
            //     return redirect("/logout")
            // }

        }
        //, { plugins: [limits] });
    }
    return { api, limits };
}

export async function getUserOwnedTwitterLists(api: TwitterApi, user: UserV2) {
    const ownedLists = [] as ListV2[];
    log.info(`Fetching owned lists for ${user.username}...`);
    let id = (await api.v2.me()).data.id
    const resOwned = await api.v2.listsOwned(
        id,
        // {
        //     'list.fields': [
        //         'created_at',
        //         'follower_count',
        //         'member_count',
        //         'private',
        //         'description',
        //         'owner_id'
        //     ]
        // }
    );
    resOwned.lists.map((l: ListV2) => ownedLists.push(l));
    return ownedLists;
}

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
        resFollowed.lists
            .forEach((l: ListV2) => {
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
        console.log("caught twitter api error in getUserTwitterLIsts")
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
    console.log(`creating list ${listName}`)
    const newList = await api.v2.createList({ name: listName, private: false })
    let promises = userUsernames.map(async (username) => {
        let userDb = await getUserNeo4j(username)
        return api.v2.addListMember(newList.data.id, userDb.properties.id)
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
    } else if (e instanceof ApiResponseError && e.data && e.data.error_description == "Value passed for the token was invalid.") {
        throw e
    }
    throw e;
}

