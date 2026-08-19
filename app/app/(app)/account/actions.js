"use server";

import { q } from "@/lib/db";
import {
  hashPassword, requireSession, setSessionCookie, verifyPassword,
} from "@/lib/auth";

export async function changePassword(prevState, formData) {
  const session = await requireSession();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) return { error: "New password must be at least 8 characters" };
  if (next !== confirm) return { error: "New passwords don't match" };

  const [user] = await q(
    "SELECT id, email, name, role, password_hash, token_version FROM users WHERE id = $1",
    [Number(session.sub)]);
  if (!user || !(await verifyPassword(current, user.password_hash))) {
    return { error: "Current password is incorrect" };
  }

  // Bump token_version to revoke every other session, then re-issue
  // this device's cookie against the new version.
  const [updated] = await q(
    `UPDATE users SET password_hash = $1, token_version = token_version + 1
     WHERE id = $2 RETURNING id, email, name, role, token_version`,
    [await hashPassword(next), user.id]);
  await setSessionCookie(updated);
  return { ok: true };
}
