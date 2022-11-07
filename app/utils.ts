import { useMatches } from "@remix-run/react";
import { useMemo } from "react";
import { getSession } from '~/session.server';
import type { Session } from '@remix-run/node';
import type { UserProperties } from "~/models/user.server";
import { redirect } from "@remix-run/node";


const DEFAULT_REDIRECT = "/streams";

export function getUserIdFromSession(session: Session) {
  const userId = session.get('uid') as string | undefined;
  const uid = userId ? String(userId) : undefined;
  return uid;
}

export async function optionalUid(request: Request): Promise<{ session: Session, uid: string | undefined }> {
  const session = await getSession(request.headers.get('Cookie'));
  return { session, uid: getUserIdFromSession(session) };
}

export async function requireUserSession(request: Request): Promise<{ session: Session, uid: string }> {
  // get the session
  const cookie = request.headers.get("cookie");

  if (!cookie) {
    throw redirect(DEFAULT_REDIRECT);
  }

  const session = await getSession(cookie);

  if (!session) {
    throw redirect(DEFAULT_REDIRECT);
  }

  const uid = getUserIdFromSession(session);

  if (!uid) {
    // if there is no user session, redirect to login
    throw redirect(DEFAULT_REDIRECT);
  }

  return { session, uid };
}

/**
 * This should be used any time the redirect path is user-provided
 * (Like the query string on our login/signup pages). This avoids
 * open-redirect vulnerabilities.
 * @param {string} to The redirect destination
 * @param {string} defaultRedirect The redirect to use if the to is unsafe.
 */
export function safeRedirect(
  to: FormDataEntryValue | string | null | undefined,
  defaultRedirect: string = DEFAULT_REDIRECT
) {
  if (!to || typeof to !== "string") {
    return defaultRedirect;
  }

  if (!to.startsWith("/") || to.startsWith("//")) {
    return defaultRedirect;
  }

  return to;
}

/**
 * This base hook is used in other hooks to quickly search for specific data
 * across all loader data using useMatches.
 * @param {string} id The route id
 * @returns {JSON|undefined} The router data or undefined if not found
 */
export function useMatchesData(
  id: string
): Record<string, unknown> | undefined {
  const matchingRoutes = useMatches();
  const route = useMemo(
    () => matchingRoutes.find((route) => route.id === id),
    [matchingRoutes, id]
  );
  return route?.data;
}


export function useOptionalUser(): UserProperties | undefined {
  const data = useMatchesData("root");
  if (!data || !isUser(data.user)) {
    return undefined;
  }
  return data.user;
}

export function useUser(): User {
  const maybeUser = useOptionalUser();
  if (!maybeUser) {
    throw new Error(
      "No user found in root loader, but user is required by useUser. If user is optional, try useOptionalUser instead."
    );
  }
  return maybeUser;
}

export function validateEmail(email: unknown): email is string {
  return typeof email === "string" && email.length > 3 && email.includes("@");
}
