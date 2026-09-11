/**
 * Smoke: AI attachment extract soft-fail + plain text.
 * Usage: npx tsx --conditions=react-server scripts/smoke-ai-extract.ts
 */
import { extractAttachment } from "@/lib/ai/attachments";

async function main() {
  const plain = await extractAttachment({
    fileName: "note.txt",
    mimeType: "text/plain",
    bytes: Buffer.from("Hello LexZim attachment test. Clause 1. Clause 2."),
  });
  console.log("plain", plain.method, plain.text.slice(0, 80));

  const bad = await extractAttachment({
    fileName: "bad.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: Buffer.from("not-a-zip"),
  });
  console.log("bad docx", bad.method, bad.text.slice(0, 140));

  const empty = await extractAttachment({
    fileName: "empty.pdf",
    mimeType: "application/pdf",
    bytes: Buffer.alloc(0),
  });
  console.log("empty", empty.method, empty.text.slice(0, 100));

  if (plain.method !== "plain") throw new Error("plain failed");
  if (bad.method !== "error" && bad.method !== "docx") {
    throw new Error(`expected soft fail for bad docx, got ${bad.method}`);
  }
  console.log("ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
