import type { LoaderArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { getTwitterClientForUser } from '~/twitter.server';
import { requireUserSession } from "~/utils";


export async function loader({ request, params }: LoaderArgs) {
    const { uid } = await requireUserSession(request);
    const { limits } = await getTwitterClientForUser(uid);

    const currentRateLimitForFollowing = await limits.v2.getRateLimit('users/:id/following')
    const timelineLimit = await limits.v2.getRateLimit('users/:id/tweets')
    const meLimit = await limits.v2.getRateLimit('users/me')
    const ownedListLimit = await limits.v2.getRateLimit('users/:id/owned_lists')
    const followedListLimit = await limits.v2.getRateLimit('users/:id/followed_lists')

    let limitJson = {
        following: {},
        timeline: {},
        meLimit: {},
        ownedListLimit: {},
        followedListLimit: {}
    }

    if (currentRateLimitForFollowing) {
        limitJson.following = {
            "limit": currentRateLimitForFollowing.limit,
            "remaining": currentRateLimitForFollowing.remaining,
            "reset": new Date(currentRateLimitForFollowing.reset * 1000).toISOString(),
        }
    }
    if (timelineLimit) {
        limitJson.timeline = {
            limit: timelineLimit.limit,
            "remaining": timelineLimit.remaining,
            reset: new Date(timelineLimit.reset * 1000).toISOString(),
        }
    }
    if (meLimit) {
        limitJson.meLimit = {
            limit: meLimit.limit,
            "remaining": meLimit.remaining,
            reset: new Date(meLimit.reset * 1000).toISOString(),
        }
    }
    if (ownedListLimit) {
        limitJson.ownedListLimit = {
            limit: ownedListLimit.limit,
            "remaining": ownedListLimit.remaining,
            reset: new Date(ownedListLimit.reset * 1000).toISOString(),
        }
    }
    if (followedListLimit) {
        limitJson.followedListLimit = {
            limit: followedListLimit.limit,
            "remaining": followedListLimit.remaining,
            reset: new Date(followedListLimit.reset * 1000).toISOString(),
        }
    }
    return json(limitJson)
};

export default function StreamsPage() {
    const rateLimits = useLoaderData();
    return (
        <div>
            <pre>{JSON.stringify(rateLimits, null, 2)}</pre>
        </div>
    );
}