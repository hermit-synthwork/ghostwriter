import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql as raw } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";

process.loadEnvFile?.(new URL("../.env", import.meta.url).pathname);
const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error("DATABASE_URL_TEST is not set — DB tests need the Neon `test` branch");

// DB tests run entirely on the Neon `test` branch. Production code (src/db/client.ts)
// connects via DATABASE_URL, so point that at the test branch for this process only —
// this module is imported before client.ts in every DB test, and process.loadEnvFile
// does not override an already-set var. The .env file is never modified.
process.env.DATABASE_URL = url;

const client = postgres(url, { max: 2, prepare: false });
export const testDb = drizzle(client, { schema });

export async function resetTables(...names: string[]): Promise<void> {
  if (names.length === 0) names = ["run", "usage_event", "episode", "tenant"];
  await testDb.execute(raw.raw(`TRUNCATE TABLE ${names.join(", ")} RESTART IDENTITY CASCADE`));
}
