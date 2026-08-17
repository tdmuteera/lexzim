import {
  generatedApiRoutes,
  generatedNav,
  generatedTables,
  registryGeneratedAt,
} from "@/lib/diagnostics/registry.generated";
import {
  MODULE_OVERLAY,
  moduleFromPath,
  type DiagnosticModuleCode,
  type DiagnosticOwner,
  type DiagnosticSeverity,
} from "@/lib/diagnostics/registry.overlay";

export type RegistryModule = {
  code: DiagnosticModuleCode;
  severity: DiagnosticSeverity;
  owner: DiagnosticOwner;
  recoveryHint: string;
  nav: Array<{ href: string; label: string; permission: string | null }>;
  apiRoutes: string[];
  tables: string[];
};

export type MergedModuleRegistry = {
  generatedAt: string;
  modules: RegistryModule[];
  unmatchedNav: Array<{ href: string; label: string }>;
  unmatchedApiRoutes: string[];
  unmatchedTables: string[];
};

const MODULE_ORDER: DiagnosticModuleCode[] = [
  "auth",
  "dashboard",
  "clients",
  "matters",
  "documents",
  "calendar",
  "crm",
  "finance.invoicing",
  "finance.debtors",
  "finance.trust",
  "finance.recon",
  "finance.expenses",
  "finance.gl",
  "finance.reports",
  "hr",
  "reports",
  "exports",
  "email",
  "ai",
  "platform",
  "db",
];

export function getModuleRegistry(): MergedModuleRegistry {
  const buckets = new Map<DiagnosticModuleCode, RegistryModule>();
  for (const code of MODULE_ORDER) {
    const overlay = MODULE_OVERLAY[code];
    buckets.set(code, {
      code,
      severity: overlay.severity,
      owner: overlay.owner,
      recoveryHint: overlay.recoveryHint,
      nav: [],
      apiRoutes: [],
      tables: [...(overlay.tables ?? [])],
    });
  }

  const unmatchedNav: MergedModuleRegistry["unmatchedNav"] = [];
  for (const item of generatedNav) {
    const code = moduleFromPath(item.href);
    if (!code) {
      unmatchedNav.push({ href: item.href, label: item.label });
      continue;
    }
    buckets.get(code)?.nav.push(item);
  }

  const unmatchedApiRoutes: string[] = [];
  for (const route of generatedApiRoutes) {
    const code = moduleFromPath(route);
    if (!code) {
      unmatchedApiRoutes.push(route);
      continue;
    }
    buckets.get(code)?.apiRoutes.push(route);
  }

  const assignedTables = new Set<string>();
  for (const mod of buckets.values()) {
    for (const t of mod.tables) assignedTables.add(t);
  }
  const unmatchedTables = generatedTables.filter((t) => !assignedTables.has(t));

  return {
    generatedAt: registryGeneratedAt,
    modules: MODULE_ORDER.map((c) => buckets.get(c)!).filter(
      (m) => m.nav.length + m.apiRoutes.length + m.tables.length > 0,
    ),
    unmatchedNav,
    unmatchedApiRoutes,
    unmatchedTables,
  };
}
