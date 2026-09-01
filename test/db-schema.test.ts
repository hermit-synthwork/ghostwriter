import { test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { testDb } from "./db-helpers.ts";

test("all four tables exist on the test branch", async () => {
  const rows = await testDb.execute(sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name`);
  const names = rows.map((r: Record<string, unknown>) => r.table_name);
  for (const t of ["episode", "run", "tenant", "usage_event"]) {
    assert.ok(names.includes(t), `missing table ${t}`);
  }
});

test("episode_status enum has the 7 states", async () => {
  const rows = await testDb.execute(sql`select enum_range(null::episode_status) as r`);
  assert.match(String(rows[0]!.r), /generating.*ready.*approved.*scheduled.*posted.*failed.*rejected/);
});

test("genre + genres enums include wuxia", async () => {
  const rows = await testDb.execute(sql`
    select enum_range(null::genre) as g, enum_range(null::genres) as gs`);
  assert.match(String(rows[0]!.g), /wuxia/);
  assert.match(String(rows[0]!.gs), /wuxia/);
});

test("autonomy enum includes scheduled; tenant has a language column", async () => {
  const rows = await testDb.execute(sql`select enum_range(null::autonomy) as a`);
  assert.match(String(rows[0]!.a), /scheduled/);
  const cols = await testDb.execute(sql`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'tenant' and column_name = 'language'`);
  assert.equal(cols.length, 1);
});
