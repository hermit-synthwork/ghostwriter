"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Back affordance for the episode detail page: a real tap target plus an
 * Escape shortcut. The page is long (panels + script), so the faint link that
 * used to sit at the top scrolled out of reach on a phone.
 */
export function BackBar() {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.altKey || e.ctrlKey || e.metaKey) return;
      // Never yank the page out from under someone editing the caption.
      const t = e.target as HTMLElement | null;
      if (t?.isContentEditable) return;
      const tag = t?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
      router.push("/");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => router.push("/")}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
      >
        <span aria-hidden="true">&larr;</span> All episodes
      </button>
      <span className="hidden text-xs text-zinc-600 sm:inline">
        or press <kbd className="rounded border border-zinc-700 px-1 py-0.5 font-sans text-[10px] text-zinc-400">Esc</kbd>
      </span>
    </div>
  );
}
