import "server-only";

import JSZip from "jszip";
import {
  TEMPLATE_MERGE_FIELDS,
  mergeFieldToken,
  type TemplateMergeField,
} from "@/lib/templates/fields";

export type MergeFieldMap = Record<string, string>;

export type MergeResult = {
  buffer: Buffer;
  resolvedFields: string[];
  unresolvedFields: string[];
  /** Tokens still present after merge (unknown or empty left in place). */
  leftoverTokens: string[];
};

const TOKEN_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/**
 * Deterministic {{FIELD}} replacement inside a .docx buffer.
 *
 * Unknown-field behaviour:
 * - Tokens not in the provided values map are left unchanged in the document.
 * - Empty string values replace the token with "" (field cleared).
 * - Replacement runs on word/document.xml and header/footer parts.
 */
export async function mergeDocxTemplate(
  templateBytes: Buffer,
  values: MergeFieldMap,
): Promise<MergeResult> {
  const zip = await JSZip.loadAsync(templateBytes);
  const resolvedFields: string[] = [];
  const unresolvedFields: string[] = [];
  const seen = new Set<string>();

  const normalized: MergeFieldMap = {};
  for (const [key, value] of Object.entries(values)) {
    normalized[key.toUpperCase()] = value ?? "";
  }

  const xmlPaths = Object.keys(zip.files).filter(
    (path) =>
      /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/i.test(path),
  );

  for (const path of xmlPaths) {
    const file = zip.file(path);
    if (!file) continue;
    let xml = await file.async("string");

    xml = xml.replace(TOKEN_RE, (match, rawName: string) => {
      const name = rawName.toUpperCase();
      if (!seen.has(name)) {
        seen.add(name);
        if (Object.prototype.hasOwnProperty.call(normalized, name)) {
          resolvedFields.push(name);
        } else {
          unresolvedFields.push(name);
        }
      }
      if (!Object.prototype.hasOwnProperty.call(normalized, name)) {
        return match;
      }
      return escapeXml(normalized[name] ?? "");
    });

    zip.file(path, xml);
  }

  const out = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  const leftoverTokens: string[] = [];
  for (const path of xmlPaths) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async("string");
    for (const m of xml.matchAll(TOKEN_RE)) {
      const token = m[0];
      if (!leftoverTokens.includes(token)) leftoverTokens.push(token);
    }
  }

  return {
    buffer: Buffer.from(out),
    resolvedFields,
    unresolvedFields,
    leftoverTokens,
  };
}

/**
 * Extract readable plain text from a .docx buffer (for draft preview / AI polish).
 * Formatting is approximate; suitable for review, not round-trip fidelity.
 */
export async function extractPlainTextFromDocx(docxBytes: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(docxBytes);
  const doc = zip.file("word/document.xml");
  if (!doc) return "";
  let xml = await doc.async("string");
  xml = xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeXml(xml)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function emptyMergeFieldMap(): MergeFieldMap {
  const map: MergeFieldMap = {};
  for (const field of TEMPLATE_MERGE_FIELDS) {
    map[field] = "";
  }
  return map;
}

export function applyFieldOverrides(
  base: MergeFieldMap,
  overrides?: Record<string, string> | null,
): MergeFieldMap {
  const next = { ...base };
  if (!overrides) return next;
  for (const [key, value] of Object.entries(overrides)) {
    const upper = key.toUpperCase();
    if (TEMPLATE_MERGE_FIELDS.includes(upper as TemplateMergeField) || key.includes("_")) {
      next[upper] = value ?? "";
    }
  }
  return next;
}

export function previewMergeFields(values: MergeFieldMap) {
  return TEMPLATE_MERGE_FIELDS.map((field) => ({
    field,
    token: mergeFieldToken(field),
    value: values[field] ?? "",
  }));
}
