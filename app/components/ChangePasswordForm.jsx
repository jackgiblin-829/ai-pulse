"use client";
import { useActionState } from "react";
import { changePassword } from "@/app/(app)/account/actions";

const inputCls =
  "mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm " +
  "focus:border-[var(--accent)] focus:outline-none";
const labelCls = "block text-xs font-medium text-[var(--text-secondary)]";

export default function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, null);
  return (
    <form action={action} className="mt-4 space-y-3">
      <label className={labelCls}>
        Current password
        <input name="current" type="password" required autoComplete="current-password" className={inputCls} />
      </label>
      <label className={labelCls}>
        New password
        <input name="next" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
      </label>
      <label className={labelCls}>
        Confirm new password
        <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
      </label>
      {state?.error && <p className="text-xs text-[#e34948]">{state.error}</p>}
      {state?.ok && <p className="text-xs text-[#006300]">Password changed.</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
