import { AuthError } from "@/lib/auth/types";

const MIN_PASSWORD_LENGTH = 10;

export function validatePassword(password: string): void {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(
      "weak_password",
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AuthError("invalid_email", "Enter a valid email address.");
  }
  return normalized;
}

/** Firm slug from display name; uniqueness enforced by caller. */
export function slugifyFirmName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "firm";
}
