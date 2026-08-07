import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { platformAdmins } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

export async function isPlatformAdmin(authUserId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ isActive: platformAdmins.isActive })
    .from(platformAdmins)
    .where(eq(platformAdmins.id, authUserId))
    .limit(1);
  return rows[0]?.isActive ?? false;
}

export async function requirePlatformAdmin(): Promise<{
  id: string;
  email: string;
  fullName: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new AuthError("unauthorized", "Sign in required.");
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.id, user.id))
    .limit(1);
  const admin = rows[0];
  if (!admin || !admin.isActive) {
    throw new AuthError("forbidden", "Platform administrator access required.");
  }

  return {
    id: admin.id,
    email: admin.email,
    fullName: admin.fullName,
  };
}
