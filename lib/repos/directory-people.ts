/**
 * Practice directory people: lawyers (or other staff) without LexZim login.
 * Same `users` row space as login accounts so responsibleLawyerId FKs stay simple.
 */
import "server-only";

import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { normalizeEmail, validateEmail } from "@/lib/auth/password";
import { getDb } from "@/lib/db";
import { firms, roles, users } from "@/lib/db/schema";

const DIRECTORY_ROLE = "junior_associate";

export type CreateDirectoryPersonInput = {
  fullName: string;
  /** Optional contact email. If omitted, a unique placeholder is stored. */
  email?: string | null;
  jobTitle?: string | null;
  /** Defaults to true for the “add lawyer” flows. */
  isLawyer?: boolean;
};

function syntheticDirectoryEmail(firmSlug: string, id: string): string {
  const slug = (firmSlug || "firm").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "firm";
  return `directory.${id.replace(/-/g, "").slice(0, 12)}@${slug}.lexzim.local`;
}

export async function createDirectoryPerson(
  firmId: string,
  input: CreateDirectoryPersonInput,
) {
  const fullName = input.fullName.trim();
  if (!fullName) throw new AuthError("validation", "Full name is required.");

  const db = getDb();
  const firmRows = await db
    .select({ slug: firms.slug })
    .from(firms)
    .where(eq(firms.id, firmId))
    .limit(1);
  const firmSlug = firmRows[0]?.slug ?? "firm";

  const roleRows = await db
    .select()
    .from(roles)
    .where(eq(roles.code, DIRECTORY_ROLE))
    .limit(1);
  const role = roleRows[0];
  if (!role) {
    throw new AuthError("validation", "Default staff role is missing. Seed RBAC.");
  }

  const id = randomUUID();
  let email: string;
  if (input.email?.trim()) {
    email = validateEmail(input.email);
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing[0]) {
      throw new AuthError("validation", "A person with this email already exists.");
    }
  } else {
    email = normalizeEmail(syntheticDirectoryEmail(firmSlug, id));
  }

  const isLawyer = input.isLawyer !== false;
  const jobTitle =
    input.jobTitle?.trim() ||
    (isLawyer ? "Lawyer" : null);

  const [row] = await db
    .insert(users)
    .values({
      id,
      firmId,
      email,
      fullName,
      jobTitle,
      roleId: role.id,
      isActive: true,
      isSystemUser: false,
      isLawyer,
      mustChangePassword: false,
    })
    .returning();

  return row!;
}

export async function listDirectoryPeople(
  firmId: string,
  opts?: { lawyersOnly?: boolean; activeOnly?: boolean },
) {
  const db = getDb();
  const conditions = [eq(users.firmId, firmId), eq(users.isSystemUser, false)];
  if (opts?.lawyersOnly) conditions.push(eq(users.isLawyer, true));
  if (opts?.activeOnly !== false) conditions.push(eq(users.isActive, true));

  return db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      jobTitle: users.jobTitle,
      isActive: users.isActive,
      isLawyer: users.isLawyer,
      isSystemUser: users.isSystemUser,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(...conditions))
    .orderBy(asc(users.fullName));
}
