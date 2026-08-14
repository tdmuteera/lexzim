import type { PermissionCode, RoleCode } from "@/lib/db/types";

/** Safe session DTO returned by auth_current_user (never includes secrets). */
export type AuthSessionUser = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  /** P7-11: temp password issued; prompt the user to change it. */
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  firm: {
    id: string;
    name: string;
    slug: string;
    status: string;
    defaultCurrency: string | null;
    logoUrl: string | null;
    isDemo: boolean;
  };
  role: {
    id: string;
    code: RoleCode | string;
    name: string;
  };
  permissions: PermissionCode[] | string[];
};

export type SetupFirmInput = {
  firmName: string;
  fullName: string;
  email: string;
  password: string;
  defaultCurrency?: string;
};

export class AuthError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}
