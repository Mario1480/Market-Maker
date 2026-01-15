import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/favicon.ico"
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/_next") || pathname.startsWith("/images")) {
    return NextResponse.next();
  }
  if (pathname.match(/\.(png|jpg|jpeg|svg|gif|ico|webp)$/)) {
    return NextResponse.next();
  }

  const session = req.cookies.get("mm_session");
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const apiBase =
    process.env.API_URL ??
    process.env.API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL;
  if (!apiBase) return NextResponse.next();

  return validateSession(req, apiBase);
}

async function validateSession(req: NextRequest, apiBase: string) {
  try {
    const res = await fetch(`${apiBase}/auth/me`, {
      headers: { cookie: req.headers.get("cookie") ?? "" },
      cache: "no-store"
    });
    if (res.ok) return NextResponse.next();
  } catch {
    // fall through to redirect
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  const resp = NextResponse.redirect(url);
  resp.cookies.set("mm_session", "", { path: "/", maxAge: 0 });
  return resp;
}

export const config = {
  matcher: ["/((?!_next).*)"]
};
