import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadEnv, requireEnv } from "../lib/env.ts";
import * as schema from "./schema.ts";

loadEnv();
const sql = postgres(requireEnv("DATABASE_URL", "Neon connection string. Var: DATABASE_URL"), {
  max: 4,
  prepare: false, // pooled endpoint
});
export const db = drizzle(sql, { schema });
export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
