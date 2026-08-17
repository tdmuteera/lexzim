/**
 * Phase 8 v1 workflow contracts (P8-08).
 * Seven LexZim paths only. No business logic copied here.
 * Trust receipt is never classified as a fee payment.
 */

import type { DiagnosticModuleCode } from "@/lib/diagnostics/registry.overlay";

export type WorkflowStep = {
  id: string;
  /** Real function, route, or guard name (reference only). */
  name: string;
  kind: "route" | "guard" | "validation" | "repo" | "gl" | "audit" | "session";
};

export type WorkflowContract = {
  id: string;
  module: DiagnosticModuleCode;
  title: string;
  summary: string;
  userBlocker: boolean;
  steps: WorkflowStep[];
  /** Other workflow ids or module codes this path depends on. */
  dependencies: string[];
  expectedStatus: number[];
  failureClasses: string[];
  /** Routes used to suggest this workflow from a diagnostic event. */
  matchRoutes: string[];
  matchMethods: string[];
  notes: string[];
};

export type WorkflowGraphNode = {
  id: string;
  kind: "workflow" | "module" | "capability";
  label: string;
};

export type WorkflowGraphEdge = {
  from: string;
  to: string;
  reason: string;
};

export type WorkflowDependencyGraph = {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
};

export type WorkflowBundle = {
  workflows: WorkflowContract[];
  graph: WorkflowDependencyGraph;
};

