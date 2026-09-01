import { publishApproved } from "./engine/publish.ts";
import { closeDb } from "./db/client.ts";

// CLI: tsx src/publish-approved.ts
// The VPS cron runs this on a short interval so episodes approved in the review
// app go live within minutes, without the review app needing any Zernio keys.
if (process.argv[1]?.endsWith("publish-approved.ts")) {
  try {
    const ids = await publishApproved();
    console.log(ids.length ? `published ${ids.length}` : "nothing approved");
  } catch (err) {
    console.error("\n✗ " + (err as Error).message + "\n");
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
