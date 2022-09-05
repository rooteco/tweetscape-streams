import type { Hash } from 'crypto';
import { TwitterApi } from 'twitter-api-v2';

import type { LoaderFunction } from '@remix-run/node';
import { nanoid } from 'nanoid';
import { redirect } from '@remix-run/node';

import { commitSession, getSession } from '~/session.server';

// Base64-URL-encoding is a minor variation on the typical Base64 encoding
// method. It starts with the same Base64-encoding method available in most
// programming languages, but uses URL-safe characters instead.
// @see {@link https://www.oauth.com/oauth2-servers/pkce/authorization-request}
// function base64UrlEncode(hash: Hash) {
//     return hash
//         .digest('base64')
//         .replace(/\+/g, '-')
//         .replace(/\//g, '_')
//         .replace(/=+$/, '');
// }


// @see {@link https://github.com/PLhery/node-twitter-api-v2/blob/master/doc/auth.md#create-the-auth-link-1}
export const loader: LoaderFunction = async ({ request }) => {

    console.log("-------")
    // console.log(process.env.OAUTH_CLIENT_ID);
    // console.log(process.env.OAUTH_CLIENT_SECRET);
    const CONSUMER_KEY = process.env.consumer_key;
    const CONSUMER_SECRET = process.env.consumer_secret;
    const client = new TwitterApi(
        { appKey: CONSUMER_KEY, appSecret: CONSUMER_SECRET }
    );

    // const baseUrl = new URL(request.url);
    // const proto = request.headers.get('X-Forwarded-Proto');
    // const protocol = proto ? `${proto}:` : url.protocol;

    // const CALLBACK_URL = encodeURIComponent(`${protocol}//${baseUrl.host}/streams`)
    const CALLBACK_URL = "http://localhost:3000/streams";


    const authLink = await client.generateAuthLink(CALLBACK_URL,);

    console.log(authLink.url);

    const session = await getSession(request.headers.get('Cookie'));
    session.set("oauth_token", authLink.oauth_token)
    session.set("oauth_token_secret", authLink.oauth_token_secret)
    // session.set('stateIdTwitter', state);
    // session.set('codeVerifier', codeVerifier);

    const headers = { 'Set-Cookie': await commitSession(session) };
    return redirect(authLink.url, { headers });
};


// @see {@link https://github.com/PLhery/node-twitter-api-v2/blob/master/doc/auth.md#create-the-auth-link-1}
export const loaderOauth2: LoaderFunction = async ({ request }) => {

    console.log("-------")
    // console.log(process.env.OAUTH_CLIENT_ID);
    // console.log(process.env.OAUTH_CLIENT_SECRET);
    const client = new TwitterApi({ clientId: process.env.OAUTH_CLIENT_ID, clientSecret: process.env.OAUTH_CLIENT_SECRET });

    // const baseUrl = new URL(request.url);
    // const proto = request.headers.get('X-Forwarded-Proto');
    // const protocol = proto ? `${proto}:` : url.protocol;

    // const CALLBACK_URL = encodeURIComponent(`${protocol}//${baseUrl.host}/streams`)
    const CALLBACK_URL = "http://localhost:3000/streams";


    const { url, codeVerifier, state } = client.generateOAuth2AuthLink(
        CALLBACK_URL,
        {
            scope: [
                'tweet.read',
                'tweet.write',
                'users.read',
                'follows.read',
                'follows.write',
                'offline.access',
                'like.read',
                'like.write',
                'list.read',
                'list.write',
            ]
        }
    );

    console.log(url);

    const session = await getSession(request.headers.get('Cookie'));
    session.set('stateIdTwitter', state);
    session.set('codeVerifier', codeVerifier);

    const headers = { 'Set-Cookie': await commitSession(session) };
    return redirect(url, { headers });
};
