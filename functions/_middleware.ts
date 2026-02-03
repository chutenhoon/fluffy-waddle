import type { Env } from "./_lib/env";
import { getCookie, SESSION_COOKIE, verifySession } from "./_lib/auth";
import { errorJson } from "./_lib/response";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);
const PUBLIC_PREFIXES = ["/assets/", "/favicon", "/robots", "/manifest"];

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (request.method === "OPTIONS") {
    return next();
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return next();
  }

  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return next();
  }

  const token = getCookie(request, SESSION_COOKIE);
  if (token) {
    const session = await verifySession(env.SESSION_SECRET, token);
    if (session) {
      return next();
    }
  }

  if (pathname.startsWith("/api/")) {
    return errorJson(401, "Unauthorized");
  }

  url.pathname = "/login";
  return Response.redirect(url.toString(), 302);
};
