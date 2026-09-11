/** Detect whether assistant text is a real draft vs meta/export chatter. */

export function isPromiseOnlyDraft(text: string): boolean {
  const t = text.trim();
  if (t.length < 80) {
    return /\b(moment|shortly|prepare|downloadable|link|upload|cannot|can't|copy and paste)\b/i.test(
      t,
    );
  }
  if (
    /\b(i('ll| will)\s+(prepare|send|create|generate)|send you a downloadable|can't directly upload|cannot directly upload|copy (and|&) paste)\b/i.test(
      t,
    ) &&
    t.length < 900
  ) {
    return true;
  }
  return false;
}

export function isExportInstructionText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /\b(download button|copy the entire text|paste it into (microsoft )?word|document export feature|lexzim interface|use the download|look for a download|generate a word file from the text)\b/i.test(
    t,
  );
}

export function isMetaChatSummary(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isExportInstructionText(t)) return true;
  if (
    /^(i('|')ve|i have)\s+(drafted|prepared|created|written)\b/i.test(t) &&
    t.length < 800 &&
    !/\b(whereas|take notice|plaintiff|hereinafter)\b/i.test(t)
  ) {
    return true;
  }
  if (/formatted in trebuchet|download it below|download below|spacing\)\s*$/im.test(t)) {
    return true;
  }
  if (/^the word file is ready\b/i.test(t) && t.length < 1200) return true;
  return false;
}

function looksLikeLegalInstrument(text: string): boolean {
  return /\b(summons|declaration|particulars of claim|agreement of sale|affidavit|notice of|take notice|plaintiff|defendant|whereas|hereinafter|domicilium|purchaser|seller|witness|heads of argument)\b/i.test(
    text,
  );
}

export function isSubstantialDocumentDraft(text: string): boolean {
  const t = text.trim();
  if (!t || isPromiseOnlyDraft(t) || isMetaChatSummary(t) || isExportInstructionText(t)) {
    return false;
  }
  if (looksLikeLegalInstrument(t) && t.length >= 400) return true;
  if (t.length >= 900) return true;
  if (t.length < 280) return false;
  const paragraphs = t.split(/\n\n+/).filter((p) => p.trim().length > 25);
  const hasStructure =
    /\b(whereas|agreement|clause|party|hereinafter|witness|dear\s|re:|between|summons|declaration|plaintiff)\b/i.test(
      t,
    );
  return paragraphs.length >= 3 || (hasStructure && t.length >= 400);
}
