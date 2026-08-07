export {
  authNeedsSetup,
  authSetupFirm,
  authLogin,
  authLogout,
  authCurrentUser,
  requireSession,
} from "@/lib/auth/service";
export type { AuthSessionUser, SetupFirmInput } from "@/lib/auth/types";
export { AuthError } from "@/lib/auth/types";
