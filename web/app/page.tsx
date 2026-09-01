import Link from "next/link";
import { listEpisodes, type EpisodeWithTenant } from "@/lib/episodes";
import { StatusChip, GenreChip, relTime } from "./ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const episodes = await listEpisodes();
  const needsReview = episodes.filter((e) => e.status === "ready");
  const queued = episodes.filter((e) => e.status === "approved");
  const rest = episodes.filter((e) => e.status !== "ready" && e.status !== "approved");

  return (
    <div className="space-y-8">
      <Section title="Needs review" count={needsReview.length} empty="Nothing waiting. New episodes show up here after each run.">
        {needsReview.map((e) => <EpisodeCard key={e.id} e={e} />)}
      </Section>

      {queued.length > 0 && (
        <Section title="Approved · posts on the next sweep" count={queued.length}>
          {queued.map((e) => <EpisodeCard key={e.id} e={e} />)}
        </Section>
      )}

      <Section title="Recent" count={rest.length} empty="No history yet.">
        {rest.map((e) => <EpisodeCard key={e.id} e={e} />)}
      </Section>
    </div>
  );
}

function Section({
  title, count, empty, children,
}: { title: string; count: number; empty?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-zinc-300">
        {title}
        <span className="text-xs font-normal text-zinc-500">{count}</span>
      </h2>
      {count === 0 ? (
        empty ? <p className="text-sm text-zinc-500">{empty}</p> : null
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </section>
  );
}

function EpisodeCard({ e }: { e: EpisodeWithTenant }) {
  const thumb = e.panelUrls?.["4x5"]?.[0];
  return (
    <li>
      <Link
        href={`/episode/${e.id}`}
        className="flex gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-20 w-16 shrink-0 rounded object-cover ring-1 ring-zinc-800" />
        ) : (
          <div className="h-20 w-16 shrink-0 rounded bg-zinc-800" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusChip status={e.status} />
            <GenreChip genre={e.genre} />
            {e.tenant.language !== "en" && (
              <span className="text-xs text-zinc-500">{e.tenant.language}</span>
            )}
          </div>
          <p className="mt-1 truncate font-medium text-zinc-100">{e.title}</p>
          <p className="mt-0.5 truncate text-sm text-zinc-400">{e.logline}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {e.tenant.displayName} · {relTime(e.createdAt)}
          </p>
        </div>
      </Link>
    </li>
  );
}
