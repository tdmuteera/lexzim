import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { resolveProviderApiKey } from "@/lib/ai/secrets";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "audio/webm",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
]);

function extensionFor(file: File): string {
  const name = file.name.toLowerCase();
  const match = name.match(/\.(webm|wav|mp3|m4a|mp4|ogg|mpeg)$/);
  if (match) return match[1] === "mpeg" ? "mp3" : match[1];
  const mime = (file.type || "").toLowerCase();
  if (mime.includes("webm")) return "webm";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("m4a") || mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

/** Speech-to-text via OpenAI Whisper. Requires ai.use + OpenAI key. */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("ai.use");
    const firmId = tenantFirmId(session);

    const resolved = await resolveProviderApiKey(firmId, "openai");
    if (!resolved.key) {
      throw new AuthError(
        "validation",
        "Transcription needs an OpenAI API key (Settings → AI or server OPENAI_API_KEY).",
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AuthError("validation", "Attach an audio file as `file`.");
    }
    if (file.size <= 0) {
      throw new AuthError("validation", "Audio file is empty.");
    }
    if (file.size > MAX_BYTES) {
      throw new AuthError("validation", "Audio file must be 25 MB or smaller.");
    }

    const mime = (file.type || "").toLowerCase();
    const ext = extensionFor(file);
    if (mime && !ALLOWED_TYPES.has(mime) && !["webm", "wav", "mp3", "m4a", "mp4", "ogg"].includes(ext)) {
      throw new AuthError(
        "validation",
        "Supported audio types: webm, wav, mp3, m4a.",
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const blob = new Blob([bytes], { type: mime || `audio/${ext}` });
    const upload = new FormData();
    upload.append("file", blob, file.name?.trim() || `recording.${ext}`);
    upload.append("model", "whisper-1");

    const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolved.key}`,
      },
      body: upload,
    });

    const raw = await upstream.text();
    let parsed: { text?: string; error?: { message?: string } } = {};
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      /* non-JSON error body */
    }

    if (!upstream.ok) {
      const detail =
        parsed.error?.message?.trim() ||
        (upstream.status === 401
          ? "OpenAI rejected the API key."
          : "OpenAI transcription failed.");
      throw new AuthError("validation", detail);
    }

    const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
    if (!text) {
      throw new AuthError("validation", "No speech detected in that recording.");
    }

    return jsonOk({ text, model: "whisper-1" });
  } catch (err) {
    return jsonError(err, request);
  }
}
