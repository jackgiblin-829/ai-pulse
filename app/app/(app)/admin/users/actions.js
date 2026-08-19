"use server";

import { revalidatePath } from "next/cache";
import { q } from "@/lib/db";
import { hashPassword, requireAdmin } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function addUser(prevState, formData) {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = formData.get("role") === "admin" ? "admin" : "member";

  if (!EMAIL_RE.test(email)) return { error: "Valid email required" };
  if (!name) return { error: "Name required" };
  if (password.length < 8) return { error: "Password must be at least 8 characters" };

  try {
    await q(
      "INSERT INTO users (email, name, password_hash, role) VALUES ($1,$2,$3,$4)",
      [email, name, await hashPassword(password), role]);
  } catch (e) {
    if (e.code === "23505") return { error: `${email} already has an account` };
    throw e;
  }
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function deleteUser(prevState, formData) {
  const session = await requireAdmin();
  const id = Number(formData.get("id"));
  if (id === Number(session.sub)) return { error: "You can't delete your own account" };
  await q("DELETE FROM users WHERE id = $1", [id]);
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function resetPassword(prevState, formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters" };
  await q("UPDATE users SET password_hash = $1 WHERE id = $2", [await hashPassword(password), id]);
  revalidatePath("/admin/users");
  return { ok: true };
}
