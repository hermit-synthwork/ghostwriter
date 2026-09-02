"use client";

import { useState } from "react";

type Format = "4x5" | "9x16";

export function PanelViewer({ panelUrls }: { panelUrls: { "4x5": string[]; "9x16": string[] } | null }) {
  const has4x5 = (panelUrls?.["4x5"]?.length ?? 0) > 0;
  const has9x16 = (panelUrls?.["9x16"]?.length ?? 0) > 0;
  const [fmt, setFmt] = useState<Format>(has4x5 ? "4x5" : "9x16");

  if (!panelUrls || (!has4x5 && !has9x16)) {
    return <p className="text-sm text-zinc-500">No composed panels yet.</p>;
  }

  const urls = panelUrls[fmt] ?? [];

  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg border border-zinc-800 p-0.5 text-xs">
        {(["4x5", "9x16"] as Format[]).map((f) => {
          const disabled = f === "4x5" ? !has4x5 : !has9x16;
          return (
            <button
              key={f}
              type="button"
              disabled={disabled}
              onClick={() => setFmt(f)}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors disabled:opacity-30 ${
                fmt === f ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {f === "4x5" ? "4:5 · IG" : "9:16 · TikTok"}
            </button>
          );
        })}
      </div>
      <div className={`grid gap-2 ${fmt === "4x5" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3 sm:grid-cols-4"}`}>
        {urls.map((u, i) => (
          <a key={u} href={u} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={u}
              alt={`panel ${i + 1}`}
              className={`w-full rounded-md object-cover ring-1 ring-zinc-800 ${fmt === "4x5" ? "aspect-[4/5]" : "aspect-[9/16]"}`}
            />
          </a>
        ))}
      </div>
    </div>
  );
}
