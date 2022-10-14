import { redirect } from "@remix-run/node";

export { action } from '~/logout.server';

export async function loader() {
    return redirect("/homeTimeline");
}