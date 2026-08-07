import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const password = encodeURIComponent("Lexizim@2075");
const ref = "ojaqzspijvavwbflddxv";
const clusters = ["aws-0", "aws-1", "aws-2"];
const regions = [
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "us-east-1",
  "us-east-2",
  "ap-southeast-1",
];

async function tryUrl(label: string, url: string) {
  const sql = postgres(url, { ssl: "require", prepare: false, connect_timeout: 8, max: 1 });
  try {
    const r = await sql`select current_database() as db`;
    console.log("SUCCESS", label);
    console.log("SAFE_URL", url.replace(password, "***"));
    await sql.end({ timeout: 2 });
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log("fail", label, msg.split("\n")[0]);
    try {
      await sql.end({ timeout: 2 });
    } catch {
      /* ignore */
    }
    return false;
  }
}

async function main() {
  for (const cluster of clusters) {
    for (const region of regions) {
      for (const port of [6543, 5432]) {
        const host = `${cluster}-${region}.pooler.supabase.com`;
        const url = `postgresql://postgres.${ref}:${password}@${host}:${port}/postgres`;
        const ok = await tryUrl(`${host}:${port}`, url);
        if (ok) process.exit(0);
      }
    }
  }
  console.log("No working connection found — copy pooler URI from Supabase Connect modal");
  process.exit(1);
}

main();
