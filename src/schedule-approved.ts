import { scheduleApproved } from "./engine/publish.ts";
import { closeDb } from "./db/client.ts";

// CLI: tsx src/schedule-approved.ts
// The VPS cron runs this on a short interval. Each episode approved in the review
// app is handed to Zernio as a scheduled post for the tenant's cadence.time — no
// Zernio keys needed in the review app itself.
if (process.argv[1]?.endsWith("schedule-approved.ts")) {
  try {
    const ids = await scheduleApproved();
    console.log(ids.length ? `scheduled ${ids.length}` : "nothing approved");
  } catch (err) {
    console.error("\n✗ " + (err as Error).message + "\n");
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
