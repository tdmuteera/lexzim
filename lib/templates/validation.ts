import { AuthError } from "@/lib/auth/types";
import { AREA_OF_LAW_OPTIONS, type AreaOfLaw } from "@/lib/db/mvp-types";

export type TemplateMetaInput = {
  title: string;
  areaOfLaw: string;
  description?: string | null;
  isActive?: boolean;
};

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function requireString(value: unknown, label: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) throw new AuthError("validation", `${label} is required.`);
  return trimmed;
}

export function parseTemplateMetaInput(body: unknown): TemplateMetaInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid template payload.");
  }
  const raw = body as Record<string, unknown>;
  const areaOfLaw = requireString(raw.areaOfLaw, "Area of law");
  if (!AREA_OF_LAW_OPTIONS.includes(areaOfLaw as AreaOfLaw)) {
    throw new AuthError("validation", "Invalid area of law.");
  }

  return {
    title: requireString(raw.title, "Title"),
    areaOfLaw,
    description: trimOrNull(raw.description),
    isActive: typeof raw.isActive === "boolean" ? raw.isActive : undefined,
  };
}
