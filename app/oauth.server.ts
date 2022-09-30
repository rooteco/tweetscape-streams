import type { Hash } from 'crypto';
import { TwitterApi } from 'twitter-api-v2';
import type { LoaderFunction } from '@remix-run/node';
import { nanoid } from 'nanoid';
import { redirect } from '@remix-run/node';
import { commitSession, getSession } from '~/session.server';

// @see {@link https://github.com/PLhery/node-twitter-api-v2/blob/master/doc/auth.md#create-the-auth-link-1}
export const loader: LoaderFunction = async ({ request }) => {
    const client = new TwitterApi({ clientId: process.env.OAUTH_CLIENT_ID, clientSecret: process.env.OAUTH_CLIENT_SECRET });
    const CALLBACK_URL: string = process.env.REDIRECT_URI;
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
