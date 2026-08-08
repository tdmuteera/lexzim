/**
 * AI job worker poller (P5-09).
 * Usage:
 *   npx tsx scripts/process-ai-jobs.ts           # one pass
 *   npx tsx scripts/process-ai-jobs.ts --loop    # poll until Ctrl+C
 *   npm run jobs:ai
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const { processNextAiJob, requeueStaleRunningJobs } = await import(
    "@/lib/ai/jobs/process"
  );
  const loop = process.argv.includes("--loop");
  const intervalMs = Number(process.env.AI_JOBS_POLL_MS ?? "5000");

  console.log(`[ai-jobs] starting${loop ? " (loop)" : " (single pass)"}`);
  await requeueStaleRunningJobs(45);

  for (;;) {
    const job = await processNextAiJob();
    if (job) {
      console.log(
        `[ai-jobs] ${job.id} type=${job.jobType} status=${job.status}` +
          (job.errorMessage ? ` error=${job.errorMessage}` : ""),
      );
    } else if (!loop) {
      console.log("[ai-jobs] queue empty");
      break;
    }
    if (!loop) break;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

main().catch((err) => {
  console.error("[ai-jobs] fatal", err);
  process.exit(1);
});
