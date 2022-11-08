import type { Integer } from 'neo4j-driver';
import type { UserProperties } from './user.server';

export type annotationNode = {
    identity: number,
    labels: Array<string>,
    properties: {
        "probability": number,
        "normalized_text": string,
        "type": string
    }
}
export type entityNode = {
    identity: number,
    labels: Array<string>,
    properties: {
        "name": "Social media",
        "id": "1196446161223028736"
    }
}

export type domainNode = {
    identity: number,
    labels: Array<string>,
    properties: {
        "name": string,
        "description": string,
        "id": number
    }
}

export type TweetProperties = {
    possibly_sensitive: boolean,
    created_at: string,
    conversation_id: string,
    in_reply_to_user_id: string,
    id: string,
    text: string,
    author_id: string,
    lang: string,
    reply_settings: string,
    "public_metrics.like_count": number,
    "public_metrics.retweet_count": number,
    "public_metrics.reply_count": number,
    "public_metrics.quote_count": number,
}

export type tweetNode = {
    identity: Integer,
    labels: string[],
    properties: UserProperties,
    elementId: string
}