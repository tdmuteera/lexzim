/**
 * Pull attached-file text out of a conversation so later turns can still use it.
 * Attachments are stored on user messages as:
 *   [Attached files]\n--- name (method) ---\n...text...
 */

const ATTACHED_MARKER = "[Attached files]";

export function extractAttachedFilesBlock(content: string): string {
  const idx = content.indexOf(ATTACHED_MARKER);
  if (idx < 0) return "";
  return content.slice(idx + ATTACHED_MARKER.length).trim();
}

/** Newest attachments first; de-dupe by leading --- file header when present. */
export function loadSessionAttachmentContext(
  rows: Array<{ role: string; content: string }>,
  maxChars = 120_000,
): string {
  const blocks: string[] = [];
  const seen = new Set<string>();

  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.role !== "user") continue;
    const block = extractAttachedFilesBlock(row.content);
    if (!block) continue;
    const key = block.slice(0, 240).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    blocks.push(block);
  }

  if (!blocks.length) return "";
  // Keep chronological order (oldest first) for the model.
  const joined = blocks.reverse().join("\n\n");
  if (joined.length <= maxChars) return joined;
  return `${joined.slice(0, maxChars)}\n\n[…older attachment text truncated…]`;
}

/** Merge a fresh upload with anything already in the thread. Fresh wins for duplicates. */
export function mergeAttachmentContext(
  fresh: string | null | undefined,
  session: string | null | undefined,
  maxChars = 120_000,
): string {
  const a = (fresh ?? "").trim();
  const b = (session ?? "").trim();
  if (a && b) {
    if (b.includes(a.slice(0, Math.min(120, a.length)))) return a.slice(0, maxChars);
    const joined = `${a}\n\n${b}`;
    return joined.slice(0, maxChars);
  }
  return (a || b).slice(0, maxChars);
}
