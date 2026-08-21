import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { q } from "./db";

export const SESSION_COOKIE = "ai_pulse_session";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET env var is not set");
  return new TextEncoder().encode(secret);
}

export const hashPassword = (pw) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);

export async function createSessionToken(user) {
  return new SignJWT({ email: user.email, name: user.name, role: user.role,
                       tv: user.token_version ?? 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${THIRTY_DAYS}s`)
    .sign(secretKey());
}

export async function setSessionCookie(user) {
  const token = await createSessionToken(user);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// -> { sub, email, name, role } | null
export async function getSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload;
  } catch {
    return null;
  }
}

// Full check: valid JWT AND the user still exists with an unchanged
// token_version — deleting a user or resetting their password (which
// bumps token_version) invalidates every outstanding session.
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  const [user] = await q("SELECT token_version FROM users WHERE id = $1", [Number(session.sub)]);
  if (!user || user.token_version !== (session.tv ?? 0)) {
    // Can't clear the cookie mid-render; logging back in overwrites it.
    redirect("/login");
  }
  return session;
}

// API-route variant of requireSession(): same JWT + token_version DB
// check, but returns { session, error } where error is a 401 JSON
// NextResponse — API callers get a status code, not a login redirect.
// Usage:  const { session, error } = await requireApiSession();
//         if (error) return error;
export async function requireApiSession() {
  const unauthorized = () =>
    NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await getSession();
  if (!session) return { session: null, error: unauthorized() };
  const [user] = await q("SELECT token_version FROM users WHERE id = $1", [Number(session.sub)]);
  if (!user || user.token_version !== (session.tv ?? 0)) {
    return { session: null, error: unauthorized() };
  }
  return { session, error: null };
}

export async function requireAdmin() {
  const session = await requireSession();
  if (session.role !== "admin") redirect("/");
  return session;
}
