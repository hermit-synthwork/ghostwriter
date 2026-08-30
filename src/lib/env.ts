import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Load .env from the repo root if present. No-op if the file is missing. */
export function loadEnv(): void {
  const envPath = ROOT + ".env";
  if (!existsSync(envPath)) return;
  try {
    // Node >= 20.6
    process.loadEnvFile(envPath);
  } catch {
    /* older node without loadEnvFile — rely on real env */
  }
}

/**
 * Return a required env var or exit with a clear, actionable message.
 * Used for credentials the user must supply (key-last workflow).
 */
export function requireEnv(name: string, hint: string): string {
  const v = process.env[name];
  if (v && v.trim() && !v.includes("your-") && !v.includes("xxxx")) return v.trim();
  console.error(
    `\n✗ Missing credential: ${name}\n` +
      `  ${hint}\n` +
      `  Add it to ${ROOT}.env  (copy .env.example if you haven't)\n`,
  );
  process.exit(1);
}

export const REPO_ROOT = ROOT;
