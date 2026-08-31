# Ghostwriter SaaS Phase 0 — Tenant-Aware Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-tenant Ghostwriter CLI into a headless, multi-tenant engine that generates and (optionally) publishes one comic-carousel episode per due tenant, driven by file-based tenant configs and a cron runner.

**Architecture:** Extract the core of `gen-art` / `compose` / `publish` into pure-ish functions under `src/engine/` that take a `TenantConfig` + an episode directory. Add `src/write-story.ts` (Anthropic API) to replace the in-session story step. Add `src/run.ts` which resolves due tenants from `tenants/*.json`, generates an episode per tenant, and gates on the tenant's `autonomy` setting. House styles move from a single `config/style-bible.md` to `styles/<key>/`. Existing `src/*.ts` CLI scripts stay as thin local-dev wrappers.

**Tech Stack:** Node 22+ / TypeScript / `tsx`, `node:test` runner, `@anthropic-ai/sdk`, `@google/genai`, `satori`, `sharp`, Zernio REST.

**Spec:** `docs/superpowers/specs/2026-08-31-ghostwriter-saas-design.md` (Phase 0 section + "Verification — Phase 0")

## Global Constraints

- Node **22+** (uses `process.loadEnvFile`, `node --test`). Runtime is Node 25 locally.
- TypeScript strict mode; `allowImportingTsExtensions` is on — **import local modules with the `.ts` suffix** (`./lib/env.ts`).
- ESM only (`"type": "module"`). No CommonJS.
- New credentials are **key-last**: if `ANTHROPIC_API_KEY` (or any key) is missing, the code must exit with the `requireEnv` message and the executor must STOP and tell the user — never mock, stub, or fake a key.
- No secrets in tracked files. `.env` is gitignored; keep it that way.
- Anthropic model id: **`claude-sonnet-5`**. Gemini image model default: **`gemini-3.1-flash-image`** (already in `src/gemini.ts`).
- Do not add dependencies beyond `@anthropic-ai/sdk`. Use the built-in `node:test`.
- Frequent commits: one per task minimum.
- Episode directories gain a tenant level: `episodes/<tenantId>/<YYYY-MM-DD>-<slug>/`.

---

## File Structure

**New:**
- `src/lib/tenant.ts` — `TenantConfig` type, `loadTenant`, `listTenants`, `isDue`, `episodeDirFor`
- `src/lib/style.ts` — `resolveStyle(key)` → `{ key, bible, refPath, tokens }`
- `src/lib/usage.ts` — `logUsage`, `readUsage`, `estimateCents`
- `src/write-story.ts` — `writeStory(input)` + `buildStoryMessages(input)` + CLI
- `src/engine/art.ts` — `generateArt(tenant, episodeDir, story)` + `buildPanelPrompt`
- `src/engine/compose.ts` — `composeEpisode(tenant, episodeDir, story)`
- `src/engine/publish.ts` — `publishEpisode(tenant, episodeDir, story, mode)` + `selectTargets`
- `src/engine/review.ts` — `writeReviewBundle(episodeDir, story)` (caption.txt + status.json + review.html)
- `src/run.ts` — `runDueTenants(opts)` + `resolveRunPlan(tenants, now)` + CLI
- `styles/graphic-novel-noir/{style-bible.md,style-ref.png,tokens.json}` (moved from `config/` + `assets/`)
- `styles/manga-ink/{style-bible.md,tokens.json}` (ref generated during verification)
- `styles/retro-halftone/{style-bible.md,tokens.json}` (ref generated during verification)
- `tenants/demo-a.json`, `tenants/demo-b.json`
- `test/*.test.ts` — one file per unit under test

**Modified:**
- `src/gemini.ts` — `generateImage(prompt, refs, aspect, apiKey?)`; `getClient(apiKey?)`
- `src/lib/letter.ts` — `renderOverlaySvg(panel, story, brand, size)` where `brand` becomes `{ displayName, handle, tokens, show }` (no more `config/brand.json` import)
- `src/lib/story.ts` — add optional `styleKey`, `niche` on `Story`; add `Story.genre` already present; keep `resolveEpisodeDir` for the local wrappers
- `src/gen-art.ts`, `src/compose.ts`, `src/publish.ts`, `src/build-review.ts` — become ~15-line wrappers that build a "local" `TenantConfig` from `tenants/local.json` (or a built-in default) and call the matching `src/engine/*` function
- `src/lib/env.ts` — no change to `requireEnv`; add nothing (ANTHROPIC_API_KEY uses the same helper)
- `package.json` — add `@anthropic-ai/sdk`; scripts `test`, `run`, `story`
- `.env.example` — add `ANTHROPIC_API_KEY`
- `.gitignore` — add `usage/`, fix `episodes/` globs for the new tenant level
- `config/brand.json` — deleted (fields move into tenant config + style tokens)
- `config/style-bible.md`, `assets/style-ref.png` — moved into `styles/graphic-novel-noir/`
- `.claude/skills/ghostwriter/SKILL.md` — note the engine is tenant-aware; local dev still uses `/ghostwriter` + `npm run` wrappers

---

## Task 1: Test runner + `TenantConfig` loader

**Files:**
- Modify: `package.json` (scripts)
- Create: `src/lib/tenant.ts`
- Create: `tenants/demo-a.json`, `tenants/demo-b.json`
- Test: `test/tenant.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PublishTarget { accountId: string; handle: string; format: "4x5" | "9x16" }
  export interface Cadence { days: number[]; time: string; tz: string } // days: 0=Sun..6=Sat; time "HH:MM"
  export interface TenantConfig {
    id: string;
    displayName: string;
    styleKey: string;
    niche: string;
    genres: "funny" | "horror" | "both";
    autonomy: "autonomous" | "review_each" | "review_weekly";
    cadence: Cadence;
    publish: { instagram?: PublishTarget; tiktok?: PublishTarget };
    geminiKey?: string;
  }
  export function loadTenant(id: string): TenantConfig
  export function listTenants(): TenantConfig[]
  export const TENANTS_DIR: string
  ```

- [ ] **Step 1: Add the test script to `package.json`**

Add to `"scripts"`:
```json
"test": "node --import tsx --test test/**/*.test.ts",
"run": "tsx src/run.ts",
"story": "tsx src/write-story.ts"
```

- [ ] **Step 2: Write the failing test**

`test/tenant.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTenant, listTenants } from "../src/lib/tenant.ts";

test("loadTenant reads a tenant file and returns typed config", () => {
  const t = loadTenant("demo-a");
  assert.equal(t.id, "demo-a");
  assert.equal(t.styleKey, "graphic-novel-noir");
  assert.equal(t.autonomy, "autonomous");
  assert.equal(t.publish.instagram?.format, "4x5");
});

test("loadTenant throws a clear error for a missing tenant", () => {
  assert.throws(() => loadTenant("nope"), /no tenant.*nope/i);
});

test("listTenants returns all configs including demo-a and demo-b", () => {
  const ids = listTenants().map((t) => t.id).sort();
  assert.deepEqual(ids, ["demo-a", "demo-b"]);
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/lib/tenant.ts'`

- [ ] **Step 4: Create the two tenant fixtures**

`tenants/demo-a.json`:
```json
{
  "id": "demo-a",
  "displayName": "NIGHT SHIFT",
  "styleKey": "graphic-novel-noir",
  "niche": "unsettling things that happen to people working alone at night",
  "genres": "horror",
  "autonomy": "autonomous",
  "cadence": { "days": [1, 3, 5], "time": "09:00", "tz": "Asia/Singapore" },
  "publish": {
    "instagram": { "accountId": "6a911cf277555aae013ed010", "handle": "bennysynthwork", "format": "4x5" }
  }
}
```

