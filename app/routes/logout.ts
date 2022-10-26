import { LoaderArgs, redirect } from "@remix-run/node";
import { destroySession, getSession } from '~/session.server';
export { action } from '~/logout.server';

export async function loader({ request }: LoaderArgs) {
    const session = await getSession(request.headers.get('Cookie'));
    const headers = { 'Set-Cookie': await destroySession(session) };
    return redirect("/streams", { headers });
}