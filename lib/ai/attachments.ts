import "server-only";

import JSZip from "jszip";

export type ExtractMethod =
  | "plain"
  | "docx"
  | "pdf"
  | "ocr"
  | "unsupported"
  | "error";

export type ExtractedAttachment = {
  fileName: string;
  mimeType: string;
  method: ExtractMethod;
  text: string;
};

/** Soft caps: allow many uploads while protecting memory and model context. */
export const ATTACH_MAX_FILES = 30;
export const ATTACH_MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file
export const ATTACH_TEXT_PER_FILE = 200_000;
export const ATTACH_CONTEXT_FOR_MODEL = 120_000;
export const ATTACH_CONTEXT_FOR_STORE = 100_000;

const PDF_OCR_MAX_PAGES = 12;
const PDF_OCR_MIN_TEXT = 120;

function decodeXmlEntities(xml: string): string {
  return xml
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      const code = Number.parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    });
}

function decodeXmlText(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\b[^/]*\/>/g, "\t")
      .replace(/<w:br\b[^/]*\/>/g, "\n")
      .replace(/<w:p[^>]*>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractDocx(buffer: Buffer): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error("This Word file could not be opened (corrupt or not a .docx).");
  }

  const parts = [
    "word/document.xml",
    "word/header1.xml",
    "word/header2.xml",
    "word/header3.xml",
    "word/footer1.xml",
    "word/footer2.xml",
    "word/footer3.xml",
    "word/footnotes.xml",
    "word/endnotes.xml",
  ];

  const chunks: string[] = [];
  for (const path of parts) {
    const file = zip.file(path);
    if (!file) continue;
    try {
      const xml = await file.async("string");
      const text = decodeXmlText(xml);
      if (text) chunks.push(text);
    } catch {
      /* skip bad part */
    }
  }

  return chunks.join("\n\n").trim();
}