`tenants/demo-b.json`:
```json
{
  "id": "demo-b",
  "displayName": "DESK GREMLINS",
  "styleKey": "manga-ink",
  "niche": "office life absurdities, petty revenge, meetings that should have been emails",
  "genres": "funny",
  "autonomy": "review_each",
  "cadence": { "days": [2, 4, 6], "time": "09:00", "tz": "Asia/Singapore" },
  "publish": {
    "instagram": { "accountId": "6a911cf277555aae013ed010", "handle": "bennysynthwork", "format": "4x5" },
    "tiktok": { "accountId": "6a94ee1077555aae012c1ca6", "handle": "ebiyasg", "format": "9x16" }
  }
}
```

- [ ] **Step 5: Implement `src/lib/tenant.ts` (loader portion only)**

```ts
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./env.ts";

export const TENANTS_DIR = join(REPO_ROOT, "tenants");

export interface PublishTarget { accountId: string; handle: string; format: "4x5" | "9x16" }
export interface Cadence { days: number[]; time: string; tz: string }
export interface TenantConfig {
  id: string;
  displayName: string;
  styleKey: string;
  niche: string;
  genres: "funny" | "horror" | "both";
  autonomy: "autonomous" | "review_each" | "review_weekly";
  cadence: Cadence;
  publish: { instagram?: PublishTarget; tiktok?: PublishTarget };
  geminiKey?: string;
}

export function loadTenant(id: string): TenantConfig {
  const path = join(TENANTS_DIR, `${id}.json`);
  if (!existsSync(path)) throw new Error(`No tenant "${id}" at ${path}`);
  const t = JSON.parse(readFileSync(path, "utf8")) as TenantConfig;
  if (t.id !== id) throw new Error(`Tenant file ${id}.json has mismatched id "${t.id}"`);
  return t;
}

export function listTenants(): TenantConfig[] {
  if (!existsSync(TENANTS_DIR)) return [];
  return readdirSync(TENANTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => loadTenant(f.replace(/\.json$/, "")));
}
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `npm test`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add package.json src/lib/tenant.ts tenants/ test/tenant.test.ts
git commit -m "feat(engine): tenant config loader + node:test runner"
```

---

## Task 2: Cadence — `isDue`

**Files:**
- Modify: `src/lib/tenant.ts`
- Test: `test/cadence.test.ts`

**Interfaces:**
- Consumes: `TenantConfig`, `Cadence` from Task 1
- Produces:
  ```ts
  // lastEpisodeDate: "YYYY-MM-DD" of this tenant's most recent episode, or null
  export function isDue(t: TenantConfig, now: Date, lastEpisodeDate: string | null): boolean
  export function localParts(now: Date, tz: string): { weekday: number; hhmm: string; date: string }
  ```

- [ ] **Step 1: Write the failing test**

`test/cadence.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isDue } from "../src/lib/tenant.ts";
import type { TenantConfig } from "../src/lib/tenant.ts";

const base: TenantConfig = {
  id: "t", displayName: "T", styleKey: "graphic-novel-noir", niche: "x",
  genres: "horror", autonomy: "autonomous",
  cadence: { days: [1, 3, 5], time: "09:00", tz: "Asia/Singapore" },
  publish: {},
};

// 2026-08-31 is a Monday. 01:30 UTC = 09:30 Asia/Singapore.
const monday0930sg = new Date("2026-08-31T01:30:00Z");
const monday0830sg = new Date("2026-08-31T00:30:00Z");
const tuesday0930sg = new Date("2026-09-01T01:30:00Z");

test("due on a scheduled weekday after the scheduled time, no episode yet", () => {
  assert.equal(isDue(base, monday0930sg, null), true);
});

test("not due before the scheduled time", () => {
  assert.equal(isDue(base, monday0830sg, null), false);
});

test("not due on a non-scheduled weekday", () => {
  assert.equal(isDue(base, tuesday0930sg, null), false);
});

test("not due if an episode already exists for today (tenant local date)", () => {
  assert.equal(isDue(base, monday0930sg, "2026-08-31"), false);
});

test("due if the last episode was a previous day", () => {
  assert.equal(isDue(base, monday0930sg, "2026-08-28"), true);
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test`
Expected: FAIL — `isDue is not a function`

- [ ] **Step 3: Implement `isDue` + `localParts` in `src/lib/tenant.ts`**

```ts
export function localParts(now: Date, tz: string): { weekday: number; hhmm: string; date: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit",
    year: "numeric", month: "2-digit", day: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[p.weekday as string]!,
    hhmm: `${p.hour}:${p.minute}`,
    date: `${p.year}-${p.month}-${p.day}`,
  };
}

export function isDue(t: TenantConfig, now: Date, lastEpisodeDate: string | null): boolean {
  const { weekday, hhmm, date } = localParts(now, t.cadence.tz);
  if (!t.cadence.days.includes(weekday)) return false;
  if (hhmm < t.cadence.time) return false;
  if (lastEpisodeDate === date) return false;
  return true;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test`
Expected: PASS (all cadence tests + Task 1 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/tenant.ts test/cadence.test.ts
git commit -m "feat(engine): cadence isDue() with tenant-local timezone"
```

---

## Task 3: Style resolution + asset restructure

**Files:**
- Move: `config/style-bible.md` → `styles/graphic-novel-noir/style-bible.md`
- Move: `assets/style-ref.png` → `styles/graphic-novel-noir/style-ref.png`
- Create: `styles/graphic-novel-noir/tokens.json`
- Create: `styles/manga-ink/style-bible.md`, `styles/manga-ink/tokens.json`
- Create: `styles/retro-halftone/style-bible.md`, `styles/retro-halftone/tokens.json`
- Create: `src/lib/style.ts`
- Delete: `config/brand.json`
- Test: `test/style.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface StyleTokens { ink: string; paper: string; accent: string }
  export interface ResolvedStyle { key: string; bible: string; refPath: string; tokens: StyleTokens; hasRef: boolean }
  export function resolveStyle(key: string): ResolvedStyle
  export function listStyleKeys(): string[]
  export const STYLES_DIR: string
  ```

- [ ] **Step 1: Move the existing style assets**

```bash
mkdir -p styles/graphic-novel-noir
git mv config/style-bible.md styles/graphic-novel-noir/style-bible.md
git mv assets/style-ref.png styles/graphic-novel-noir/style-ref.png
```

- [ ] **Step 2: Create `styles/graphic-novel-noir/tokens.json`**

(Values copied from the deleted `config/brand.json` `colors` block.)
```json
{ "ink": "#0E0E10", "paper": "#EDE7DB", "accent": "#7A2E2E" }
```

- [ ] **Step 3: Create two more style bibles + tokens**

`styles/manga-ink/style-bible.md`:
```markdown
# Ghostwriter house style — manga-ink (FROZEN)

Black-and-white manga-influenced comic art. Confident G-pen linework with
strong line-weight variation, dense hatching and screentone (halftone dot and
line tones) for all shading — no flat greys, no colour. Deep spot blacks.
Expressive faces, slightly large eyes, clear emotive body language. Dynamic
panel-worthy compositions, occasional speed lines for motion or shock.
Backgrounds detailed where they matter, blank tone where they don't.

Tone: crisp comedic timing for funny stories; sharp negative space and
held-beat panic for horror — dread over gore, PG-13, no wounds or blood.

Characters: fresh cast per episode, distinct silhouettes, one memorable
prop or garment each.

Hard rules for panel art:
- No lettering, speech balloons, caption boxes, or readable signage in the
  image. Those are composited later in code.
- Keep faces and key action inside the central vertical 80%.
- Keep the top ~18% and bottom ~22% visually calm for caption bars.
- Exception: an explicitly requested hand-drawn SFX word may be integrated.
```

`styles/manga-ink/tokens.json`:
```json
{ "ink": "#111111", "paper": "#F4F1EA", "accent": "#B02A2A" }
```

`styles/retro-halftone/style-bible.md`:
```markdown
# Ghostwriter house style — retro-halftone (FROZEN)

1960s printed-comic look: bold uniform ink outlines, limited flat spot colour
(three or four inks max), heavy Ben-Day halftone dots as the only shading,
slight mis-registration of the colour plates, warm off-white newsprint paper
with subtle speckle. Simple confident shapes, mid-shots, clear staging.

Tone: wry and punchy for funny stories; eerie stillness for horror — implied
menace, PG-13, no gore.

Characters: fresh cast per episode, bold readable silhouettes, one signature
prop or garment each.

Hard rules for panel art:
- No lettering, speech balloons, caption boxes, or readable signage in the
  image. Those are composited later in code.
- Keep faces and key action inside the central vertical 80%.
- Keep the top ~18% and bottom ~22% visually calm for caption bars.
- Exception: an explicitly requested hand-drawn SFX word may be integrated.
```

`styles/retro-halftone/tokens.json`:
```json
{ "ink": "#1A1A1A", "paper": "#F0E9D8", "accent": "#C24E1E" }
```

- [ ] **Step 4: Write the failing test**

`test/style.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveStyle, listStyleKeys } from "../src/lib/style.ts";

