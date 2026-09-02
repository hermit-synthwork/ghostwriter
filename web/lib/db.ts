import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy singleton: don't touch DATABASE_URL at module load (keeps `next build`
// working without the var). Reuse the pool across dev hot-reloads and warm
// serverless invocations.
const g = globalThis as unknown as {
  _sql?: ReturnType<typeof postgres>;
  _db?: ReturnType<typeof drizzle<typeof schema>>;
};

function getDb() {
  if (!g._db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (Vercel project env / web/.env.local)");
    g._sql ??= postgres(url, { max: 4, prepare: false });
    g._db = drizzle(g._sql, { schema });
  }
  return g._db;
}

export const db: ReturnType<typeof drizzle<typeof schema>> = new Proxy({} as never, {
  get: (_t, prop) => {
    const d = getDb() as object;
    const v = Reflect.get(d, prop);
    return typeof v === "function" ? v.bind(d) : v;
  },
});

export * from "./schema";
