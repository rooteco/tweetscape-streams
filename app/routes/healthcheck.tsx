// learn more: https://fly.io/docs/reference/configuration/#services-http_checks
import type { LoaderArgs } from "@remix-run/server-runtime";

export async function loader({ request }: LoaderArgs) {
    const host =
        request.headers.get("X-Forwarded-Host") ?? request.headers.get("host");

    try {
        const url = new URL("/", `http://${host}`);
        // if we can connect to the database and make a simple query
        // and make a HEAD request to ourselves, then we're good.
        console.log(url);
        return url;
    } catch (error: unknown) {
        console.log("healthcheck ❌", { error });
        return new Response("ERROR", { status: 500 });
    }
}
