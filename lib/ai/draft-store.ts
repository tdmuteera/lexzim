const drafts = new Map<
  string,
  { firmId: string; userId: string; fileName: string; bytes: Buffer; createdAt: number }
>();

const TTL_MS = 30 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [id, row] of drafts) {
    if (now - row.createdAt > TTL_MS) drafts.delete(id);
  }
}

export function putAiDraft(input: {
  firmId: string;
  userId: string;
  fileName: string;
  bytes: Buffer;
}): { id: string; fileName: string } {
  prune();
  const id = crypto.randomUUID();
  drafts.set(id, { ...input, createdAt: Date.now() });
  return { id, fileName: input.fileName };
}

export function getAiDraft(id: string, firmId: string, userId: string) {
  prune();
  const row = drafts.get(id);
  if (!row) return null;
  if (row.firmId !== firmId || row.userId !== userId) return null;
  return row;
}