/** Legacy heuristic if PDF.js text extraction fails. */
function extractPdfTextLayerHeuristic(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const chunks: string[] = [];
  const re = /\((?:\\.|[^\\)]){2,}\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const inner = match[0]
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
    if (/[A-Za-z]{3,}/.test(inner)) chunks.push(inner);
  }
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function extractEmbeddedRasterImages(buffer: Buffer): Buffer[] {
  const out: Buffer[] = [];
  const pushSlice = (start: number, end: number) => {
    const slice = buffer.subarray(start, end);
    if (slice.length > 4_000) out.push(Buffer.from(slice));
  };

  // JPEG SOI…EOI
  let i = 0;
  while (i < buffer.length - 3 && out.length < PDF_OCR_MAX_PAGES) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd8 && buffer[i + 2] === 0xff) {
      let j = i + 3;
      while (j < buffer.length - 1) {
        if (buffer[j] === 0xff && buffer[j + 1] === 0xd9) {
          pushSlice(i, j + 2);
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

  // PNG signature…IEND
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const iend = Buffer.from("IEND");
  let p = 0;
  while (p < buffer.length - 8 && out.length < PDF_OCR_MAX_PAGES) {
    const at = buffer.indexOf(pngSig, p);
    if (at < 0) break;
    const endMarker = buffer.indexOf(iend, at + 8);
    if (endMarker < 0) break;
    const end = endMarker + 8; // IEND + CRC
    pushSlice(at, Math.min(end, buffer.length));
    p = end;
  }

  return out;
}

type OcrWorker = {
  recognize: (image: Buffer | Uint8Array) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<void>;
  setParameters?: (params: Record<string, string>) => Promise<void>;
};

async function createOcrWorker(): Promise<OcrWorker> {
  const { createWorker } = await import("tesseract.js");
  const worker = (await createWorker("eng")) as unknown as OcrWorker;
  try {
    await worker.setParameters?.({
      tessedit_pageseg_mode: "1",
      preserve_interword_spaces: "1",
    });
  } catch {
    /* older worker API */
  }
  return worker;
}

async function ocrWithWorker(worker: OcrWorker, buffer: Buffer): Promise<string> {
  const result = await worker.recognize(buffer);
  return (result.data.text ?? "").trim();
}

async function ocrImage(buffer: Buffer): Promise<string> {
  const worker = await createOcrWorker();
  try {
    return await ocrWithWorker(worker, buffer);
  } finally {
    await worker.terminate();
  }
}

async function ocrManyImages(images: Buffer[]): Promise<string> {
  if (!images.length) return "";
  const worker = await createOcrWorker();
  try {
    const parts: string[] = [];
    for (let i = 0; i < images.length; i += 1) {
      try {
        const text = await ocrWithWorker(worker, images[i]!);
        if (text) parts.push(`--- Page image ${i + 1} ---\n${text}`);
      } catch {
        /* skip bad page */
      }
    }
    return parts.join("\n\n").trim();
  } finally {
    await worker.terminate();
  }
}

async function extractPdfWithUnpdf(buffer: Buffer): Promise<{
  text: string;
  pageCount: number;
}> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const result = await extractText(pdf, { mergePages: true });
  const text = Array.isArray(result.text)
    ? result.text.join("\n\n")
    : String(result.text ?? "");
  return {
    text: text.replace(/\u0000/g, "").replace(/\n{3,}/g, "\n\n").trim(),
    pageCount: Number(result.totalPages) || 0,
  };
}

async function extractPdfImagesForOcr(buffer: Buffer): Promise<Buffer[]> {
  try {
    const { extractImages, getDocumentProxy } = await import("unpdf");
    const sharpMod = await import("sharp");
    const sharp = sharpMod.default;
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const pageCount = Math.min(Number(pdf.numPages) || 0, PDF_OCR_MAX_PAGES);
    const images: Buffer[] = [];
    for (let page = 1; page <= pageCount; page += 1) {
      try {
        const pageImages = await extractImages(pdf, page);
        for (const img of pageImages ?? []) {
          const data = img?.data;
          const width = Number(img?.width) || 0;
          const height = Number(img?.height) || 0;
          const channels = Number(img?.channels) || 0;
          if (!data || width < 40 || height < 40 || ![1, 3, 4].includes(channels)) {
            continue;
          }
          try {
            const png = await sharp(Buffer.from(data), {
              raw: {
                width,
                height,
                channels: channels as 1 | 3 | 4,
              },
            })
              .png()
              .toBuffer();
            if (png.length > 2_000) images.push(png);
          } catch {
            /* skip undecodable image */
          }
          if (images.length >= PDF_OCR_MAX_PAGES) return images;
        }
      } catch {
        /* page may have no extractable images */
      }
    }
    return images;
  } catch {
    return [];
  }
}

async function extractPdf(buffer: Buffer): Promise<{ method: ExtractMethod; text: string }> {
  let layer = "";
  try {
    const parsed = await extractPdfWithUnpdf(buffer);
    layer = parsed.text;
  } catch {
    layer = extractPdfTextLayerHeuristic(buffer);
  }

  if (layer.length >= PDF_OCR_MIN_TEXT) {
    return { method: "pdf", text: layer };
  }

  let ocrText = "";
  const fromPdfJs = await extractPdfImagesForOcr(buffer);
  if (fromPdfJs.length) {
    ocrText = await ocrManyImages(fromPdfJs.slice(0, PDF_OCR_MAX_PAGES));
  }
  if (!ocrText) {
    const embedded = extractEmbeddedRasterImages(buffer).slice(0, PDF_OCR_MAX_PAGES);
    if (embedded.length) ocrText = await ocrManyImages(embedded);
  }

  const text = [layer, ocrText].filter(Boolean).join("\n\n").trim();
  if (text) {
    return { method: ocrText ? "ocr" : "pdf", text };
  }

  return {
    method: "pdf",
    text:
      "(This PDF has little selectable text and OCR could not read page images. " +
      "Try attaching clearer PNG or JPG page photos, or a text-based PDF.)",
  };
}

function clip(text: string, max = ATTACH_TEXT_PER_FILE): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[…truncated for length…]`;
}

export async function extractAttachment(input: {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<ExtractedAttachment> {
  const name = input.fileName || "attachment";
  const mime = (input.mimeType || "").toLowerCase();
  const lower = name.toLowerCase();

  try {
    if (!input.bytes?.length) {
      return {
        fileName: name,
        mimeType: mime || "application/octet-stream",
        method: "error",
        text: `(File ${name} arrived empty. Re-attach and try again.)`,
      };
    }

    if (mime.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".csv")) {
      return {
        fileName: name,
        mimeType: mime || "text/plain",
        method: "plain",
        text: clip(input.bytes.toString("utf8")),
      };
    }

    if (lower.endsWith(".doc") && !lower.endsWith(".docx")) {
      return {
        fileName: name,
        mimeType: mime,
        method: "unsupported",
        text: `(${name} is a legacy .doc file. Save as .docx or PDF and attach again.)`,
      };
    }

    if (mime.includes("wordprocessingml") || lower.endsWith(".docx")) {
      const text = await extractDocx(input.bytes);
      return {
        fileName: name,
        mimeType: mime || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        method: "docx",
        text: clip(text || `(No readable text found in ${name}.)`),
      };
    }

    if (mime === "application/pdf" || lower.endsWith(".pdf")) {
      const result = await extractPdf(input.bytes);
      return {
        fileName: name,
        mimeType: mime || "application/pdf",
        method: result.method,
        text: clip(result.text),
      };
    }

    if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(lower)) {
      try {
        const text = await ocrImage(input.bytes);
        return {
          fileName: name,
          mimeType: mime || "image/*",
          method: "ocr",
          text: clip(text || "(OCR found no readable text on this image.)"),
        };
      } catch (err) {
        return {
          fileName: name,
          mimeType: mime,
          method: "ocr",
          text: `OCR failed for ${name}: ${err instanceof Error ? err.message : "unknown error"}`,
        };
      }
    }

    return {
      fileName: name,
      mimeType: mime,
      method: "unsupported",
      text: `(Could not extract text from ${name}. Use PDF, DOCX, TXT, or a clear image.)`,
    };
  } catch (err) {
    return {
      fileName: name,
      mimeType: mime,
      method: "error",
      text: `(Could not read ${name}: ${err instanceof Error ? err.message : "unknown error"})`,
    };
  }
}

export function formatAttachmentContext(files: ExtractedAttachment[]): string {
  if (!files.length) return "";
  const joined = files
    .map((f) => `--- File: ${f.fileName} (${f.method}) ---\n${f.text || "(empty)"}`)
    .join("\n\n");
  return clip(joined, ATTACH_CONTEXT_FOR_MODEL);
}
