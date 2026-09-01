import { defineConfig } from "drizzle-kit";

process.loadEnvFile?.(".env");

const url =
  process.env.MIGRATE_TARGET === "test"
    ? process.env.DATABASE_URL_TEST!
    : process.env.DATABASE_URL!;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url },
});
