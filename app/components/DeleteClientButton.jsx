"use client";
import { useActionState } from "react";
import { deleteClient } from "@/app/(app)/admin/clients/actions";

export default function DeleteClientButton({ id, name }) {
  const [state, action, pending] = useActionState(deleteClient, null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Delete ${name} and ALL its ingested data? This cannot be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-[#e34948]/40 bg-white px-3 py-1.5 text-xs font-medium text-[#e34948] transition-colors hover:bg-[#fdf0f0] disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete client"}
      </button>
      {state?.error && <p className="mt-1 text-xs text-[#e34948]">{state.error}</p>}
    </form>
  );
}
