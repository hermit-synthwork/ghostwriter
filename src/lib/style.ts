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
