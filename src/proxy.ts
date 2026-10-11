import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "et_session";
const PUBLIC_PAGES = ["/login", "/signup"];

/**
 * Optimistic page guard: send signed-out visitors to /login and signed-in ones away from it.
 * Route handlers still verify the session themselves on every request.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC_PAGES.includes(pathname);

  if (!hasSession && !isPublic) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (hasSession && isPublic) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|.*\\.(?:png|svg|jpg|ico|webmanifest)$).*)"],
};
