import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPostBody, tiktokTitle, type PostSpec } from "../src/lib/zernio.ts";

const base: PostSpec = {
  content: "一曲十年，只为等一个仇人上门。\n\n#江湖 #武侠 #古风",
  mediaUrls: ["https://m/a.jpg", "https://m/b.jpg"],
  platform: "instagram",
  accountId: "ig1",
  mode: "now",
};

test("tiktokTitle takes the caption's first line, strips hashtags, caps at 90", () => {
  assert.equal(tiktokTitle(base.content), "一曲十年，只为等一个仇人上门。");
  assert.equal(tiktokTitle("x ".repeat(100) + "\n\n#tag").length, 90);
});

test("instagram body uses the full caption+hashtags as content, no tiktokSettings", () => {
  const b = buildPostBody(base);
  assert.equal(b.content, base.content);
  assert.equal(b.tiktokSettings, undefined);
  assert.equal(b.publishNow, true);
  assert.deepEqual((b.platforms as unknown[])[0], { platform: "instagram", accountId: "ig1" });
});

test("tiktok body splits title vs description and always sets Creator-Inbox tiktokSettings", () => {
  const b = buildPostBody({ ...base, platform: "tiktok", accountId: "tt1" });
  assert.equal(b.content, "一曲十年，只为等一个仇人上门。"); // short title
  const s = b.tiktokSettings as Record<string, unknown>;
  assert.equal(s.draft, true);
  assert.equal(s.media_type, "photo");
  assert.equal(s.privacy_level, "PUBLIC_TO_EVERYONE");
  assert.equal(s.content_preview_confirmed, true);
  assert.equal(s.express_consent_given, true);
  assert.equal(s.description, base.content); // full caption + hashtags
});

test("schedule mode still carries scheduledFor + timezone (and needs them)", () => {
  const b = buildPostBody({ ...base, mode: "schedule", scheduledFor: "2026-09-03T09:00:00", timezone: "Asia/Singapore" });
  assert.equal(b.scheduledFor, "2026-09-03T09:00:00");
  assert.equal(b.timezone, "Asia/Singapore");
  assert.equal(b.publishNow, undefined);
  assert.throws(() => buildPostBody({ ...base, mode: "schedule" }), /needs scheduledFor \+ timezone/);
});

test("draft mode sets isDraft", () => {
  assert.equal(buildPostBody({ ...base, mode: "draft" }).isDraft, true);
});
