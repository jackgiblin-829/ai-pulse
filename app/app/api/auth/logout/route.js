import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export async function POST(req) {
  await clearSessionCookie();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}

// A GET (bookmarked URL, typed address) shouldn't strand the user on a
// blank 405 — send them to the login page without touching the session.
export async function GET(req) {
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