/** Exact seven v1 contracts. */
export const WORKFLOW_CONTRACTS: WorkflowContract[] = [
  {
    id: "auth.login",
    module: "auth",
    title: "Staff login",
    summary: "Supabase password sign-in, staff session registry, firm cookie session.",
    userBlocker: true,
    expectedStatus: [200],
    failureClasses: [
      "invalid_credentials",
      "forbidden",
      "connectivity",
      "schema",
      "database_unavailable",
    ],
    matchRoutes: ["/api/auth/login"],
    matchMethods: ["POST"],
    dependencies: ["db"],
    steps: [
      { id: "prepare", name: "prepareDbRetry", kind: "repo" },
      { id: "route", name: "POST /api/auth/login", kind: "route" },
      { id: "login", name: "authLogin", kind: "session" },
      { id: "supabase", name: "supabase.auth.signInWithPassword", kind: "session" },
      { id: "profile", name: "loadSessionUser", kind: "session" },
      { id: "session", name: "registerStaffSession", kind: "session" },
      { id: "audit", name: "writeAuditLog(auth.login)", kind: "audit" },
    ],
    notes: [
      "invalid_credentials is not an outage.",
      "Suspended firm returns forbidden, not connectivity.",
    ],
  },
  {
    id: "clients.create",
    module: "clients",
    title: "Create client",
    summary:
      "Compulsory KYC core: client type, first name/surname (or registered name), phone, WhatsApp.",
    userBlocker: true,
    expectedStatus: [201],
    failureClasses: ["validation", "unauthorized", "forbidden", "connectivity", "schema"],
    matchRoutes: ["/api/clients"],
    matchMethods: ["POST"],
    dependencies: ["auth.login", "db"],
    steps: [
      { id: "guard", name: "requirePermission(clients.create)", kind: "guard" },
      { id: "route", name: "POST /api/clients", kind: "route" },
      { id: "validate", name: "parseClientInput(requireKycCore: true)", kind: "validation" },
      { id: "repo", name: "createClient", kind: "repo" },
      { id: "audit", name: "writeAuditLog(clients.create)", kind: "audit" },
    ],
    notes: [
      "KYC: phone and WhatsApp required. Individuals need firstName and surname.",
      "Do not store KYC field values in diagnostic payloads.",
    ],
  },
  {
    id: "matters.create",
    module: "matters",
    title: "Create matter",
    summary: "Firm-scoped matter open against an active client. Licence matter limits apply.",
    userBlocker: true,
    expectedStatus: [201],
    failureClasses: [
      "validation",
      "licence",
      "not_found",
      "unauthorized",
      "forbidden",
      "connectivity",
      "schema",
    ],
    matchRoutes: ["/api/matters"],
    matchMethods: ["POST"],
    dependencies: ["clients.create", "auth.login", "db"],
    steps: [
      { id: "guard", name: "requirePermission(matters.create)", kind: "guard" },
      { id: "licence", name: "assertCanCreateMatter", kind: "guard" },
      { id: "route", name: "POST /api/matters", kind: "route" },
      { id: "validate", name: "parseMatterInput", kind: "validation" },
      { id: "client", name: "getClientById", kind: "repo" },
      { id: "repo", name: "createMatter", kind: "repo" },
      { id: "event", name: "createMatterEvent", kind: "repo" },
      { id: "audit", name: "writeAuditLog(matters.create)", kind: "audit" },
    ],
    notes: ["Archived clients cannot open matters."],
  },
  {
    id: "finance.invoice.create",
    module: "finance.invoicing",
    title: "Create fee invoice",
    summary: "Fee invoice only (not trust). Draft create; Phase 7 GL posts when status becomes sent.",
    userBlocker: true,
    expectedStatus: [201],
    failureClasses: [
      "validation",
      "forbidden",
      "not_found",
      "gl_posting",
      "connectivity",
      "schema",
    ],
    matchRoutes: ["/api/invoices"],
    matchMethods: ["POST"],
    dependencies: ["clients.create", "matters.create", "finance.gl"],
    steps: [
      { id: "guard", name: "requirePermission(billing.manage)", kind: "guard" },
      { id: "route", name: "POST /api/invoices", kind: "route" },
      {
        id: "validate",
        name: "parseCreateInvoiceInput | parseCreateServiceInvoiceInput",
        kind: "validation",
      },
      {
        id: "repo",
        name: "createInvoiceFromUnbilled | createInvoiceFromServices",
        kind: "repo",
      },
      {
        id: "gl",
        name: "postInvoiceSentGl (when draft → sent via updateInvoiceStatus)",
        kind: "gl",
      },
      { id: "audit", name: "writeAuditLog(invoices.create)", kind: "audit" },
    ],
    notes: [
      "Create inserts status=draft. GL dependency is postInvoiceSentGl on send (Phase 7).",
      "Never posts trust_ledger_entries.",
    ],
  },
  {
    id: "finance.payment.post",
    module: "finance.invoicing",
    title: "Post fee payment",
    summary: "Fee payment against an invoice with GL Dr cash Cr AR. Trust wall: not a trust receipt.",
    userBlocker: true,
    expectedStatus: [201],
    failureClasses: [
      "validation",
      "not_found",
      "forbidden",
      "gl_posting",
      "connectivity",
      "schema",
    ],
    matchRoutes: ["/api/invoices/:id/payments"],
    matchMethods: ["POST"],
    dependencies: ["finance.invoice.create", "finance.gl"],
    steps: [
      { id: "guard", name: "requirePermission(billing.manage)", kind: "guard" },
      { id: "route", name: "POST /api/invoices/:id/payments", kind: "route" },
      { id: "access", name: "assertInvoiceMatterAccess", kind: "guard" },
      { id: "validate", name: "parseFeePaymentInput", kind: "validation" },
      { id: "repo", name: "createFeePayment → fee_payments", kind: "repo" },
      { id: "gl", name: "postFeePaymentGl", kind: "gl" },
      { id: "audit", name: "writeAuditLog(fee_payments.create)", kind: "audit" },
    ],
    notes: [
      "Trust wall: writes fee_payments only. Never trust_ledger_entries.",
      "apply-retainer is a different path and is not this workflow.",
    ],
  },
  {
    id: "finance.trust.receipt",
    module: "finance.trust",
    title: "Trust receipt",
    summary:
      "Trust ledger receipt with reference. GL mirrors trust bank/liability. Never a fee payment.",
    userBlocker: true,
    expectedStatus: [201],
    failureClasses: [
      "validation",
      "licence",
      "forbidden",
      "gl_posting",
      "connectivity",
      "schema",
    ],
    matchRoutes: ["/api/trust/ledger"],
    matchMethods: ["POST"],
    dependencies: ["clients.create", "finance.trust", "finance.gl"],
    steps: [
      { id: "guard", name: "requirePermission(trust.manage)", kind: "guard" },
      { id: "licence", name: "assertCanUse(trust)", kind: "guard" },
      { id: "route", name: "POST /api/trust/ledger (entryType=receipt)", kind: "route" },
      { id: "validate", name: "parseTrustLedgerInput", kind: "validation" },
      {
        id: "repo",
        name: "postTrustLedgerEntry → trust_ledger_entries (+ allocateTrustReferenceNumber)",
        kind: "repo",
      },
      { id: "gl", name: "postTrustLedgerGl (Dr 1210 Cr 2100)", kind: "gl" },
      { id: "audit", name: "writeAuditLog(trust_ledger.post)", kind: "audit" },
    ],
    notes: [
      "Acceptance: never classify as finance.payment.post.",
      "Audit metadata note: Trust ledger only. Not a fee payment.",
      "Amounts and client names must not appear in diagnostic storage.",
    ],
  },
  {
    id: "reports.export",
    module: "exports",
    title: "Export report",
    summary: "PDF, Word, or Excel via lib/export registry builders (GET /api/export/:kind).",
    userBlocker: false,
    expectedStatus: [200],
    failureClasses: [
      "validation",
      "not_found",
      "unauthorized",
      "forbidden",
      "builder_error",
      "connectivity",
      "schema",
    ],
    matchRoutes: ["/api/export/:kind"],
    matchMethods: ["GET"],
    dependencies: ["auth.login", "exports"],
    steps: [
      { id: "route", name: "GET /api/export/:kind", kind: "route" },
      { id: "kind", name: "isExportKind / EXPORT_REGISTRY", kind: "validation" },
      { id: "guard", name: "requirePermission(def.permission)", kind: "guard" },
      { id: "render", name: "renderExport → exportToPdf | exportToDocx | exportToXlsx", kind: "repo" },
      { id: "audit", name: "writeAuditLog(def.auditAction)", kind: "audit" },
    ],
    notes: [
      "Firm ZIP archive POST /api/export is not this v1 workflow.",
      "Builders live in lib/export/registry.ts (debtors, practice_report, finance_weekly, …).",
    ],
  },
];

