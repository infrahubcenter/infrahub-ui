import { NextRequest, NextResponse } from "next/server";

// Coarse, cookie-presence-only gate. It cannot verify the token (the
// signing secret lives only on the backend) and it never makes the
// authorization decision -- it just keeps a logged-out browser from
// flashing a protected page before redirecting. The backend independently
// authenticates and authorizes every API call; that is the real boundary.
const PUBLIC_PATHS = ["/login", "/forbidden"];

// Branding assets the login page (and every other unauthenticated
// screen) renders as plain <img> tags -- these must be reachable by a
// logged-out browser exactly like /favicon.ico already was, or the
// logo silently 307s to /login and the <img> just breaks.
const PUBLIC_ASSETS = ["/favicon.ico", "/favicon.svg", "/icon.svg", "/logo.svg", "/logo-icon.svg"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith("/_next") ||
    PUBLIC_ASSETS.includes(pathname)
  ) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has("vmcc_access_token");
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image).*)"],
};
