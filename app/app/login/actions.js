"use server";

import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { setSessionCookie, verifyPassword } from "@/lib/auth";

export async function login(prevState, formData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  const [user] = await q(
    "SELECT id, email, name, password_hash, role FROM users WHERE email = $1", [email]);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { error: "Invalid email or password" };
  }
  await setSessionCookie(user);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
