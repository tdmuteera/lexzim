import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { resolveProviderApiKey } from "@/lib/ai/secrets";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_EXTS = new Set(["webm", "wav", "mp3", "m4a", "mp4", "ogg", "mpeg", "mpga", "oga"]);

function normalizeMime(mime: string): string {
  return mime.toLowerCase().split(";")[0]!.trim();
}

function extensionFor(file: File): string {
  const name = file.name.toLowerCase();
  const match = name.match(/\.(webm|wav|mp3|m4a|mp4|ogg|mpeg|mpga|oga)$/);
  if (match) return match[1] === "mpeg" || match[1] === "mpga" ? "mp3" : match[1]!;
  const mime = normalizeMime(file.type || "");
  if (mime.includes("webm")) return "webm";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("m4a") || mime.includes("mp4") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

function isAllowedAudio(file: File, ext: string): boolean {
  if (ALLOWED_EXTS.has(ext)) return true;
  const mime = normalizeMime(file.type || "");
  if (!mime) return true; // some mobile browsers omit type
  return (
    mime.startsWith("audio/") ||
    mime === "video/webm" || // occasional Chrome quirk
    mime === "application/octet-stream"
  );
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

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AuthError(
        "validation",
        "Could not read the recording upload. Try a shorter clip.",
      );
    }

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

    const ext = extensionFor(file);
    if (!isAllowedAudio(file, ext)) {
      throw new AuthError(
        "validation",
        "Supported audio types: webm, wav, mp3, m4a, mp4, ogg.",
      );
    }

    const mime = normalizeMime(file.type || "") || `audio/${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const blob = new Blob([bytes], { type: mime });
    const uploadName = file.name?.trim() || `recording.${ext}`;
    const upload = new FormData();
    upload.append("file", blob, uploadName);
    upload.append("model", "whisper-1");
    upload.append("response_format", "json");

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
