import type { ActionFunction } from '@remix-run/node';

import { destroySession, getSession } from '~/session.server';

export const action: ActionFunction = async ({ request }) => {
    console.log("DRESTORYING SESSSION I SHOULD LOG OUT");
    const session = await getSession(request.headers.get('Cookie'));
    const headers = { 'Set-Cookie': await destroySession(session) };
    return new Response('Logout Success', { headers });
};