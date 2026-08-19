/** Client-safe RBAC exports (permissions helpers, matrix, repository types). */
export {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  canViewAllMatters,
  canViewAllLawyerPerformance,
  canApproveTemplates,
  type ClientAuthSession,
} from "@/lib/rbac/permissions";

export { ROLE_DEFS, PERMISSION_DEFS, ROLE_PERMISSION_MATRIX } from "@/lib/rbac/matrix";
