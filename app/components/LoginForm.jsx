"use client";
import { useActionState } from "react";
import { login } from "@/app/login/actions";

const inputCls =
  "mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm " +
  "focus:border-[var(--accent)] focus:outline-none";

export default function LoginForm({ next }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block text-xs font-medium text-[var(--text-secondary)]">
        Email
        <input name="email" type="email" required autoComplete="email" className={inputCls} />
      </label>
      <label className="block text-xs font-medium text-[var(--text-secondary)]">
        Password
        <input name="password" type="password" required autoComplete="current-password" className={inputCls} />
      </label>
      {state?.error && <p className="text-xs text-[#e34948]">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-[var(--text-primary)] px-3 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