test("resolveStyle returns bible text + tokens for a known style", () => {
  const s = resolveStyle("graphic-novel-noir");
  assert.match(s.bible, /house style/i);
  assert.equal(s.tokens.ink, "#0E0E10");
  assert.equal(s.hasRef, true);
  assert.match(s.refPath, /styles\/graphic-novel-noir\/style-ref\.png$/);
});

test("resolveStyle reports hasRef=false when the ref png is absent", () => {
  const s = resolveStyle("manga-ink");
  assert.equal(s.hasRef, false);
});

test("resolveStyle throws for an unknown style", () => {
  assert.throws(() => resolveStyle("bogus"), /unknown style.*bogus/i);
});

test("listStyleKeys includes the three shipped styles", () => {
  assert.deepEqual(
    listStyleKeys().sort(),
    ["graphic-novel-noir", "manga-ink", "retro-halftone"],
  );
});
```

- [ ] **Step 5: Run the test, verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `../src/lib/style.ts`

- [ ] **Step 6: Implement `src/lib/style.ts`**

```ts
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./env.ts";

export const STYLES_DIR = join(REPO_ROOT, "styles");

export interface StyleTokens { ink: string; paper: string; accent: string }
export interface ResolvedStyle {
  key: string; bible: string; refPath: string; tokens: StyleTokens; hasRef: boolean;
}

export function listStyleKeys(): string[] {
  if (!existsSync(STYLES_DIR)) return [];
  return readdirSync(STYLES_DIR).filter((d) => {
    const p = join(STYLES_DIR, d);
    return statSync(p).isDirectory() && existsSync(join(p, "style-bible.md"));
  });
}

export function resolveStyle(key: string): ResolvedStyle {
  const dir = join(STYLES_DIR, key);
  if (!existsSync(join(dir, "style-bible.md"))) {
    throw new Error(`Unknown style "${key}" — have: ${listStyleKeys().join(", ")}`);
  }
  const refPath = join(dir, "style-ref.png");
  return {
    key,
    bible: readFileSync(join(dir, "style-bible.md"), "utf8"),
    tokens: JSON.parse(readFileSync(join(dir, "tokens.json"), "utf8")) as StyleTokens,
    refPath,
    hasRef: existsSync(refPath),
  };
}
```

- [ ] **Step 7: Delete `config/brand.json`**

```bash
git rm config/brand.json
```

- [ ] **Step 8: Run the test, verify it passes**

Run: `npm test`
Expected: PASS. (Type errors elsewhere are expected until Task 8 — do not fix them here; `npm test` only runs `test/`.)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(engine): styles/<key>/ layout + resolveStyle(); drop config/brand.json"
```

---

## Task 4: Usage logging

**Files:**
- Create: `src/lib/usage.ts`
- Modify: `.gitignore` (add `usage/`)
- Test: `test/usage.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type UsageKind = "image" | "story_tokens" | "post";
  export interface UsageEvent {
    ts: string; tenantId: string; kind: UsageKind; qty: number;
    keyOwner: "platform" | "tenant"; costCents: number; note?: string;
  }
  export function estimateCents(kind: UsageKind, qty: number): number
  export function logUsage(tenantId: string, e: { kind: UsageKind; qty: number; keyOwner: "platform" | "tenant"; note?: string }): void
  export function readUsage(tenantId: string): UsageEvent[]
  ```

- [ ] **Step 1: Write the failing test**

`test/usage.test.ts`:
```ts
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../src/lib/env.ts";
import { estimateCents, logUsage, readUsage } from "../src/lib/usage.ts";

afterEach(() => rmSync(join(REPO_ROOT, "usage", "unit-t.jsonl"), { force: true }));

test("estimateCents: 10 images at ~$0.03 each ≈ 30c", () => {
  assert.equal(estimateCents("image", 10), 30);
});

test("estimateCents: story tokens billed per-1k, rounded up", () => {
  assert.equal(estimateCents("story_tokens", 3200), 1); // <= 1c floor for a short story
});

test("logUsage appends a JSONL line that readUsage parses back", () => {
  logUsage("unit-t", { kind: "image", qty: 8, keyOwner: "platform" });
  logUsage("unit-t", { kind: "post", qty: 2, keyOwner: "platform" });
  const rows = readUsage("unit-t");
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.kind, "image");
  assert.equal(rows[0]!.qty, 8);
  assert.equal(rows[0]!.costCents, 24);
  assert.equal(rows[1]!.kind, "post");
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `../src/lib/usage.ts`

- [ ] **Step 3: Implement `src/lib/usage.ts`**

```ts
import { appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./env.ts";

const USAGE_DIR = join(REPO_ROOT, "usage");

export type UsageKind = "image" | "story_tokens" | "post";
export interface UsageEvent {
  ts: string; tenantId: string; kind: UsageKind; qty: number;
  keyOwner: "platform" | "tenant"; costCents: number; note?: string;
}

// Rough platform-cost estimates (managed tier). Tune against real invoices.
const RATE_CENTS: Record<UsageKind, (qty: number) => number> = {
  image: (q) => Math.ceil(q * 3),          // ~$0.03 / image (gemini-3.1-flash-image)
  story_tokens: (q) => Math.max(1, Math.round(q / 1000 * 0.3)), // ~$0.30 / 1M
  post: () => 0,                            // Zernio is a monthly per-account fee, not per-post
};

export function estimateCents(kind: UsageKind, qty: number): number {
  return RATE_CENTS[kind](qty);
}

export function logUsage(
  tenantId: string,
  e: { kind: UsageKind; qty: number; keyOwner: "platform" | "tenant"; note?: string },
): void {
  mkdirSync(USAGE_DIR, { recursive: true });
  const row: UsageEvent = {
    ts: new Date().toISOString(),
    tenantId, kind: e.kind, qty: e.qty, keyOwner: e.keyOwner,
    costCents: e.keyOwner === "tenant" && e.kind === "image" ? 0 : estimateCents(e.kind, e.qty),
    ...(e.note ? { note: e.note } : {}),
  };
  appendFileSync(join(USAGE_DIR, `${tenantId}.jsonl`), JSON.stringify(row) + "\n");
}

export function readUsage(tenantId: string): UsageEvent[] {
  const p = join(USAGE_DIR, `${tenantId}.jsonl`);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as UsageEvent);
}
```

- [ ] **Step 4: Add `usage/` to `.gitignore`**

Append line: `usage/`

- [ ] **Step 5: Run the test, verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/usage.ts .gitignore test/usage.test.ts
git commit -m "feat(engine): file-based per-tenant usage log + cost estimate"
```