export function getWorkflowContracts(): WorkflowContract[] {
  return WORKFLOW_CONTRACTS;
}

export function getWorkflowById(id: string): WorkflowContract | undefined {
  return WORKFLOW_CONTRACTS.find((w) => w.id === id);
}

/** Dependency graph for the seven workflows only (plus shared modules/capabilities). */
export function getWorkflowDependencyGraph(): WorkflowDependencyGraph {
  const nodes: WorkflowGraphNode[] = [
    { id: "db", kind: "module", label: "db" },
    { id: "finance.gl", kind: "module", label: "finance.gl" },
    { id: "finance.trust", kind: "module", label: "finance.trust" },
    { id: "exports", kind: "module", label: "exports" },
    { id: "trust_ledger", kind: "capability", label: "trust ledger" },
    { id: "export_builders", kind: "capability", label: "export registry builders" },
    ...WORKFLOW_CONTRACTS.map((w) => ({
      id: w.id,
      kind: "workflow" as const,
      label: w.id,
    })),
  ];

  const edges: WorkflowGraphEdge[] = [
    { from: "auth.login", to: "db", reason: "Session profile and staff_sessions need DB" },
    { from: "clients.create", to: "auth.login", reason: "Staff session required" },
    { from: "clients.create", to: "db", reason: "clients table write" },
    { from: "matters.create", to: "clients.create", reason: "Matter requires firm client" },
    { from: "matters.create", to: "auth.login", reason: "Staff session required" },
    { from: "matters.create", to: "db", reason: "matters table write" },
    {
      from: "finance.invoice.create",
      to: "clients.create",
      reason: "Invoice needs client",
    },
    {
      from: "finance.invoice.create",
      to: "matters.create",
      reason: "Invoice needs matter",
    },
    {
      from: "finance.invoice.create",
      to: "finance.gl",
      reason: "postInvoiceSentGl when draft becomes sent",
    },
    {
      from: "finance.payment.post",
      to: "finance.invoice.create",
      reason: "Fee payment posts against an invoice",
    },
    {
      from: "finance.payment.post",
      to: "finance.gl",
      reason: "postFeePaymentGl",
    },
    {
      from: "finance.trust.receipt",
      to: "clients.create",
      reason: "Receipt requires client (except transfer)",
    },
    {
      from: "finance.trust.receipt",
      to: "trust_ledger",
      reason: "postTrustLedgerEntry writes trust_ledger_entries",
    },
    {
      from: "finance.trust.receipt",
      to: "finance.gl",
      reason: "postTrustLedgerGl mirrors bank/liability",
    },
    { from: "finance.trust.receipt", to: "finance.trust", reason: "Trust module licence and accounts" },
    {
      from: "reports.export",
      to: "auth.login",
      reason: "Permissioned staff session",
    },
    {
      from: "reports.export",
      to: "export_builders",
      reason: "EXPORT_REGISTRY renderExport builders",
    },
    { from: "reports.export", to: "exports", reason: "exports module" },
  ];

  return { nodes, edges };
}

export function getWorkflowBundle(): WorkflowBundle {
  return {
    workflows: getWorkflowContracts(),
    graph: getWorkflowDependencyGraph(),
  };
}

function normalizePath(route: string | null | undefined): string {
  if (!route) return "";
  const pathOnly = route.split("?")[0] ?? route;
  return pathOnly.replace(/\/+$/, "") || "/";
}

function isInvoicePaymentsPath(path: string): boolean {
  return /^\/api\/invoices\/[^/]+\/payments$/.test(path);
}

function isInvoiceCreatePath(path: string): boolean {
  return path === "/api/invoices";
}

function isTrustLedgerPath(path: string): boolean {
  return path === "/api/trust/ledger";
}

function isExportKindPath(path: string): boolean {
  return /^\/api\/export\/[^/]+$/.test(path);
}

function isClientsCreatePath(path: string): boolean {
  return path === "/api/clients";
}

