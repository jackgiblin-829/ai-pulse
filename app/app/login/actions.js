"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { setSessionCookie, verifyPassword } from "@/lib/auth";

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

export async function login(prevState, formData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  const hdrs = await headers();
  const ip = (hdrs.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";

  // Rate limit: 5 failures per email or IP inside the window.
  const [{ n } = { n: 0 }] = await q(
    `SELECT COUNT(*)::int AS n FROM login_attempts
     WHERE (email = $1 OR ip = $2)
       AND attempted_at > now() - INTERVAL '${WINDOW_MINUTES} minutes'`,
    [email, ip]);
  if (n >= MAX_ATTEMPTS) {
    return { error: `Too many attempts — try again in ${WINDOW_MINUTES} minutes` };
  }

  const [user] = await q(
    "SELECT id, email, name, password_hash, role, token_version FROM users WHERE email = $1",
    [email]);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    await q("INSERT INTO login_attempts (email, ip) VALUES ($1, $2)", [email, ip]);
    return { error: "Invalid email or password" };
  }

  await q("DELETE FROM login_attempts WHERE email = $1 OR ip = $2", [email, ip]);
  await setSessionCookie(user);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
