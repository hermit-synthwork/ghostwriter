import Link from "next/link";
import { notFound } from "next/navigation";
import { getEpisodeWithTenant } from "@/lib/episodes";
import type { StoryJson } from "@/lib/db";
import { StatusChip, GenreChip, relTime } from "../../ui";
import { PanelViewer } from "./PanelViewer";
import { ReviewActions } from "./ReviewActions";

export const dynamic = "force-dynamic";

export default async function EpisodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await getEpisodeWithTenant(id);
  if (!e) notFound();

  const story = e.storyJson as StoryJson;
  const panels = story?.panels ?? [];

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">&larr; all episodes</Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={e.status} />
          <GenreChip genre={e.genre} />
          <span className="text-xs text-zinc-500">
            {e.tenant.displayName} · {e.tenant.styleKey}
            {e.tenant.language !== "en" && ` · ${e.tenant.language}`}
          </span>
        </div>
        <h1 className="text-xl font-semibold text-zinc-100">{e.title}</h1>
        <p className="text-sm text-zinc-400">{e.logline}</p>
        <p className="text-xs text-zinc-600">
          created {relTime(e.createdAt)}
          {e.approvedAt && ` · approved ${relTime(e.approvedAt)}`}
          {e.postedAt && ` · posted ${relTime(e.postedAt)}`}
          {e.scheduledFor && ` · scheduled ${new Date(e.scheduledFor).toISOString().slice(0, 16).replace("T", " ")}Z`}
        </p>
        {e.error && (
          <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-300 ring-1 ring-inset ring-red-500/30">
            {e.error}
          </p>
        )}
        {e.posts && e.posts.length > 0 && (
          <ul className="text-xs text-zinc-500">
            {e.posts.map((p) => <li key={p.postId}>{p.platform} @{p.handle} — {p.postId}</li>)}
          </ul>
        )}
      </header>

      <section>
        <PanelViewer panelUrls={e.panelUrls} />
      </section>

      {e.status === "ready" ? (
        <ReviewActions
          id={e.id}
          caption={e.caption}
          hashtags={e.hashtags}
          postTime={e.tenant.cadence?.time}
          tz={e.tenant.cadence?.tz}
        />
      ) : (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <p className="text-xs font-medium text-zinc-500">Caption</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{e.caption || <span className="text-zinc-600">—</span>}</p>
          {e.hashtags.length > 0 && (
            <p className="mt-2 text-xs text-zinc-500">{e.hashtags.map((h) => `#${h.replace(/^#+/, "")}`).join(" ")}</p>
          )}
          <p className="mt-2 text-xs text-zinc-600">Read-only — actions are only available while an episode is <em>ready</em>.</p>
        </section>
      )}

      {panels.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-300">Script</h2>
          <ol className="space-y-3">
            {panels.map((p) => (
              <li key={p.n} className="rounded-md border border-zinc-800 bg-zinc-900/30 p-2.5 text-sm">
                <p className="text-xs font-medium text-zinc-500">Panel {p.n}</p>
                <p className="mt-1 text-zinc-400">{p.scene}</p>
                {p.narration && <p className="mt-1 italic text-zinc-500">{p.narration}</p>}
                {p.dialogue && p.dialogue.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {p.dialogue.map((d, i) => (
                      <li key={i} className="text-zinc-300">
                        <span className="text-zinc-500">{d.speaker}:</span> {d.text}
                      </li>
                    ))}
                  </ul>
                )}
                {p.sfx && <p className="mt-1 text-xs uppercase tracking-wide text-zinc-600">sfx: {p.sfx}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