function isMattersCreatePath(path: string): boolean {
  return path === "/api/matters";
}

function isLoginPath(path: string): boolean {
  return path === "/api/auth/login";
}

function methodOk(methods: string[], method: string | null | undefined): boolean {
  if (!method) return true;
  return methods.includes(method.toUpperCase());
}

/**
 * Suggest v1 workflows for a failed (or any) diagnostic event.
 * Trust ledger never suggests fee payment. Invoice payments never suggest trust receipt.
 */
export function suggestWorkflows(input: {
  route?: string | null;
  module?: string | null;
  method?: string | null;
}): WorkflowContract[] {
  const path = normalizePath(input.route);
  const method = input.method?.toUpperCase() ?? null;
  const moduleCode = input.module?.trim() || null;

  // Exclusive finance walls first.
  if (path.startsWith("/api/trust")) {
    if (isTrustLedgerPath(path) && methodOk(["POST"], method)) {
      return WORKFLOW_CONTRACTS.filter((w) => w.id === "finance.trust.receipt");
    }
    return [];
  }

  if (isInvoicePaymentsPath(path)) {
    if (methodOk(["POST"], method)) {
      return WORKFLOW_CONTRACTS.filter((w) => w.id === "finance.payment.post");
    }
    return [];
  }

  if (path.includes("/apply-retainer")) {
    return [];
  }

  if (isInvoiceCreatePath(path) && methodOk(["POST"], method)) {
    return WORKFLOW_CONTRACTS.filter((w) => w.id === "finance.invoice.create");
  }

  if (isLoginPath(path) && methodOk(["POST"], method)) {
    return WORKFLOW_CONTRACTS.filter((w) => w.id === "auth.login");
  }

  if (isClientsCreatePath(path) && methodOk(["POST"], method)) {
    return WORKFLOW_CONTRACTS.filter((w) => w.id === "clients.create");
  }

  if (isMattersCreatePath(path) && methodOk(["POST"], method)) {
    return WORKFLOW_CONTRACTS.filter((w) => w.id === "matters.create");
  }

  if (isExportKindPath(path) && methodOk(["GET"], method)) {
    return WORKFLOW_CONTRACTS.filter((w) => w.id === "reports.export");
  }

  // Module-only fallback (no route). Never cross the trust wall.
  if (!path && moduleCode) {
    if (moduleCode === "finance.trust") {
      return WORKFLOW_CONTRACTS.filter((w) => w.id === "finance.trust.receipt");
    }
    if (moduleCode === "finance.invoicing") {
      return WORKFLOW_CONTRACTS.filter(
        (w) => w.id === "finance.invoice.create" || w.id === "finance.payment.post",
      );
    }
    if (moduleCode === "auth") {
      return WORKFLOW_CONTRACTS.filter((w) => w.id === "auth.login");
    }
    if (moduleCode === "clients") {
      return WORKFLOW_CONTRACTS.filter((w) => w.id === "clients.create");
    }
    if (moduleCode === "matters") {
      return WORKFLOW_CONTRACTS.filter((w) => w.id === "matters.create");
    }
    if (moduleCode === "exports" || moduleCode === "reports") {
      return WORKFLOW_CONTRACTS.filter((w) => w.id === "reports.export");
    }
  }

  return [];
}

/** Runtime invariant used by the ops API (acceptance). */
export function assertTrustReceiptNotFeePayment(): void {
  const fromTrust = suggestWorkflows({
    route: "/api/trust/ledger",
    method: "POST",
    module: "finance.trust",
  });
  if (fromTrust.some((w) => w.id === "finance.payment.post")) {
    throw new Error("Trust ledger must never suggest finance.payment.post");
  }
  if (fromTrust.length !== 1 || fromTrust[0]?.id !== "finance.trust.receipt") {
    throw new Error("Trust ledger POST must suggest finance.trust.receipt only");
  }

  const fromFee = suggestWorkflows({
    route: "/api/invoices/00000000-0000-0000-0000-000000000001/payments",
    method: "POST",
    module: "finance.invoicing",
  });
  if (fromFee.some((w) => w.id === "finance.trust.receipt")) {
    throw new Error("Fee payment must never suggest finance.trust.receipt");
  }
  if (fromFee.length !== 1 || fromFee[0]?.id !== "finance.payment.post") {
    throw new Error("Invoice payments POST must suggest finance.payment.post only");
  }

  const invoice = WORKFLOW_CONTRACTS.find((w) => w.id === "finance.invoice.create");
  if (!invoice?.dependencies.includes("finance.gl")) {
    throw new Error("finance.invoice.create must depend on finance.gl (postInvoiceSentGl)");
  }
  if (!invoice.steps.some((s) => s.id === "gl")) {
    throw new Error("finance.invoice.create must list a GL step");
  }
}
