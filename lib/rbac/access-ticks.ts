import type { PermissionCode } from "@/lib/db/types";
import { navSections } from "@/lib/nav";

export type AccessTick = {
  code: PermissionCode;
  label: string;
  section: string;
  hint?: string;
};

/**
 * One sidebar tick can grant the view code plus the write codes that module
 * needs. Extra role-matrix codes (e.g. matters.view_all) are preserved on save
 * if they are not in this map.
 */
export const ACCESS_TICK_GRANTS: Record<string, PermissionCode[]> = {
  "dashboard.view": ["dashboard.view"],
  "clients.view": ["clients.view", "clients.create", "clients.edit"],
  "clients.view_all": ["clients.view_all"],
  "clients.kyc.manage": ["clients.kyc.manage"],
  "clients.delete": ["clients.delete"],
  "matters.view": ["matters.view", "matters.create", "matters.edit", "matters.view_all"],
  "documents.view": [
    "documents.view",
    "documents.manage",
    "templates.view",
    "templates.manage",
  ],
  "calendar.view": ["calendar.view", "calendar.manage"],
  "crm.view": ["crm.view", "crm.manage"],
  "billing.view": ["billing.view", "billing.manage", "finance.quote.manage"],
  "trust.view": ["trust.view"],
  "finance.reconcile": ["finance.reconcile"],
  "finance.view": [
    "finance.view",
    "finance.post",
    "finance.gl.view",
    "finance.payments.view",
    "finance.payments.create",
    "finance.requisitions.view",
    "finance.requisitions.request",
    "finance.requisitions.approve",
    "finance.requisitions.pay",
    "finance.commission.view",
  ],
  "finance.view_all_client_accounts": ["finance.view_all_client_accounts"],
  "finance.payments.view": ["finance.payments.view", "finance.payments.create"],
  "finance.requisitions.view": [
    "finance.requisitions.view",
    "finance.requisitions.request",
    "finance.requisitions.approve",
    "finance.requisitions.pay",
  ],
  "finance.commission.view": ["finance.commission.view", "finance.commission.configure"],
  "hr.view": ["hr.view", "hr.manage"],
  "users.manage": ["users.manage", "users.activity.view"],
  "users.activity.view": ["users.activity.view"],
  "reports.view": ["reports.view"],
  "ai.use": ["ai.use"],
  "audit.view": ["audit.view"],
  "settings.manage": ["settings.manage"],
};

const EXTRA_ACCESS_TICKS: AccessTick[] = [
  {
    code: "clients.view_all",
    section: "Practice",
    label: "View all clients",
    hint: "See every firm client. Without this tick, users only see clients they are responsible for or linked to via a matter team.",
  },
  {
    code: "clients.delete",
    section: "Practice",
    label: "Delete clients",
    hint: "Archive or restore client records.",
  },
  {
    code: "clients.kyc.manage",
    section: "Practice",
    label: "Manage client KYC",
    hint: "View and edit KYC / AML fields. Finance can invoice without this.",
  },
  {
    code: "finance.view_all_client_accounts",
    section: "Finance",
    label: "All client finance accounts",
    hint: "Open trust and fee accounts for every client (bookkeeper / office manager).",
  },
  {
    code: "users.activity.view",
    section: "Platform",
    label: "View user activity",
    hint: "User activity tab under Lawyers & Staff: who changed what and when. Does not include the full Audit Log page.",
  },
];

export const ACCESS_TICK_UNIVERSE = new Set<string>(
  Object.values(ACCESS_TICK_GRANTS).flat(),
);

export function accessTicksFromNav(): AccessTick[] {
  const out: AccessTick[] = [];
  const seen = new Set<string>();
  for (const section of navSections) {
    const labelsByCode = new Map<string, string[]>();
    for (const item of section.items) {
      if (!item.permission) continue;
      const labels = labelsByCode.get(item.permission) ?? [];
      labels.push(item.label);
      labelsByCode.set(item.permission, labels);
    }
    for (const [code, labels] of labelsByCode) {
      if (seen.has(code)) continue;
      seen.add(code);
      out.push({
        code: code as PermissionCode,
        section: section.title,
        label: labels.length === 1 ? labels[0] : labels.join(" and "),
        hint:
          labels.length > 1
            ? `One tick covers ${labels.join(", ")}.`
            : undefined,
      });
    }
  }
  for (const tick of EXTRA_ACCESS_TICKS) {
    if (seen.has(tick.code)) continue;
    seen.add(tick.code);
    out.push(tick);
  }
  return out;
}

export function expandAccessTicks(tickCodes: string[]): PermissionCode[] {
  const granted = new Set<PermissionCode>();
  for (const code of tickCodes) {
    const extra = ACCESS_TICK_GRANTS[code];
    if (extra) {
      for (const item of extra) granted.add(item);
    } else if (code) {
      granted.add(code as PermissionCode);
    }
  }
  return [...granted];
}

/** Which sidebar ticks are on, given stored grant codes. */
export function navTicksFromGrants(grants: readonly string[]): PermissionCode[] {
  const set = new Set(grants);
  return accessTicksFromNav()
    .map((t) => t.code)
    .filter((code) => set.has(code));
}

export function mergePreservedGrants(
  nextFromTicks: string[],
  existing: readonly string[],
): string[] {
  const preserved = existing.filter((code) => !ACCESS_TICK_UNIVERSE.has(code));
  return [...new Set([...nextFromTicks, ...preserved])];
}
