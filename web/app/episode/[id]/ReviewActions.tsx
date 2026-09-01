"use client";

import { useFormStatus } from "react-dom";
import { approveAction, rejectAction, saveCaptionAction } from "./actions";

export function ReviewActions({
  id, caption, hashtags,
}: { id: string; caption: string; hashtags: string[] }) {
  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <form className="space-y-3">
        <label className="block text-xs font-medium text-zinc-400">
          Caption
          <textarea
            name="caption"
            defaultValue={caption}
            rows={5}
            className="mt-1 w-full resize-y rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          />
        </label>
        {hashtags.length > 0 && (
          <p className="text-xs text-zinc-500">{hashtags.map((h) => `#${h.replace(/^#+/, "")}`).join(" ")}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Submit
            formAction={approveAction.bind(null, id)}
            className="bg-emerald-600 text-white hover:bg-emerald-500"
            pending="Approving…"
          >
            Approve &amp; publish
          </Submit>
          <Submit
            formAction={saveCaptionAction.bind(null, id)}
            className="border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
            pending="Saving…"
          >
            Save caption
          </Submit>
        </div>
      </form>

      <form action={rejectAction.bind(null, id)} onSubmit={(e) => { if (!confirm("Reject this episode? It won't be published.")) e.preventDefault(); }}>
        <Submit className="text-zinc-500 hover:text-red-400" pending="Rejecting…">
          Reject
        </Submit>
      </form>
    </div>
  );
}

function Submit({
  children, className = "", formAction, pending,
}: {
  children: React.ReactNode;
  className?: string;
  formAction?: (formData: FormData) => void;
  pending: string;
}) {
  const { pending: busy } = useFormStatus();
  return (
    <button
      type="submit"
      formAction={formAction}
      disabled={busy}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${className}`}
    >
      {busy ? pending : children}
    </button>
  );
}
