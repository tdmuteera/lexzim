/**
 * Pack AI draft text into a .docx using the same packer as the chatbot.
 * Usage: npx tsx scripts/pack-ai-docx.ts <payload.json>
 * payload: { question, body, out }
 */
import fs from "node:fs";
import { packInstructionDocx } from "../lib/ai/drafting/instruction-docx";

async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    console.error("usage: tsx scripts/pack-ai-docx.ts payload.json");
    process.exit(1);
  }
  const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8")) as {
    question: string;
    body: string;
    title?: string;
    out: string;
  };
  const packed = await packInstructionDocx({
    title: payload.title || "Legal document",
    body: payload.body,
    question: payload.question,
  });
  fs.writeFileSync(payload.out, packed.bytes);
  fs.writeFileSync(
    payload.out.replace(/\.docx$/i, ".meta.json"),
    JSON.stringify(
      {
        fileName: packed.fileName,
        font: packed.font,
        lineSpacing: packed.lineSpacing,
        plainText: packed.plainText,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(JSON.stringify({ fileName: packed.fileName, out: payload.out }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
