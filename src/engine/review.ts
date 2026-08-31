import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { panelFile, type Story, type Status } from "../lib/story.ts";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/**
 * Write the local review bundle for one episode: `caption.txt`, `status.json`
 * (created as a draft only if absent), and `review.html`. Pure file I/O — no
 * console output, no process exit. Extracted verbatim from the old
 * `src/build-review.ts` script so the scheduled runner (src/run.ts) and the
 * single-episode CLI share one implementation.
 */
export function writeReviewBundle(episodeDir: string, story: Story): void {
  // caption.txt
  const caption = `${story.caption}\n\n${story.hashtags.map((h) => (h.startsWith("#") ? h : "#" + h)).join(" ")}\n`;
  writeFileSync(join(episodeDir, "caption.txt"), caption);

  // status.json (create if missing)
  const statusPath = join(episodeDir, "status.json");
  if (!existsSync(statusPath)) {
    const st: Status = { status: "draft", created: new Date().toISOString() };
    writeFileSync(statusPath, JSON.stringify(st, null, 2) + "\n");
  }
  const status = JSON.parse(readFileSync(statusPath, "utf8")) as Status;

  const panelsHtml = story.panels
    .map((p) => {
      const dlg = (p.dialogue ?? [])
        .map((d) => `<p class="dlg"><b>${esc(d.speaker)}:</b> ${esc(d.text)}</p>`)
        .join("");
      const narr = p.narration ? `<p class="narr">${esc(p.narration)}</p>` : "";
      return `<section class="panel">
  <h3>Panel ${p.n}</h3>
  <div class="imgs">
    <figure><figcaption>9:16</figcaption><img src="panels/final-9x16/${panelFile(p.n)}" alt="panel ${p.n} 9x16"></figure>
    <figure><figcaption>4:5</figcaption><img src="panels/final-4x5/${panelFile(p.n)}" alt="panel ${p.n} 4x5"></figure>
  </div>
  <div class="meta">
    <p class="scene"><b>Scene.</b> ${esc(p.scene)} <span class="cam">(${esc(p.camera)})</span></p>
    ${narr}${dlg}
  </div>
</section>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ghostwriter review · ${esc(story.slug)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#141416; color:#EDE7DB; font:16px/1.55 -apple-system,system-ui,sans-serif; }
  .wrap { max-width:1120px; margin:0 auto; padding:32px 24px 96px; }
  h1 { font-size:26px; margin:0 0 4px; }
  .sub { color:#9aa0a6; margin:0 0 24px; }
  .tag { display:inline-block; padding:2px 10px; border:1px solid #7A2E2E; border-radius:999px; font-size:13px; color:#e2b3b3; margin-right:8px; }
  .card { background:#1c1d20; border:1px solid #2a2b2f; border-radius:12px; padding:20px 22px; margin:18px 0; }
  .card h2 { margin:0 0 10px; font-size:18px; }
  pre.caption { white-space:pre-wrap; background:#0e0e10; border-radius:8px; padding:14px 16px; font:14px/1.5 ui-monospace,Menlo,monospace; color:#d7d2c6; }
  .panel { border-top:1px solid #2a2b2f; padding-top:22px; margin-top:22px; }
  .panel h3 { margin:0 0 12px; color:#c9a24b; }
  .imgs { display:flex; gap:18px; flex-wrap:wrap; }
  .imgs figure { margin:0; }
  .imgs img { height:520px; width:auto; border-radius:8px; background:#0e0e10; display:block; }
  .imgs figcaption { font-size:12px; color:#9aa0a6; margin-bottom:6px; }
  .meta { margin-top:14px; max-width:760px; }
  .meta .scene .cam { color:#9aa0a6; }
  .meta .narr { border-left:3px solid #7A2E2E; padding-left:10px; color:#cfc9bc; font-style:italic; }
  .meta .dlg { margin:4px 0; }
  textarea { width:100%; min-height:120px; background:#0e0e10; color:#EDE7DB; border:1px solid #2a2b2f; border-radius:8px; padding:12px; font:14px/1.5 inherit; box-sizing:border-box; }
  code { background:#0e0e10; padding:2px 6px; border-radius:5px; }
</style></head>
<body><div class="wrap">
  <h1>${esc(story.title)}</h1>
  <p class="sub">${esc(story.slug)} · <span class="tag">${esc(story.genre)}</span> ${story.panels.length} panels · status: <b>${esc(status.status)}</b></p>
  <p class="sub">${esc(story.logline)}</p>

  <div class="card">
    <h2>Caption</h2>
    <pre class="caption">${esc(caption)}</pre>
  </div>

  <div class="card">
    <h2>Your notes</h2>
    <textarea id="notes" placeholder="Tweaks before approving… (saved in this browser only)"></textarea>
  </div>

  <div class="card">
    <h2>Approve / reject</h2>
    <p>Happy with it? &nbsp;<code>npm run approve ${esc(story.slug)}</code></p>
    <p>Need art changes? Edit <code>episodes/${esc(story.slug)}/story.json</code>, then re-run <code>npm run art ${esc(story.slug)}</code> (only missing panels regenerate — delete a panel PNG to redo it).</p>
    <p>Only copy changed? Edit <code>story.json</code> and re-run <code>npm run compose ${esc(story.slug)}</code> — no art cost.</p>
  </div>

  <h2>Panels</h2>
  ${panelsHtml}
</div>
<script>
  var t = document.getElementById('notes'), k = 'ghostwriter:notes:${esc(story.slug)}';
  try { t.value = localStorage.getItem(k) || ''; } catch (e) {}
  t.addEventListener('input', function(){ try { localStorage.setItem(k, t.value); } catch (e) {} });
</script>
</body></html>`;

  writeFileSync(join(episodeDir, "review.html"), html);
}