---

## Task 5: `write-story` (Anthropic)

**Files:**
- Modify: `package.json` (add `@anthropic-ai/sdk`)
- Modify: `.env.example` (add `ANTHROPIC_API_KEY`)
- Create: `src/write-story.ts`
- Test: `test/write-story.test.ts`

**Interfaces:**
- Consumes: `Story`, `validateStory` from `src/lib/story.ts`; `resolveStyle` from Task 3
- Produces:
  ```ts
  export interface StoryInput {
    genre: "funny" | "horror";
    niche: string;
    styleKey: string;
    priorTitles: string[];
  }
  export function buildStoryMessages(input: StoryInput): { system: string; user: string }
  export function writeStory(input: StoryInput): Promise<Story>  // validated; retries once
  ```

- [ ] **Step 1: Install the SDK**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Add `ANTHROPIC_API_KEY=` to `.env.example`** with a comment: `# console.anthropic.com → API keys. Required by src/write-story.ts.`

- [ ] **Step 3: Write the failing test** (pure prompt builder only — no network)

`test/write-story.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStoryMessages } from "../src/write-story.ts";

test("buildStoryMessages embeds genre, niche, the style bible, and the JSON schema", () => {
  const { system, user } = buildStoryMessages({
    genre: "horror",
    niche: "night shift workers",
    styleKey: "graphic-novel-noir",
    priorTitles: ["The Vending Machine"],
  });
  assert.match(system, /6[–-]8 panels/);
  assert.match(system, /"bubble_pos"/);
  assert.match(system, /PG-13/i);
  assert.match(user, /night shift workers/);
  assert.match(user, /horror/);
  assert.match(user, /The Vending Machine/);        // avoid repeating a prior title
  assert.match(user, /house style/i);               // style bible is included
});
```

- [ ] **Step 4: Run the test, verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `../src/write-story.ts`

- [ ] **Step 5: Implement `src/write-story.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { loadEnv, requireEnv } from "./lib/env.ts";
import { resolveStyle } from "./lib/style.ts";
import { validateStory, type Story } from "./lib/story.ts";

const MODEL = "claude-sonnet-5";

const SYSTEM = `You write original micro-stories for a swipe-carousel comic and return ONLY a JSON object.

Rules:
- 6–8 panels. Panel 1 hooks (striking image + an unanswered question). The final panel lands the twist (horror) or punchline (funny). One clean arc, no filler.
- Fresh cast, 2–4 characters. Each gets a distinct silhouette and 2–4 visual_tags (garment, prop, hair, build). No recurring characters.
- Original only — do not adapt Reddit posts, creepypasta, or known bits.
- PG-13 and platform-safe: horror = dread/shadow/implication, never gore, wounds, blood, or body horror. No real named people or brands. No hate/slurs. No self-harm or drug how-to. No sexual content.

Return exactly this shape (no markdown fence, no prose):
{
  "date": "YYYY-MM-DD", "slug": "kebab-2-4-words", "genre": "horror|funny",
  "title": "...", "logline": "one sentence, no spoiler",
  "cast": [{ "name": "...", "description": "...", "visual_tags": ["..."] }],
  "panels": [{
    "n": 1, "scene": "what is DRAWN — concrete, visual, NO dialogue text",
    "camera": "wide|mid|close|low angle|over-shoulder|...",
    "characters": ["name"],
    "narration": "<=180 chars or null; at most one per panel, often null",
    "narration_pos": "top|bottom",
    "dialogue": [{ "speaker": "name", "text": "<=60 chars", "bubble_pos": [0.3, 0.4] }],
    "sfx": "optional single word e.g. KRRK, omit if none"
  }],
  "caption": "hook line + 1-2 line tease + soft follow CTA, no spoiler",
  "hashtags": ["6-12 tags, mix broad + niche"]
}
bubble_pos = [x,y] fractions 0..1; keep important bubbles between y 0.18 and 0.78.`;

export interface StoryInput {
  genre: "funny" | "horror";
  niche: string;
  styleKey: string;
  priorTitles: string[];
}

export function buildStoryMessages(input: StoryInput): { system: string; user: string } {
  const style = resolveStyle(input.styleKey);
  const today = new Date().toISOString().slice(0, 10);
  const avoid = input.priorTitles.length
    ? `\n\nDo NOT reuse these recent titles or their premises: ${input.priorTitles.join("; ")}.`
    : "";
  const user =
    `Genre: ${input.genre}\nDate for the "date" field: ${today}\n` +
    `Account niche (every story must fit this): ${input.niche}\n\n` +
    `The art will be drawn in this house style — keep scenes achievable in it:\n\n${style.bible}${avoid}`;
  return { system: SYSTEM, user };
}

export async function writeStory(input: StoryInput): Promise<Story> {
  loadEnv();
  const apiKey = requireEnv("ANTHROPIC_API_KEY", "console.anthropic.com → API keys. Var: ANTHROPIC_API_KEY");
  const client = new Anthropic({ apiKey });
  const { system, user } = buildStoryMessages(input);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await client.messages.create({
      model: MODEL, max_tokens: 4000, system,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    try {
      const json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
      json.styleKey = input.styleKey;
      json.niche = input.niche;
      validateStory(json as Story);
      return json as Story;
    } catch (e) {
      lastErr = e;
      if (attempt === 2) throw new Error(`write-story: invalid story after 2 attempts: ${(e as Error).message}`);
    }
  }
  throw lastErr as Error;
}

// CLI: tsx src/write-story.ts --genre horror --niche "..." --style graphic-novel-noir
if (process.argv[1]?.endsWith("write-story.ts")) {
  const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i === -1 ? undefined : process.argv[i + 1]; };
  const story = await writeStory({
    genre: (arg("genre") as "funny" | "horror") ?? "horror",
    niche: arg("niche") ?? "everyday life with a strange edge",
    styleKey: arg("style") ?? "graphic-novel-noir",
    priorTitles: [],
  });
  process.stdout.write(JSON.stringify(story, null, 2) + "\n");
}
```

- [ ] **Step 6: Add `styleKey?` and `niche?` to the `Story` interface in `src/lib/story.ts`**

In `export interface Story { ... }` add:
```ts
  styleKey?: string;
  niche?: string;
```
(Do not add them to `validateStory` required checks.)

- [ ] **Step 7: Run the test, verify it passes**

