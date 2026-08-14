import "server-only";

import JSZip from "jszip";

export type ExtractedAttachment = {
  fileName: string;
  mimeType: string;
  method: "plain" | "docx" | "pdf" | "ocr" | "unsupported";
  text: string;
};

function decodeXmlText(xml: string): string {
  return xml
    .replace(/<w:p[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return "";
  return decodeXmlText(xml);
}

function extractPdfTextLayer(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const chunks: string[] = [];
  const re = /\((?:\\.|[^\\)]){2,}\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const inner = match[0].slice(1, -1).replace(/\\n/g, "\n").replace(/\\\)/g, ")");
    if (/[A-Za-z]{3,}/.test(inner)) chunks.push(inner);
  }
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function extractEmbeddedJpegs(buffer: Buffer): Buffer[] {
  const out: Buffer[] = [];
  let i = 0;
  while (i < buffer.length - 3 && out.length < 6) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd8 && buffer[i + 2] === 0xff) {
      let j = i + 3;
      while (j < buffer.length - 1) {
        if (buffer[j] === 0xff && buffer[j + 1] === 0xd9) {
          const slice = buffer.subarray(i, j + 2);
          if (slice.length > 8_000) out.push(Buffer.from(slice));
          i = j + 2;
          break;
        }
        j += 1;
      }
      if (j >= buffer.length - 1) break;
    } else {
      i += 1;
    }
  }
  return out;
}

async function ocrImage(buffer: Buffer): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(buffer);
    return (result.data.text ?? "").trim();
  } finally {
    await worker.terminate();
  }
}

async function ocrPdfScans(buffer: Buffer): Promise<string> {
  const images = extractEmbeddedJpegs(buffer);
  if (!images.length) return "";
  const parts: string[] = [];
  for (let i = 0; i < images.length; i += 1) {
    try {
      const text = await ocrImage(images[i]!);
      if (text) parts.push(`--- Page image ${i + 1} ---\n${text}`);
    } catch {
      /* skip a bad page */
    }
  }
  return parts.join("\n\n").trim();
}

export async function extractAttachment(input: {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<ExtractedAttachment> {
  const name = input.fileName || "attachment";
  const mime = (input.mimeType || "").toLowerCase();
  const lower = name.toLowerCase();

  if (mime.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".md")) {
    return {
      fileName: name,
      mimeType: mime || "text/plain",
      method: "plain",
      text: input.bytes.toString("utf8").slice(0, 80_000),
    };
  }

  if (
    mime.includes("wordprocessingml") ||
    lower.endsWith(".docx")
  ) {
    const text = await extractDocx(input.bytes);
    return { fileName: name, mimeType: mime, method: "docx", text: text.slice(0, 80_000) };
  }

  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    const layer = extractPdfTextLayer(input.bytes);
    const scanned = layer.length < 80 ? await ocrPdfScans(input.bytes) : "";
    const text = [layer, scanned].filter(Boolean).join("\n\n");
    return {
      fileName: name,
      mimeType: mime || "application/pdf",
      method: scanned ? "ocr" : "pdf",
      text: text
        ? text.slice(0, 80_000)
        : "(This PDF has little selectable text and no embedded page images for OCR. Attach page photos as PNG or JPG as well.)",
    };
  }

  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(lower)) {
    try {
      const text = await ocrImage(input.bytes);
      return {
        fileName: name,
        mimeType: mime,
        method: "ocr",
        text: text || "(OCR found no readable text on this image.)",
      };
    } catch (err) {
      return {
        fileName: name,
        mimeType: mime,
        method: "ocr",
        text: `OCR failed: ${err instanceof Error ? err.message : "unknown error"}`,
      };
    }
  }

  return {
    fileName: name,
    mimeType: mime,
    method: "unsupported",
    text: `(Could not extract text from ${name}.)`,
  };
}

export function formatAttachmentContext(files: ExtractedAttachment[]): string {
  if (!files.length) return "";
  return files
    .map(
      (f) =>
        `--- File: ${f.fileName} (${f.method}) ---\n${f.text || "(empty)"}`,
    )
    .join("\n\n");
}
