import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveEpisodeDir, type Status } from "./lib/story.ts";

const episodeDir = resolveEpisodeDir(process.argv[2]);
const statusPath = join(episodeDir, "status.json");
if (!existsSync(statusPath)) {
  console.error(`✗ ${statusPath} not found — run  npm run review  first.`);
  process.exit(1);
}
const status = JSON.parse(readFileSync(statusPath, "utf8")) as Status;
status.status = "approved";
status.approvedAt = new Date().toISOString();
writeFileSync(statusPath, JSON.stringify(status, null, 2) + "\n");

console.log(`✓ ${episodeDir.split("/").pop()} approved.`);
console.log(`  next: npm run publish ${episodeDir.split("/").pop()}`);