Run: `npm test`
Expected: PASS (buildStoryMessages test; `writeStory` itself is covered in Verification with a real key)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .env.example src/write-story.ts src/lib/story.ts test/write-story.test.ts
git commit -m "feat(engine): headless write-story via Anthropic API"
```

---

## Task 6: `gemini.ts` — accept a per-call API key

**Files:**
- Modify: `src/gemini.ts`
- Test: `test/gemini-key.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function generateImage(
    prompt: string, refs?: RefImage[], aspectRatio?: "9:16" | "1:1" | "16:9", apiKey?: string,
  ): Promise<GenResult>
  ```
  (`apiKey` optional; falls back to `GEMINI_API_KEY`.)

- [ ] **Step 1: Write the failing test**

`test/gemini-key.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveGeminiKey } from "../src/gemini.ts";

test("resolveGeminiKey prefers an explicit key over the env var", () => {
  assert.equal(resolveGeminiKey("explicit-123", "env-999"), "explicit-123");
});

test("resolveGeminiKey falls back to the env var", () => {
  assert.equal(resolveGeminiKey(undefined, "env-999"), "env-999");
});

test("resolveGeminiKey throws a key-last message when neither is set", () => {
  assert.throws(() => resolveGeminiKey(undefined, undefined), /GEMINI_API_KEY/);
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test`
Expected: FAIL — `resolveGeminiKey` is not exported

- [ ] **Step 3: Refactor `src/gemini.ts`**

Replace the `getClient()` function and export a pure resolver:
```ts
export function resolveGeminiKey(explicit: string | undefined, env: string | undefined): string {
  const k = (explicit ?? env ?? "").trim();
  if (!k || k.includes("your-")) {
    throw new Error(
      "Missing credential: GEMINI_API_KEY\n" +
      "  Get a key at https://aistudio.google.com/apikey (free tier works).\n" +
      "  Add it to .env, or pass a tenant geminiKey.",
    );
  }
  return k;
}

function getClient(apiKey?: string): GoogleGenAI {
  loadEnv();
  const key = resolveGeminiKey(apiKey, process.env.GEMINI_API_KEY);
  return new GoogleGenAI({ apiKey: key });
}
```
Change `generateImage` signature to `generateImage(prompt, refs = [], aspectRatio = "9:16", apiKey?: string)` and call `getClient(apiKey)` inside (drop the module-level `client` cache — instantiate per call; it's cheap and lets different tenants use different keys).

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/gemini.ts test/gemini-key.test.ts
git commit -m "feat(engine): gemini generateImage() accepts a per-call (tenant) API key"
```

---

## Task 7: `src/engine/art.ts`

**Files:**
- Create: `src/engine/art.ts`
- Modify: `src/gen-art.ts` (becomes a thin wrapper)
- Modify: `src/lib/story.ts` (add `episodeDirFor`)
- Test: `test/art-prompt.test.ts`

**Interfaces:**
- Consumes: `TenantConfig` (Task 1), `resolveStyle` (Task 3), `generateImage` (Task 6), `logUsage` (Task 4), `Story`/`Panel` (`src/lib/story.ts`)
- Produces:
  ```ts
  export function buildPanelPrompt(styleBible: string, story: Story, panel: Panel): string
  export function generateArt(tenant: TenantConfig, episodeDir: string, story: Story): Promise<void>
  // src/lib/story.ts:
  export function episodeDirFor(tenantId: string, date: string, slug: string): string
  ```

- [ ] **Step 1: Add `episodeDirFor` to `src/lib/story.ts`**

```ts
export function episodeDirFor(tenantId: string, date: string, slug: string): string {
  return join(EPISODES_DIR, tenantId, `${date}-${slug}`);
}
```

- [ ] **Step 2: Write the failing test**

`test/art-prompt.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPanelPrompt } from "../src/engine/art.ts";
import type { Story, Panel } from "../src/lib/story.ts";

const story = { title: "T", genre: "horror", panels: [{}, {}] } as unknown as Story;
const panel: Panel = {
  n: 2, scene: "a lift door opens on a dark corridor", camera: "wide",
  characters: ["Mara"], narration: null, dialogue: [], sfx: "DING",
};

test("buildPanelPrompt includes the style bible, scene, camera, SFX, and the no-lettering rule", () => {
  const p = buildPanelPrompt("HOUSE STYLE: ink and halftone", story, panel);
  assert.match(p, /HOUSE STYLE: ink and halftone/);
  assert.match(p, /a lift door opens on a dark corridor/);
  assert.match(p, /camera:\s*wide/i);
  assert.match(p, /DING/);
  assert.match(p, /no.*(speech balloons|lettering|text)/i);
  assert.match(p, /central vertical 80%/);
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `../src/engine/art.ts`

- [ ] **Step 4: Implement `src/engine/art.ts`**

Port the logic from the current `src/gen-art.ts` (`styleHeader`, `ensureStyleRef`, `generateCharacterSheet`, `generatePanels`) into functions that take `(tenant, episodeDir, story)`. Key differences from the CLI version:
- style comes from `resolveStyle(story.styleKey ?? tenant.styleKey)`, not a fixed file
- `ensureStyleRef` writes to `style.refPath` (inside `styles/<key>/`) when `!style.hasRef`
- the Gemini key passed to `generateImage(..., tenant.geminiKey)`
- after each successful image: `logUsage(tenant.id, { kind: "image", qty: 1, keyOwner: tenant.geminiKey ? "tenant" : "platform" })`
- `buildPanelPrompt(styleBible, story, panel)` is the extracted pure prompt builder:

```ts
export function buildPanelPrompt(styleBible: string, story: Story, panel: Panel): string {
  const present = panel.characters.length
    ? `Characters present (match the model sheet exactly): ${panel.characters.join(", ")}.`
    : "No characters in frame.";
  const sfx = panel.sfx
    ? ` Integrate a single hand-drawn comic SFX word "${panel.sfx}" into the illustration.`
    : "";
  return (
    styleBible +
    "\n\nRender in exactly this house style. Comic panel illustration only — " +
    "absolutely no speech balloons, caption boxes, or readable text in the image.\n\n" +
    `PANEL ${panel.n} of ${story.panels.length} — ${story.genre} story "${story.title}".\n` +
    `Scene: ${panel.scene}\nCamera: ${panel.camera}\n${present}\n` +
    "Composition: keep faces and key action within the central vertical 80%. " +
    "Keep the top ~18% and bottom ~22% visually calm (plain wall, sky, floor or shadow) for caption bars." +
    sfx
  );
}
```

- [ ] **Step 5: Rewrite `src/gen-art.ts` as a thin wrapper**

```ts
import { resolveEpisodeDir, loadStory } from "./lib/story.ts";
import { loadLocalTenant } from "./lib/tenant.ts";
import { generateArt } from "./engine/art.ts";

const episodeDir = resolveEpisodeDir(process.argv[2]);
const story = loadStory(episodeDir);
await generateArt(loadLocalTenant(story), episodeDir, story);
```

Add `loadLocalTenant(story)` to `src/lib/tenant.ts` — synthesises a `TenantConfig` for local single-episode dev from `tenants/local.json` if present, else a built-in default (`id: "local"`, `styleKey: story.styleKey ?? "graphic-novel-noir"`, `autonomy: "review_each"`, `publish` from a `tenants/local.json` or empty, `geminiKey: undefined`).

- [ ] **Step 6: Run the test + a typecheck**

Run: `npm test` → PASS
Run: `npx tsc --noEmit` → 0 errors (fix any signature mismatches in `gen-art.ts`/wrappers now)

- [ ] **Step 7: Commit**

```bash
git add src/engine/art.ts src/gen-art.ts src/lib/story.ts src/lib/tenant.ts test/art-prompt.test.ts
git commit -m "feat(engine): extract generateArt(tenant, dir, story); style-aware; usage logged"
```

---

## Task 8: `src/engine/compose.ts` + tenant/style-driven lettering

**Files:**
- Create: `src/engine/compose.ts`
- Modify: `src/lib/letter.ts` (drop `config/brand.json` import; take a `brand` arg)
- Modify: `src/compose.ts` (thin wrapper)
- Test: `test/overlay.test.ts`

**Interfaces:**
- Consumes: `renderOverlaySvg` (modified), `StyleTokens` (Task 3), `TenantConfig` (Task 1)
- Produces:
  ```ts
  // src/lib/letter.ts
  export interface OverlayBrand { displayName: string; handle: string; tokens: StyleTokens }
  export function renderOverlaySvg(panel: Panel, story: Story, brand: OverlayBrand, size: { w: number; h: number }): Promise<string>
  // src/engine/compose.ts
  export function composeEpisode(tenant: TenantConfig, episodeDir: string, story: Story): Promise<void>
  ```

- [ ] **Step 1: Write the failing test**

`test/overlay.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderOverlaySvg } from "../src/lib/letter.ts";
import type { Story, Panel } from "../src/lib/story.ts";

const story = { title: "T", panels: [{}, {}, {}] } as unknown as Story;
const panel: Panel = {
  n: 2, scene: "", camera: "", characters: [],
  narration: "She should not have looked back.", narration_pos: "top",
  dialogue: [{ speaker: "Mara", text: "Hello?", bubble_pos: [0.5, 0.4] }],
};

test("renderOverlaySvg returns an SVG carrying the handle, narration, dialogue, and page counter", async () => {
  const svg = await renderOverlaySvg(
    panel, story,
    { displayName: "NIGHT SHIFT", handle: "@nightshift", tokens: { ink: "#0E0E10", paper: "#EDE7DB", accent: "#7A2E2E" } },
    { w: 1080, h: 1350 },
  );
  assert.match(svg, /^<svg/);
  assert.match(svg, /@nightshift/);
  assert.match(svg, /She should not have looked back/);
  assert.match(svg, /Hello\?/);
  assert.match(svg, /2\/3/);
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test`
Expected: FAIL — `renderOverlaySvg` still imports `../../config/brand.json` (now deleted) → module load error, or arity mismatch.

- [ ] **Step 3: Modify `src/lib/letter.ts`**

- Delete `type Brand = typeof import("../../config/brand.json")` and the `brand` JSON import.
- Add `import type { StyleTokens } from "./style.ts"` and:
  ```ts
  export interface OverlayBrand { displayName: string; handle: string; tokens: StyleTokens }
  ```
- Change `renderOverlaySvg(panel, story, brand: Brand, size)` → `renderOverlaySvg(panel, story, brand: OverlayBrand, size)`.
- Replace hard-coded colours in the piece builders with `brand.tokens`: narration box bg `brand.tokens.ink`, left border `brand.tokens.accent`, bubble bg `brand.tokens.paper` / border `brand.tokens.ink`, speaker label `brand.tokens.accent`, chips bg from `brand.tokens.ink`.
- Header text = `brand.displayName`; watermark text = `brand.handle`; always show header/watermark/counter (drop the `brand.header?.show` conditionals — they're always on now).

- [ ] **Step 4: Implement `src/engine/compose.ts`**

Port `src/compose.ts`'s loop into `composeEpisode(tenant, episodeDir, story)`:
- resolve tokens via `resolveStyle(story.styleKey ?? tenant.styleKey).tokens`
- `brand = { displayName: tenant.displayName, handle: firstHandle(tenant), tokens }` where `firstHandle` = `tenant.publish.instagram?.handle ?? tenant.publish.tiktok?.handle ?? "@" + tenant.id`, prefixed with `@` if missing
- keep the `normalize916` → overlay 9x16 → `crop45` → overlay 4x5 → write flow unchanged
- no `--placeholder` branch in the engine (that stays in the CLI wrapper)

- [ ] **Step 5: Rewrite `src/compose.ts` as a thin wrapper** (keep its existing `--placeholder` offline path; for real panels call `composeEpisode(loadLocalTenant(story), episodeDir, story)`).

- [ ] **Step 6: Run the test + typecheck**

Run: `npm test` → PASS (overlay test + all prior)
Run: `npx tsc --noEmit` → 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/engine/compose.ts src/lib/letter.ts src/compose.ts test/overlay.test.ts
git commit -m "feat(engine): composeEpisode(); lettering colours from style tokens, brand from tenant"
```

---

## Task 9: `src/engine/publish.ts`

**Files:**
- Create: `src/engine/publish.ts`
- Modify: `src/publish.ts` (thin wrapper)
- Test: `test/select-targets.test.ts`

**Interfaces:**
- Consumes: `TenantConfig` (Task 1), `uploadImage`/`createPost` (`src/lib/zernio.ts`), `logUsage` (Task 4)
- Produces:
  ```ts
  export type PublishMode = "draft" | "now";
  export interface PubTarget { platform: "instagram" | "tiktok"; accountId: string; handle: string; format: "4x5" | "9x16" }
  export function selectTargets(tenant: TenantConfig, only?: string | null): PubTarget[]
  export function publishEpisode(tenant: TenantConfig, episodeDir: string, story: Story, mode: PublishMode, only?: string | null): Promise<{ platform: string; handle: string; postId: string }[]>
  ```

- [ ] **Step 1: Write the failing test**

`test/select-targets.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectTargets } from "../src/engine/publish.ts";
import type { TenantConfig } from "../src/lib/tenant.ts";

const t = {
  id: "x", displayName: "X", styleKey: "manga-ink", niche: "y", genres: "both",
  autonomy: "autonomous", cadence: { days: [1], time: "09:00", tz: "UTC" },
  publish: {
    instagram: { accountId: "ig1", handle: "ighandle", format: "4x5" },
    tiktok: { accountId: "tt1", handle: "tthandle", format: "9x16" },
  },
} as TenantConfig;

test("selectTargets returns all configured platforms by default", () => {
  assert.deepEqual(selectTargets(t).map((x) => x.platform).sort(), ["instagram", "tiktok"]);
});

test("selectTargets --only scopes to one platform", () => {
  assert.deepEqual(selectTargets(t, "tiktok").map((x) => x.platform), ["tiktok"]);
});

test("selectTargets throws when --only names an unconfigured platform", () => {
  assert.throws(() => selectTargets(t, "youtube"), /youtube/);
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `../src/engine/publish.ts`

- [ ] **Step 3: Implement `src/engine/publish.ts`**

Port `src/publish.ts`'s core (`jpegPanels`, per-target loop, upload cache by format, `createPost`) into `publishEpisode(...)`. `selectTargets`:
```ts
export function selectTargets(tenant: TenantConfig, only?: string | null): PubTarget[] {
  const all = (["instagram", "tiktok"] as const)
    .filter((p) => tenant.publish[p])
    .map((p) => ({ platform: p, ...tenant.publish[p]! }));
  if (!only) return all;
  const one = all.filter((t) => t.platform === only);
  if (one.length === 0) throw new Error(`Tenant "${tenant.id}" has no "${only}" target configured`);
  return one;
}
```
After each successful `createPost`: `logUsage(tenant.id, { kind: "post", qty: 1, keyOwner: "platform" })`.
`publishEpisode` requires `ZERNIO_API_KEY` (platform-level) via `requireEnv` and writes the `posts` array + status transition into `status.json` when `mode === "now"`.

- [ ] **Step 4: Rewrite `src/publish.ts` as a thin wrapper**

```ts
import { resolveEpisodeDir, loadStory } from "./lib/story.ts";
import { loadLocalTenant } from "./lib/tenant.ts";
import { publishEpisode } from "./engine/publish.ts";
import { loadEnv } from "./lib/env.ts";

loadEnv();
const episodeDir = resolveEpisodeDir(process.argv[2]);
const story = loadStory(episodeDir);
const mode = process.argv.includes("--now") ? "now" : "draft";
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const res = await publishEpisode(loadLocalTenant(story), episodeDir, story, mode, only);
console.log(res);
```

Note: `loadLocalTenant` must read `tenants/local.json` for real publish targets — document that in the wrapper's behaviour and in SKILL.md (Task 11). If `tenants/local.json` is absent and the wrapper is asked to publish, throw a clear "create tenants/local.json with your publish targets" error.

- [ ] **Step 5: Run the test + typecheck**

Run: `npm test` → PASS
Run: `npx tsc --noEmit` → 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/engine/publish.ts src/publish.ts test/select-targets.test.ts
git commit -m "feat(engine): publishEpisode(tenant, ...) with selectTargets()"
```

---

## Task 10: `src/engine/review.ts` + `src/run.ts` orchestrator

**Files:**
- Create: `src/engine/review.ts`
- Create: `src/run.ts`
- Modify: `src/build-review.ts` (thin wrapper)
- Test: `test/run-plan.test.ts`

**Interfaces:**
- Consumes: everything above
- Produces:
  ```ts
  // src/engine/review.ts
  export function writeReviewBundle(episodeDir: string, story: Story): void  // caption.txt + status.json(draft) + review.html
  // src/run.ts
  export interface RunPlanItem { tenantId: string; genre: "funny" | "horror" }
  export function resolveRunPlan(tenants: TenantConfig[], now: Date): RunPlanItem[]
  export function runDueTenants(opts: { tenantId?: string; now?: Date; dry?: boolean; now_publish?: boolean }): Promise<void>
  ```

- [ ] **Step 1: Write the failing test**

`test/run-plan.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRunPlan } from "../src/run.ts";
import type { TenantConfig } from "../src/lib/tenant.ts";

const mk = (over: Partial<TenantConfig>): TenantConfig => ({
  id: "t", displayName: "T", styleKey: "graphic-novel-noir", niche: "n",
  genres: "both", autonomy: "autonomous",
  cadence: { days: [1, 3, 5], time: "09:00", tz: "Asia/Singapore" }, publish: {}, ...over,
});

const mon0930sg = new Date("2026-08-31T01:30:00Z"); // Monday 09:30 SGT

test("resolveRunPlan includes due tenants and picks a genre", () => {
  const plan = resolveRunPlan([mk({ id: "a" })], mon0930sg);
  assert.equal(plan.length, 1);
  assert.equal(plan[0]!.tenantId, "a");
  assert.ok(["funny", "horror"].includes(plan[0]!.genre));
});

test("resolveRunPlan honours a single-genre tenant", () => {
  const plan = resolveRunPlan([mk({ id: "b", genres: "funny" })], mon0930sg);
  assert.equal(plan[0]!.genre, "funny");
});

test("resolveRunPlan skips a tenant not scheduled today", () => {
  const tue = new Date("2026-09-01T01:30:00Z");
  assert.deepEqual(resolveRunPlan([mk({ id: "c" })], tue), []);
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `../src/run.ts`

- [ ] **Step 3: Implement `src/engine/review.ts`**

Port `src/build-review.ts`'s file-writing core (caption.txt, status.json-if-absent, review.html) into `writeReviewBundle(episodeDir, story)`. No behavioural change from the current script beyond taking the dir/story as args.

- [ ] **Step 4: Implement `src/run.ts`**

```ts
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { listTenants, loadTenant, isDue, type TenantConfig } from "./lib/tenant.ts";
import { episodeDirFor, EPISODES_DIR, loadStory, type Story } from "./lib/story.ts";
import { writeStory } from "./write-story.ts";
import { generateArt } from "./engine/art.ts";
import { composeEpisode } from "./engine/compose.ts";
import { writeReviewBundle } from "./engine/review.ts";
import { publishEpisode } from "./engine/publish.ts";
import { localParts } from "./lib/tenant.ts";
import { writeFileSync, mkdirSync } from "node:fs";

export interface RunPlanItem { tenantId: string; genre: "funny" | "horror" }

function lastEpisodeMeta(tenantId: string): { date: string | null; genre: string | null; titles: string[] } {
  const dir = join(EPISODES_DIR, tenantId);
  if (!existsSync(dir)) return { date: null, genre: null, titles: [] };
  const eps = readdirSync(dir).filter((d) => existsSync(join(dir, d, "story.json"))).sort();
  if (eps.length === 0) return { date: null, genre: null, titles: [] };
  const titles = eps.slice(-5).map((d) => loadStory(join(dir, d)).title);
  const latest = loadStory(join(dir, eps[eps.length - 1]!));
  return { date: eps[eps.length - 1]!.slice(0, 10), genre: latest.genre, titles };
}

export function resolveRunPlan(tenants: TenantConfig[], now: Date): RunPlanItem[] {
  const plan: RunPlanItem[] = [];
  for (const t of tenants) {
    const meta = lastEpisodeMeta(t.id);
    if (!isDue(t, now, meta.date)) continue;
    const genre: "funny" | "horror" =
      t.genres !== "both" ? t.genres :
      meta.genre === "horror" ? "funny" : "horror";
    plan.push({ tenantId: t.id, genre });
  }
  return plan;
}

export async function runDueTenants(opts: {
  tenantId?: string; now?: Date; dry?: boolean; now_publish?: boolean;
}): Promise<void> {
  const now = opts.now ?? new Date();
  const tenants = opts.tenantId ? [loadTenant(opts.tenantId)] : listTenants();
  const plan = opts.tenantId
    ? tenants.map((t) => ({ tenantId: t.id, genre: (t.genres !== "both" ? t.genres : "horror") as "funny" | "horror" }))
    : resolveRunPlan(tenants, now);

  for (const item of plan) {
    const t = loadTenant(item.tenantId);
    const meta = lastEpisodeMeta(t.id);
    const story = await writeStory({ genre: item.genre, niche: t.niche, styleKey: t.styleKey, priorTitles: meta.titles });
    const date = localParts(now, t.cadence.tz).date;
    const dir = episodeDirFor(t.id, date, story.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "story.json"), JSON.stringify(story, null, 2) + "\n");
    console.log(`\n[${t.id}] ${story.genre} · ${story.title}  → ${dir}`);

    await generateArt(t, dir, story);
    await composeEpisode(t, dir, story);
    writeReviewBundle(dir, story);

    if (t.autonomy === "autonomous" && !opts.dry) {
      const mode = opts.now_publish ? "now" : "draft";
      const res = await publishEpisode(t, dir, story, mode);
      console.log(`[${t.id}] ${mode}:`, res.map((r) => `${r.platform}=${r.postId}`).join(" "));
    } else {
      console.log(`[${t.id}] ready — autonomy=${t.autonomy}${opts.dry ? " (dry)" : ""}, not published`);
    }
  }
  if (plan.length === 0) console.log("no tenants due");
}

// CLI: tsx src/run.ts [--tenant id] [--dry] [--now]
if (process.argv[1]?.endsWith("run.ts")) {
  const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i === -1 ? undefined : process.argv[i + 1]; };
  await runDueTenants({
    tenantId: arg("tenant"),
    dry: process.argv.includes("--dry"),
    now_publish: process.argv.includes("--now"),
  });
}
```

- [ ] **Step 5: Rewrite `src/build-review.ts` as a thin wrapper** calling `writeReviewBundle(resolveEpisodeDir(process.argv[2]), loadStory(...))`.

- [ ] **Step 6: Run the test + typecheck**

Run: `npm test` → PASS (run-plan tests + all prior)
Run: `npx tsc --noEmit` → 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/engine/review.ts src/run.ts src/build-review.ts test/run-plan.test.ts
git commit -m "feat(engine): run.ts orchestrator — resolveRunPlan + runDueTenants"
```

---

## Task 11: Wire-up, docs, `.gitignore`

**Files:**
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `.claude/skills/ghostwriter/SKILL.md`
- Modify: `package.json` (confirm scripts)
- Create: `tenants/local.json` (gitignored) — documented, not committed

- [ ] **Step 1: Fix `.gitignore` for the new episode path depth**

Replace the `episodes/*/panels/…` lines with:
```
episodes/*/*/panels/
episodes/*/*/character-sheet.png
episodes/*/*/review.html
episodes/*/*/upload/
usage/
tenants/local.json
```
Keep committing `episodes/<tenant>/<ep>/story.json`, `caption.txt`, `status.json`.

- [ ] **Step 2: Document `tenants/local.json`** in `README.md` — the single-tenant local-dev config the `npm run` wrappers use:
```json
{
  "id": "local",
  "displayName": "GHOSTWRITER",
  "styleKey": "graphic-novel-noir",
  "niche": "everyday life with a strange edge",
  "genres": "both",
  "autonomy": "review_each",
  "cadence": { "days": [1,3,5], "time": "09:00", "tz": "Asia/Singapore" },
  "publish": {
    "instagram": { "accountId": "6a911cf277555aae013ed010", "handle": "bennysynthwork", "format": "4x5" },
    "tiktok": { "accountId": "6a94ee1077555aae012c1ca6", "handle": "ebiyasg", "format": "9x16" }
  }
}
```

- [ ] **Step 3: Update `README.md`** — new "Engine (multi-tenant)" section: `tenants/<id>.json`, `styles/<key>/`, `npm run run -- --tenant demo-a --dry`, the cron line (`*/15 * * * * cd /path/to/ghostwriter && npm run run`), and that `ANTHROPIC_API_KEY` is now required.

- [ ] **Step 4: Update `SKILL.md`** — add a short "Engine mode" note: `/ghostwriter` and the `npm run art|compose|review|publish` wrappers still work for one-off local episodes (they use `tenants/local.json`); the scheduled multi-tenant path is `npm run run`.

- [ ] **Step 5: Run the full check**

Run: `npm test` → all green
Run: `npx tsc --noEmit` → 0 errors
Run: `npm run compose the-vending-machine -- --placeholder` → still produces both master sets (regression check on the existing episode; note its path is now `episodes/2026-08-31-the-vending-machine/` at the old depth — move it to `episodes/local/2026-08-31-the-vending-machine/` as part of this step, or delete it if not needed).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(engine): gitignore depth, tenants/local.json docs, README + SKILL engine mode"
```

---

## Verification — Phase 0 (manual, needs live keys)

Prereq: `.env` has `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `ZERNIO_API_KEY`. If `ANTHROPIC_API_KEY` is missing, STOP and ask the user for it — do not proceed.

1. **Unit suite:** `npm test` — all tasks' tests green. `npx tsc --noEmit` — 0 errors.
2. **Single tenant, autonomous, dry:** `npm run run -- --tenant demo-a --dry`
   → `episodes/demo-a/<date>-<slug>/` has `story.json`, `panels/raw/` (8 imgs), `panels/final-4x5/`, `panels/final-9x16/`, `caption.txt`, `review.html`; console says "ready … not published"; **no Zernio post**.
3. **Single tenant, autonomous, real draft:** `npm run run -- --tenant demo-a`
   → same, plus a **draft** post for `@bennysynthwork` in Zernio (verify via `posts_list` / the Zernio dashboard). `status.json` still `draft` (draft mode doesn't flip to posted).
4. **Review-gated tenant:** `npm run run -- --tenant demo-b`
   → `episodes/demo-b/…` generated in `manga-ink`; `status.json` = `draft`; no post made regardless of `--now` absence.
5. **Style difference:** open `episodes/demo-a/**/review.html` and `episodes/demo-b/**/review.html` — visibly different house styles; each internally consistent across its 6–8 panels; `demo-b` panels are B&W manga-ink, `demo-a` is the noir palette.
6. **Style-ref generation:** after step 4, `styles/manga-ink/style-ref.png` now exists (was generated on first use) and is committed.
7. **Usage log:** `usage/demo-a.jsonl` and `usage/demo-b.jsonl` each have ~8 `image` rows + (demo-a) `post` rows; `costCents` present.
8. **Cadence gate:** `npm run run` with no args on a non-Mon/Wed/Fri, non-Tue/Thu/Sat local day → "no tenants due". On a due day → generates; run it **again immediately** → "no tenants due" (episode-today guard holds).
9. **write-story robustness:** `for i in $(seq 20); do npm run story -- --genre $([ $((i%2)) = 0 ] && echo funny || echo horror) --niche "night shift workers" --style graphic-novel-noir | npx tsx -e 'JSON.parse(require("fs").readFileSync(0));'; done` — 20/20 parse and (spot-check 3) pass `validateStory`, panel counts 6–8.
10. **Regression:** the pre-existing `/ghostwriter` flow (`npm run art|compose|review` against a hand-made `story.json` under `episodes/local/…` with `tenants/local.json` present) still produces a valid review bundle.

---

## Self-Review notes (author)

- **Spec coverage:** write-story (Task 5), engine extraction (7–10), tenant config (1–2), style menu + restructure (3), usage log (4), cron runner + autonomy gate + `--dry` (10), verification mirrors spec §"Verification — Phase 0". Deploy/cron line documented in Task 11 (spec calls for "a tiny scheduler" — the cron line is it; a Railway service is Phase 1's Vercel-Cron replacement, out of scope here).
- **Not in this plan (correctly, per spec):** Neon/DB, dashboard, Stripe, Zernio profile creation, per-tenant Gemini BYO *validation* UI (the key is read from tenant JSON and passed through; validation lands in Phase 2), content-safety classifier (flagged in spec open questions — Phase 2+).
- **Type consistency:** `TenantConfig`, `ResolvedStyle`, `StyleTokens`, `UsageEvent`, `OverlayBrand`, `PubTarget`, `RunPlanItem`, `StoryInput` each defined once (Tasks 1/3/4/8/9/10/5) and imported thereafter. `renderOverlaySvg` signature changes exactly once (Task 8) and all callers (`engine/compose.ts`) are updated in the same task.
- **Known ordering caveat:** Tasks 3 and 8 delete `config/brand.json` / `config/style-bible.md`; `src/gen-art.ts` and `src/compose.ts` won't typecheck between Task 3 and Tasks 7–8. `npm test` is unaffected (only runs `test/`). Each of Tasks 7/8 ends with a green `npx tsc --noEmit`; do not run a repo-wide typecheck as a gate in Tasks 3–6.
