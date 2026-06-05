import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Auth pages: reachable while logged out, but a logged-in user is bounced away.
const authRoutes = ["/sign-in", "/sign-up"];

// Public pages: reachable by everyone, logged in or not. Add landing/marketing
// paths here. Everything not listed as public/auth is treated as protected.
const publicRoutes: string[] = [];

// Where to send users after the relevant redirect.
const SIGN_IN = "/sign-in";
const AFTER_SIGN_IN = "/";

function matches(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Optimistic check: only verifies the session cookie is present, not that it
  // is valid (no DB hit). This is for redirect UX — real authorization must
  // still happen in the route/layout or server actions.
  const hasSession = !!getSessionCookie(request);

  // Logged-in users shouldn't see sign-in / sign-up.
  if (matches(pathname, authRoutes)) {
    if (hasSession) return NextResponse.redirect(new URL(AFTER_SIGN_IN, request.url));
    return NextResponse.next();
  }

  // Open to everyone.
  if (matches(pathname, publicRoutes)) {
    return NextResponse.next();
  }

  // Protected: send logged-out users to sign-in, remembering where they wanted
  // to go so we can bounce them back after a successful login.
  if (!hasSession) {
    const url = new URL(SIGN_IN, request.url);
    url.searchParams.set("redirect", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on every path except Next internals, static assets, and common
    // metadata files — otherwise auth redirects can block CSS/JS/images.
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)"
  ]
};
