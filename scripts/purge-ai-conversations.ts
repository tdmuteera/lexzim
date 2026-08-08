/**
 * Purge AI conversations older than retention window (P5-12).
 *
 *   npm run privacy:purge-ai
 *   npm run privacy:purge-ai -- --firm=<uuid>
 *   npm run privacy:purge-ai -- --days=60 --dry-run
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function main() {
  const firmId = arg("firm");
  const daysRaw = arg("days");
  const dryRun = process.argv.includes("--dry-run");
  const olderThanDays = daysRaw ? Number(daysRaw) : undefined;

  const {
    countExpiringAiConversations,
    purgeOldAiConversations,
  } = await import("@/lib/privacy/ai-retention");

  if (dryRun) {
    const r = await countExpiringAiConversations({
      firmId,
      olderThanDays,
    });
    console.log(
      `[privacy:purge-ai] dry-run firm=${firmId ?? "ALL"} days=${r.olderThanDays} wouldDelete=${r.count}`,
    );
    return;
  }

  const r = await purgeOldAiConversations({ firmId, olderThanDays });
  console.log(
    `[privacy:purge-ai] firm=${r.firmId ?? "ALL"} days=${r.olderThanDays} deleted=${r.deleted}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
