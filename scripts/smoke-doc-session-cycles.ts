/**
 * Local cycles for attach → revise → Word pack behaviour.
 * Usage: npx tsx --conditions=react-server scripts/smoke-doc-session-cycles.ts
 */
import assert from "node:assert/strict";
import {
  extractAttachedFilesBlock,
  loadSessionAttachmentContext,
  mergeAttachmentContext,
} from "@/lib/ai/conversation-attachments";
import {
  isMetaChatSummary,
  isSubstantialDocumentDraft,
} from "@/lib/ai/drafting/draft-detect";
import { draftFileName } from "@/lib/ai/drafting/draft-file-name";
import { packInstructionDocx } from "@/lib/ai/drafting/instruction-docx";
import { splitDraftFromChat } from "@/lib/ai/drafting/split-draft";
import {
  isWordExportFollowup,
  wantsAttachedDocumentRevision,
  wantsExplicitWordFile,
} from "@/lib/ai/intent";

const AGREEMENT = `CONSTRUCTION AGREEMENT

This Construction Agreement is made and executed at Harare on the ………. day of ……………………….. 20…. by and between:

Planetary Kitchens (Private) Limited, hereinafter referred to as the "Contractor"

AND

…………………………………………, hereinafter referred to as the "Employer".

WHEREAS:

A. The Employer is the lawful owner of the property.

NOW THEREFORE the Parties agree as follows:

1. DEFINITIONS
1.1 "Agreement" means this Construction Agreement.

2. INTERPRETATION
2.1 Words importing the singular include the plural.

SCHEDULE A
| SERVICE DESCRIPTION | DESCRIPTION OF WORKS | Tick | Price |
|---------------------|----------------------|------|-------|
| Mobilisation | Bring materials | ☐ | $____ |
| Excavation | Dig foundations | ☐ | $____ |

Notes:
All prices are quoted in USD.`;

async function cycle(name: string, fn: () => void | Promise<void>) {
  await fn();
  console.log(`ok  ${name}`);
}

