"use client";
import { useActionState, useState } from "react";
import { addUser, deleteUser, resetPassword } from "@/app/(app)/admin/users/actions";

const inputCls =
  "mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm " +
  "focus:border-[var(--accent)] focus:outline-none";
const labelCls = "block text-xs font-medium text-[var(--text-secondary)]";
const smallBtn =
  "rounded-md border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-medium " +
  "text-[var(--text-secondary)] hover:bg-[var(--page)] disabled:opacity-50";

function ResetForm({ id, onDone }) {
  const [state, action, pending] = useActionState(async (prev, fd) => {
    const res = await resetPassword(prev, fd);
    if (res?.ok) onDone();
    return res;
  }, null);
  return (
    <form action={action} className="mt-2 flex items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <label className={`${labelCls} flex-1`}>
        New password
        <input name="password" type="password" required minLength={8} className={inputCls} />
      </label>
      <button type="submit" disabled={pending} className={`${smallBtn} mb-0.5`}>
        {pending ? "…" : "Set"}
      </button>
      {state?.error && <p className="mb-1.5 text-xs text-[#e34948]">{state.error}</p>}
    </form>
  );
}

export default function UsersAdmin({ users, selfId }) {
  const [addState, addAction, addPending] = useActionState(addUser, null);
  const [delState, delAction] = useActionState(deleteUser, null);
  const [resetting, setResetting] = useState(null);

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Email</th>
              <th className="py-2 font-medium">Role</th>
              <th className="py-2 font-medium">Added</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="border-t border-[var(--grid)] py-2 text-sm font-medium">
                  {u.name}
                  {u.id === selfId && <span className="ml-1.5 text-xs text-[var(--text-muted)]">(you)</span>}
                  {resetting === u.id && <ResetForm id={u.id} onDone={() => setResetting(null)} />}
                </td>
                <td className="border-t border-[var(--grid)] py-2 text-sm text-[var(--text-secondary)]">{u.email}</td>
                <td className="border-t border-[var(--grid)] py-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${
                    u.role === "admin" ? "bg-[#eceafb] text-[#4a3aa7]" : "bg-[var(--page)] text-[var(--text-secondary)]"
                  }`}>{u.role}</span>
                </td>
                <td className="border-t border-[var(--grid)] py-2 text-xs text-[var(--text-secondary)]">{u.created}</td>
                <td className="border-t border-[var(--grid)] py-2 text-right">
                  <div className="flex justify-end gap-1.5">
                    <button type="button" className={smallBtn}
                      onClick={() => setResetting(resetting === u.id ? null : u.id)}>
                      Reset password
                    </button>
                    <form action={delAction}>
                      <input type="hidden" name="id" value={u.id} />
                      <button type="submit" disabled={u.id === selfId} className={smallBtn}>
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {delState?.error && <p className="mt-2 text-xs text-[#e34948]">{delState.error}</p>}
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold">Add user</h2>
        <form action={addAction} className="mt-3 grid items-end gap-3 sm:grid-cols-5">
          <label className={labelCls}>
            Name
            <input name="name" required className={inputCls} />
          </label>
          <label className={labelCls}>
            Email
            <input name="email" type="email" required className={inputCls} />
          </label>
          <label className={labelCls}>
            Password
            <input name="password" type="password" required minLength={8} className={inputCls} />
          </label>
          <label className={labelCls}>
            Role
            <select name="role" className={inputCls}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <button type="submit" disabled={addPending}
            className="rounded-md bg-[var(--text-primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            {addPending ? "Adding…" : "Add"}
          </button>
        </form>
        {addState?.error && <p className="mt-2 text-xs text-[#e34948]">{addState.error}</p>}
        {addState?.ok && <p className="mt-2 text-xs text-[#006300]">User added.</p>}
      </div>
    </div>
  );
}
