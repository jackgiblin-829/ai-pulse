import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "ai_pulse_session";

// Edge middleware: stateless JWT signature check only (pg can't run
// here — serverExternalPackages). Server components re-check via
// requireSession() as defense in depth.
export async function middleware(req) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      return NextResponse.next();
    } catch {
      /* fall through to redirect */
    }
  }
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