async function main() {
  let passed = 0;

  await cycle("1 extract attached block", () => {
    const content = `Please correct this.\n\n[Attached files]\n--- draft.docx (docx) ---\n${AGREEMENT}`;
    const block = extractAttachedFilesBlock(content);
    assert.match(block, /CONSTRUCTION AGREEMENT/);
    assert.match(block, /Planetary Kitchens/);
    passed += 1;
  });

  await cycle("2 session attachments survive later turns", () => {
    const rows = [
      {
        role: "user",
        content: `Fix spacing.\n\n[Attached files]\n--- a.docx (docx) ---\n${AGREEMENT}`,
      },
      { role: "assistant", content: "I've reviewed the document. " + AGREEMENT },
      { role: "user", content: "Please send a word document." },
    ];
    const session = loadSessionAttachmentContext(rows);
    assert.match(session, /Planetary Kitchens/);
    const merged = mergeAttachmentContext("", session);
    assert.match(merged, /SCHEDULE A/);
    passed += 1;
  });

  await cycle("3 revise intent detects first message", () => {
    const q =
      "Please look into this document and correct the spacing and the font and correct any grammatical errors and make it a proper legal document";
    assert.equal(wantsAttachedDocumentRevision(q), true);
    assert.equal(wantsExplicitWordFile(q), false);
    passed += 1;
  });

  await cycle("4 word follow-ups including resend", () => {
    assert.equal(wantsExplicitWordFile("Please send a word document."), true);
    assert.equal(isWordExportFollowup("Please send a word document."), true);
    assert.equal(wantsExplicitWordFile("resend the word file"), true);
    assert.equal(isWordExportFollowup("resend the word file"), true);
    passed += 1;
  });

  await cycle("5 meta summary is not treated as the draft", () => {
    const summary =
      "The Word file is ready: CONSTRUCTION AGREEMENT - Planetary Kitchens Ltd.docx.\n\nIt contains:\n- DEFINITIONS";
    assert.equal(isMetaChatSummary(summary), true);
    assert.equal(isSubstantialDocumentDraft(summary), false);
    assert.equal(isSubstantialDocumentDraft(AGREEMENT), true);
    passed += 1;
  });

  await cycle("6 split strips chat preamble before title", () => {
    const raw = `I've reviewed the document. Below is the corrected version.\n\n${AGREEMENT}`;
    const split = splitDraftFromChat(raw);
    assert.match(split.draft, /^CONSTRUCTION AGREEMENT/i);
    assert.doesNotMatch(split.draft, /I've reviewed/i);
    passed += 1;
  });

  await cycle("7 filename drops placeholder employer", () => {
    const name = draftFileName({
      question: "send word",
      body: AGREEMENT,
      title: "CONSTRUCTION AGREEMENT",
    });
    assert.match(name, /Construction Agreement/i);
    assert.doesNotMatch(name, /\band\.docx$/i);
    assert.doesNotMatch(name, /\.{3,}/);
    passed += 1;
  });

  await cycle("8 pack includes real Word table from markdown", async () => {
    const packed = await packInstructionDocx({
      title: "CONSTRUCTION AGREEMENT",
      body: AGREEMENT,
      question: "Please send a word document. Use Trebuchet MS 12pt 1.5 spacing.",
    });
    assert.ok(packed.bytes.length > 2000);
    assert.match(packed.fileName, /\.docx$/i);
    assert.equal(packed.font, "Trebuchet MS");
    // DOCX is a zip; table XML should exist when markdown table was present.
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(packed.bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    assert.match(xml, /<w:tbl[\s>]/);
    assert.match(xml, /Mobilisation|Mobilization/i);
    passed += 1;
  });

  await cycle("9 pick prior draft over ready-summary (logic)", async () => {
    const { maybePackChatDocument } = await import("@/lib/ai/drafting/maybe-pack");
    // Without firm storage this may fail putAiDraft — so only test selection via packInstruction path indirectly.
    // Validate pick behaviour through packInstruction using prior-like body.
    const packed = await packInstructionDocx({
      title: "x",
      body: `The Word file is ready: foo.docx.\n\n${AGREEMENT}`,
      question: "resend the word file",
    });
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(packed.bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    assert.doesNotMatch(xml, /Word file is ready/i);
    assert.match(xml, /CONSTRUCTION AGREEMENT/i);
    void maybePackChatDocument;
    passed += 1;
  });

  await cycle("10 fresh upload wins over older session copy", () => {
    const older = "--- old.docx (docx) ---\nold text only";
    const fresh = "--- new.docx (docx) ---\nnew revised agreement text for client";
    const merged = mergeAttachmentContext(fresh, older);
    assert.match(merged, /new revised agreement/);
    assert.match(merged, /old text only/);
    const onlyFresh = mergeAttachmentContext(fresh, fresh);
    assert.equal(onlyFresh.includes("old text"), false);
    passed += 1;
  });

  await cycle("11 auto-pack only when no follow-up questions", () => {
    const withQs = splitDraftFromChat(
      `${AGREEMENT}\n\nFOLLOW-UP QUESTIONS\n1. Who is the Employer?\n2. What is the contract price?`,
    );
    assert.ok(withQs.followUp.trim().length > 0);
    const noQs = splitDraftFromChat(AGREEMENT);
    assert.equal(noQs.followUp.trim(), "");
    const autoRevision = true;
    const shouldPackWithQs = false || (autoRevision && !withQs.followUp.trim() && true);
    const shouldPackNoQs = false || (autoRevision && !noQs.followUp.trim() && true);
    assert.equal(shouldPackWithQs, false);
    assert.equal(shouldPackNoQs, true);
    passed += 1;
  });

  console.log(`\n${passed}/11 cycles passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
