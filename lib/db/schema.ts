/**
 * LexZim Drizzle schema.
 *
 * MULTI-TENANT RULE: every firm-scoped query MUST filter by firm_id.
 * Do not trust a client-supplied firm_id without matching the session firm.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
  vector,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/** Gemini text-embedding-004 default size (documented in docs/AI.md). */
export const AI_EMBEDDING_DIMENSIONS = 768;

/** Global bootstrap flags (e.g. platform-level notes). Prefer firm_settings for firm data. */
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const firms = pgTable("firms", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** active | trial | demo | suspended | archived */
  status: text("status").notNull().default("active"),
  defaultCurrency: text("default_currency"),
  logoUrl: text("logo_url"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  country: text("country"),
  /** Demo/marketing tenant — same platform, seeded sample data (P0-11). */
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

/** Platform owner operators (LexZim / LPMS Core admin). Not firm RBAC roles. */
export const platformAdmins = pgTable("platform_admins", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const permissions = pgTable("permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  module: text("module").notNull(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

/**
 * App user profile. `id` matches Supabase Auth `auth.users.id`.
 * Email is unique globally for MVP (simpler login lookup).
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    email: text("email").notNull().unique(),
    fullName: text("full_name").notNull(),
    /** Free-text title on the login (e.g. Associate, Accounts). Not a custom role. */
    jobTitle: text("job_title"),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    isActive: boolean("is_active").notNull().default(true),
    /** P7-11: force a password change on next login (temp password issued). */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [
    index("users_firm_id_idx").on(t.firmId),
    index("users_role_id_idx").on(t.roleId),
  ],
);

/**
 * Per-person grants (P9-05). When a user has rows here, these codes are the
 * source of truth. Empty set falls back to role_permissions.
 */
export const userPermissions = pgTable(
  "user_permissions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.permissionId] }),
    index("user_permissions_firm_user_idx").on(t.firmId, t.userId),
  ],
);

/**
 * P7-11: approval-gated password resets. A user requests a reset from the login
 * screen (no self-service email link); a Managing Partner / users.manage admin
 * approves and issues a temp password. Never store the password here.
 */
export const passwordResetRequests = pgTable(
  "password_reset_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id").references(() => firms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    /** Email as typed at request time (helps triage unknown/foreign emails). */
    email: text("email").notNull(),
    /** pending | approved | rejected | cancelled */
    status: text("status").notNull().default("pending"),
    note: text("note"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    ipOrUserAgent: text("ip_or_user_agent"),
  },
  (t) => [
    index("password_reset_requests_firm_idx").on(t.firmId, t.status),
    index("password_reset_requests_user_idx").on(t.userId),
  ],
);

export const firmSettings = pgTable(
  "firm_settings",
  {
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.firmId, t.key] })],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id").references(() => firms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    ipOrUserAgent: text("ip_or_user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_logs_firm_id_idx").on(t.firmId),
    index("audit_logs_user_id_idx").on(t.userId),
    index("audit_logs_created_at_idx").on(t.createdAt),
  ],
);

// --- Phase 1 MVP (matter-centric, firm-scoped) ---

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    /** CL0001 per firm; immutable after assign */
    clientNumber: text("client_number").notNull(),
    /** individual | corporate | partnership | trust (legacy company → corporate) */
    clientType: text("client_type").notNull(),
    firstName: text("first_name"),
    surname: text("surname"),
    otherNames: text("other_names"),
    maidenName: text("maiden_name"),
    dateOfBirth: timestamp("date_of_birth", { withTimezone: true }),
    nationality: text("nationality"),
    idNumber: text("id_number"),
    fullName: text("full_name"),
    legalName: text("legal_name"),
    registeredName: text("registered_name"),
    tradingName: text("trading_name"),
    nationalIdOrRegNumber: text("national_id_or_reg_number"),
    regTaxNumber: text("reg_tax_number"),
    taxNumber: text("tax_number"),
    incorporationDate: timestamp("incorporation_date", { withTimezone: true }),
    incorporationCountry: text("incorporation_country"),
    email: text("email"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    altPhone: text("alt_phone"),
    residentialAddress: text("residential_address"),
    registeredAddress: text("registered_address"),
    businessAddress: text("business_address"),
    physicalAddress: text("physical_address"),
    postalAddress: text("postal_address"),
    occupation: text("occupation"),
    employer: text("employer"),
    industry: text("industry"),
    responsibleLawyerId: uuid("responsible_lawyer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    pepStatus: boolean("pep_status").notNull().default(false),
    pepDetails: text("pep_details"),
    uboJson: jsonb("ubo_json").notNull().default([]),
    matterScopePurpose: text("matter_scope_purpose"),
    sourceOfFunds: text("source_of_funds"),
    sourceOfFundsOther: text("source_of_funds_other"),
    kycDocumentsJson: jsonb("kyc_documents_json").notNull().default({}),
    declarationSignedAt: timestamp("declaration_signed_at", { withTimezone: true }),
    declarationSignatory: text("declaration_signatory"),
    /** draft | complete | review_due */
    kycStatus: text("kyc_status").notNull().default("draft"),
    kycNotes: text("kyc_notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    unique("clients_firm_client_number_uid").on(t.firmId, t.clientNumber),
    index("clients_firm_id_idx").on(t.firmId),
    index("clients_firm_archived_idx").on(t.firmId, t.archivedAt),
    index("clients_firm_type_idx").on(t.firmId, t.clientType),
    index("clients_firm_id_number_idx").on(t.firmId, t.idNumber),
    index("clients_firm_whatsapp_idx").on(t.firmId, t.whatsapp),
    index("clients_responsible_lawyer_idx").on(t.responsibleLawyerId),
  ],
);

export const matters = pgTable(
  "matters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    areaOfLaw: text("area_of_law").notNull(),
  /** prospective | open | on_hold | closed | archived */
    status: text("status").notNull().default("prospective"),
    matterNumber: text("matter_number"),
    fileRef: text("file_ref"),
    courtName: text("court_name"),
    caseNumber: text("case_number"),
    responsibleLawyerId: uuid("responsible_lawyer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    nextHearingAt: timestamp("next_hearing_at", { withTimezone: true }),
    priority: text("priority").default("normal"),
  /** pending | clear | flagged | not_done */
    conflictCheckStatus: text("conflict_check_status").notNull().default("not_done"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("matters_firm_id_idx").on(t.firmId),
    index("matters_firm_status_idx").on(t.firmId, t.status),
    index("matters_firm_client_idx").on(t.firmId, t.clientId),
    index("matters_responsible_lawyer_idx").on(t.responsibleLawyerId),
  ],
);

export const matterTeam = pgTable(
  "matter_team",
  {
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleOnMatter: text("role_on_matter").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.matterId, t.userId] }),
    index("matter_team_firm_id_idx").on(t.firmId),
  ],
);

export const relatedParties = pgTable(
  "related_parties",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    matterId: uuid("matter_id").references(() => matters.id, { onDelete: "cascade" }),
    partyRole: text("party_role").notNull(),
    name: text("name").notNull(),
    contact: text("contact"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("related_parties_firm_id_idx").on(t.firmId),
    index("related_parties_matter_id_idx").on(t.matterId),
  ],
);

export const pendingProcedures = pgTable(
  "pending_procedures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    dueAt: timestamp("due_at", { withTimezone: true }),
  /** todo | done | cancelled */
    status: text("status").notNull().default("todo"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("pending_procedures_firm_id_idx").on(t.firmId),
    index("pending_procedures_firm_due_idx").on(t.firmId, t.dueAt),
    index("pending_procedures_matter_id_idx").on(t.matterId),
  ],
);

export const matterEvents = pgTable(
  "matter_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    eventAt: timestamp("event_at", { withTimezone: true }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("matter_events_firm_id_idx").on(t.firmId),
    index("matter_events_matter_id_idx").on(t.matterId),
    index("matter_events_event_at_idx").on(t.eventAt),
  ],
);

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    areaOfLaw: text("area_of_law").notNull(),
    description: text("description"),
    bodyFormat: text("body_format").notNull().default("docx"),
    storagePath: text("storage_path").notNull(),
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("templates_firm_id_idx").on(t.firmId),
    index("templates_firm_area_idx").on(t.firmId, t.areaOfLaw),
  ],
);

export const templateVersions = pgTable(
  "template_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    storagePath: text("storage_path").notNull(),
    changeNote: text("change_note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("template_versions_firm_id_idx").on(t.firmId),
    index("template_versions_template_id_idx").on(t.templateId),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id").references(() => matters.id, {
      onDelete: "cascade",
    }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    storagePath: text("storage_path").notNull(),
    sizeBytes: integer("size_bytes"),
  /** uploaded | generated_template | other */
    docType: text("doc_type").notNull().default("uploaded"),
    templateId: uuid("template_id").references(() => templates.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("documents_firm_id_idx").on(t.firmId),
    index("documents_firm_matter_idx").on(t.firmId, t.matterId),
    index("documents_firm_client_idx").on(t.firmId, t.clientId),
    index("documents_matter_id_idx").on(t.matterId),
  ],
);

// --- Phase 2 AI (RAG / conversations / KB). No API keys in plaintext. ---

/** Per-firm AI preferences. Keys live in env / vault (P2-02), not here. */
export const aiSettings = pgTable("ai_settings", {
  firmId: uuid("firm_id")
    .primaryKey()
    .references(() => firms.id, { onDelete: "cascade" }),
  /** gemini | claude | openai */
  providerDefault: text("provider_default").notNull().default("gemini"),
    /** e.g. gemini-3.6-flash */
    modelDefault: text("model_default").notNull().default("gemini-3.6-flash"),
  /** e.g. text-embedding-004 */
    embeddingsModel: text("embeddings_model").notNull().default("gemini-embedding-001"),
  /** Default OFF. Allowlisted web lookup only when enabled. */
  webLookupEnabled: boolean("web_lookup_enabled").notNull().default(false),
  /** auto = legal research prefers Claude when key present, else Gemini Flash. manual = always providerDefault. */
  routingMode: text("routing_mode").notNull().default("auto"),
  /** Soft monthly LLM call cap (null = unlimited). Soft-blocks chat when exceeded. */
  monthlySoftBudget: integer("monthly_soft_budget"),
  /** Cap for chat max_output_tokens / max_tokens. */
  maxOutputTokens: integer("max_output_tokens").notNull().default(1200),
  /** When false, Matter Assist refuses matter-file context. */
  matterContextEnabled: boolean("matter_context_enabled").notNull().default(true),
  /** direct = BYO/managed keys on app server. proxy = LexZim AI proxy (licence token). */
  keyMode: text("key_mode").notNull().default("direct"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** legal_research | matter_assist | drafting */
    mode: text("mode").notNull(),
    matterId: uuid("matter_id").references(() => matters.id, { onDelete: "set null" }),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("ai_conversations_firm_id_idx").on(t.firmId),
    index("ai_conversations_firm_user_idx").on(t.firmId, t.userId),
    index("ai_conversations_matter_id_idx").on(t.matterId),
  ],
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    /** user | assistant | system */
    role: text("role").notNull(),
    content: text("content").notNull(),
    confidence: real("confidence"),
    citationsJson: jsonb("citations_json").$type<unknown[]>().default(sql`'[]'::jsonb`),
    retrievalMetaJson: jsonb("retrieval_meta_json")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("ai_messages_conversation_id_idx").on(t.conversationId),
    index("ai_messages_firm_id_idx").on(t.firmId),
  ],
);

/**
 * Curated knowledge sources. firm_id NULL = LexZim system Zimbabwe KB.
 * firm_id set = firm-private source (later firm memory ingest).
 */
export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id").references(() => firms.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** statute | constitution | rules | commentary | firm_doc | other */
    sourceType: text("source_type").notNull(),
    citationLabel: text("citation_label").notNull(),
    jurisdiction: text("jurisdiction").notNull().default("Zimbabwe"),
    publisher: text("publisher"),
    sourceUrl: text("source_url"),
    licenseNote: text("license_note"),
    versionLabel: text("version_label"),
    effectiveDate: text("effective_date"),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }),
    contentHash: text("content_hash"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("knowledge_sources_firm_id_idx").on(t.firmId),
    index("knowledge_sources_active_idx").on(t.isActive),
  ],
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    firmId: uuid("firm_id").references(() => firms.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    headingPath: text("heading_path"),
    text: text("text").notNull(),
    tokenEstimate: integer("token_estimate"),
    metadataJson: jsonb("metadata_json")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("knowledge_chunks_source_index_uid").on(t.sourceId, t.chunkIndex),
    index("knowledge_chunks_source_id_idx").on(t.sourceId),
    index("knowledge_chunks_firm_id_idx").on(t.firmId),
  ],
);

/**
 * Vector embeddings for KB chunks / firm memory owners.
 * owner_type examples: knowledge_chunk | matter_note | document
 */
export const aiEmbeddings = pgTable(
  "ai_embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerType: text("owner_type").notNull(),
    ownerId: uuid("owner_id").notNull(),
    firmId: uuid("firm_id").references(() => firms.id, { onDelete: "cascade" }),
    embedding: vector("embedding", { dimensions: AI_EMBEDDING_DIMENSIONS }).notNull(),
    modelName: text("model_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("ai_embeddings_owner_uid").on(t.ownerType, t.ownerId, t.modelName),
    index("ai_embeddings_firm_id_idx").on(t.firmId),
    index("ai_embeddings_owner_idx").on(t.ownerType, t.ownerId),
    index("ai_embeddings_embedding_hnsw_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    model: text("model"),
    mode: text("mode"),
    success: boolean("success").notNull().default(true),
    errorCode: text("error_code"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("ai_usage_events_firm_id_idx").on(t.firmId),
    index("ai_usage_events_created_at_idx").on(t.createdAt),
  ],
);

// --- Phase 3 Practice Ops (calendar, billing, trust, intake). No payment gateways. ---

/** Hearing / appointment / filing diary entry. */
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id").references(() => matters.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    /** hearing | appointment | filing | deadline | other */
    eventType: text("event_type").notNull().default("appointment"),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("calendar_events_firm_id_idx").on(t.firmId),
    index("calendar_events_firm_starts_idx").on(t.firmId, t.startsAt),
    index("calendar_events_matter_id_idx").on(t.matterId),
    index("calendar_events_client_id_idx").on(t.firmId, t.clientId),
  ],
);

/** Reusable deadline offset templates (e.g. +14 days from trigger). */
export const deadlineTemplates = pgTable(
  "deadline_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    areaOfLaw: text("area_of_law"),
    description: text("description"),
    /** Days after trigger date. */
    offsetDays: integer("offset_days").notNull().default(0),
    /** hearing | filing | other */
    defaultEventType: text("default_event_type").notNull().default("filing"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("deadline_templates_firm_id_idx").on(t.firmId),
    index("deadline_templates_firm_active_idx").on(t.firmId, t.isActive),
  ],
);

export const matterDeadlines = pgTable(
  "matter_deadlines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => deadlineTemplates.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    /** open | done | cancelled */
    status: text("status").notNull().default("open"),
    notes: text("notes"),
    calendarEventId: uuid("calendar_event_id").references(() => calendarEvents.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("matter_deadlines_firm_id_idx").on(t.firmId),
    index("matter_deadlines_firm_due_idx").on(t.firmId, t.dueAt),
    index("matter_deadlines_matter_id_idx").on(t.matterId),
  ],
);

export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workedAt: timestamp("worked_at", { withTimezone: true }).notNull(),
    minutes: integer("minutes").notNull(),
    billable: boolean("billable").notNull().default(true),
    /** Hourly rate in minor units (cents). */
    rateCents: integer("rate_cents"),
    currency: text("currency"),
    description: text("description"),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("time_entries_firm_id_idx").on(t.firmId),
    index("time_entries_matter_id_idx").on(t.matterId),
    index("time_entries_user_id_idx").on(t.userId),
  ],
);

export const disbursements = pgTable(
  "disbursements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    incurredAt: timestamp("incurred_at", { withTimezone: true }).notNull(),
    billable: boolean("billable").notNull().default(true),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    /** operating | trust */
    paidFrom: text("paid_from").notNull().default("operating"),
    glPostedAt: timestamp("gl_posted_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("disbursements_firm_id_idx").on(t.firmId),
    index("disbursements_matter_id_idx").on(t.matterId),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    invoiceNumber: text("invoice_number").notNull(),
    /** draft | sent | paid | overdue | void */
    status: text("status").notNull().default("draft"),
    currency: text("currency").notNull().default("USD"),
    issueDate: timestamp("issue_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    discountPct: real("discount_pct"),
    retainerAppliedCents: integer("retainer_applied_cents").notNull().default(0),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("invoices_firm_number_uid").on(t.firmId, t.invoiceNumber),
    index("invoices_firm_id_idx").on(t.firmId),
    index("invoices_firm_status_idx").on(t.firmId, t.status),
    index("invoices_matter_id_idx").on(t.matterId),
  ],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    /** time | disbursement | fee | other */
    lineType: text("line_type").notNull().default("fee"),
    description: text("description").notNull(),
    quantity: real("quantity").notNull().default(1),
    unitAmountCents: integer("unit_amount_cents").notNull().default(0),
    amountCents: integer("amount_cents").notNull().default(0),
    sourceId: uuid("source_id"),
    firmServiceId: uuid("firm_service_id").references(() => firmServices.id, {
      onDelete: "set null",
    }),
    revenueGlAccountId: uuid("revenue_gl_account_id").references(() => glAccounts.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("invoice_lines_firm_id_idx").on(t.firmId),
    index("invoice_lines_invoice_id_idx").on(t.invoiceId),
  ],
);

/** Fee receipts against invoices. NEVER mix with trust ledger. */
export const feePayments = pgTable(
  "fee_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    method: text("method"),
    reference: text("reference"),
    notes: text("notes"),
    receiptNumber: text("receipt_number"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("fee_payments_firm_id_idx").on(t.firmId),
    index("fee_payments_invoice_id_idx").on(t.invoiceId),
  ],
);

/** Trust bank/book account (separate from fees). */
export const trustAccounts = pgTable(
  "trust_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    currency: text("currency").notNull().default("USD"),
    accountRef: text("account_ref"),
    /** bank = master trust bank; vault = master trust cash held physically */
    accountKind: text("account_kind").notNull().default("bank"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("trust_accounts_firm_id_idx").on(t.firmId),
    index("trust_accounts_firm_active_idx").on(t.firmId, t.isActive),
    index("trust_accounts_firm_kind_idx").on(t.firmId, t.accountKind),
  ],
);

/**
 * Trust ledger. NEVER join/mix with fee_payments for balances.
 * Amounts in minor units; credit increases trust liability held for client.
 */
export const trustLedgerEntries = pgTable(
  "trust_ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    trustAccountId: uuid("trust_account_id")
      .notNull()
      .references(() => trustAccounts.id, { onDelete: "restrict" }),
    matterId: uuid("matter_id").references(() => matters.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    /** receipt | disbursement | transfer | adjustment */
    entryType: text("entry_type").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    reference: text("reference"),
    referenceNumber: text("reference_number"),
    narrative: text("narrative"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("trust_ledger_firm_id_idx").on(t.firmId),
    index("trust_ledger_account_idx").on(t.trustAccountId),
    index("trust_ledger_matter_id_idx").on(t.matterId),
    index("trust_ledger_occurred_idx").on(t.firmId, t.occurredAt),
  ],
);

// Retained so the schema still matches the live database. The Intake & Conflicts
// module was removed; no application code reads or writes these two tables.
export const intakes = pgTable(
  "intakes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    /** draft | submitted | converted | declined */
    status: text("status").notNull().default("draft"),
    prospectName: text("prospect_name").notNull(),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    areaOfLaw: text("area_of_law"),
    matterSummary: text("matter_summary"),
    opposingParty: text("opposing_party"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    convertedClientId: uuid("converted_client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    convertedMatterId: uuid("converted_matter_id").references(() => matters.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("intakes_firm_id_idx").on(t.firmId),
    index("intakes_firm_status_idx").on(t.firmId, t.status),
  ],
);

export const conflictChecks = pgTable(
  "conflict_checks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    intakeId: uuid("intake_id").references(() => intakes.id, { onDelete: "set null" }),
    matterId: uuid("matter_id").references(() => matters.id, { onDelete: "set null" }),
    query: text("query").notNull(),
    /** clear | conflict | possible | not_done */
    result: text("result").notNull().default("not_done"),
    notes: text("notes"),
    checkedBy: uuid("checked_by").references(() => users.id, { onDelete: "set null" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("conflict_checks_firm_id_idx").on(t.firmId),
    index("conflict_checks_intake_id_idx").on(t.intakeId),
    index("conflict_checks_matter_id_idx").on(t.matterId),
  ],
);

// --- Phase 4 licensing (SaaS activation; not desktop licence files) ---

/** One current licence row per firm (upserted on issue/activate). */
export const firmLicences = pgTable("firm_licences", {
  firmId: uuid("firm_id")
    .primaryKey()
    .references(() => firms.id, { onDelete: "cascade" }),
  /** trial | solo | firm */
  edition: text("edition").notNull().default("trial"),
  seats: integer("seats").notNull().default(10),
  featuresJson: jsonb("features_json")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  /** active | expired | revoked */
  status: text("status").notNull().default("active"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
  /** null = no expiry (rare; prefer dated pilots) */
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  notes: text("notes"),
  /** bootstrap | platform | cli | system */
  issuedBy: text("issued_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Firm LexZim AI proxy credentials (token hash only; master keys stay in proxy/env). */
export const firmAiProxy = pgTable("firm_ai_proxy", {
  firmId: uuid("firm_id")
    .primaryKey()
    .references(() => firms.id, { onDelete: "cascade" }),
  /** sha256 hex of raw token + vault pepper */
  tokenHash: text("token_hash").notNull(),
  /** First chars of token for UI (e.g. lzp_ab12…) */
  tokenPrefix: text("token_prefix").notNull(),
  monthlyQuota: integer("monthly_quota").notNull().default(500),
  callsThisMonth: integer("calls_this_month").notNull().default(0),
  /** UTC period key YYYY-MM */
  periodYm: text("period_ym").notNull(),
  /** active | revoked */
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Phase 5: invited client portal accounts (separate from staff users). */
export const portalUsers = pgTable(
  "portal_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    /** scrypt hash; null until password set or magic-link-only invite */
    passwordHash: text("password_hash"),
    isActive: boolean("is_active").notNull().default(true),
    invitedAt: timestamp("invited_at", { withTimezone: true }).defaultNow().notNull(),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("portal_users_firm_email_uq").on(t.firmId, t.email),
    index("portal_users_firm_id_idx").on(t.firmId),
    index("portal_users_firm_client_idx").on(t.firmId, t.clientId),
  ],
);

/** One-time portal magic-link tokens (hashed). */
export const portalMagicLinks = pgTable(
  "portal_magic_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    portalUserId: uuid("portal_user_id")
      .notNull()
      .references(() => portalUsers.id, { onDelete: "cascade" }),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("portal_magic_links_user_idx").on(t.portalUserId),
    index("portal_magic_links_firm_idx").on(t.firmId),
  ],
);

/**
 * Explicit matter shares for portal (share-nothing default).
 * Portal visibility requires an active row (revoked_at IS NULL).
 */
export const matterPortalShares = pgTable(
  "matter_portal_shares",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    /** read | read_upload */
    permission: text("permission").notNull().default("read"),
    sharedByUserId: uuid("shared_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sharedAt: timestamp("shared_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("matter_portal_shares_firm_matter_client_uq").on(
      t.firmId,
      t.matterId,
      t.clientId,
    ),
    index("matter_portal_shares_firm_client_idx").on(t.firmId, t.clientId),
    index("matter_portal_shares_firm_matter_idx").on(t.firmId, t.matterId),
  ],
);

/** Explicit document shares for portal (independent of matter share). */
export const documentPortalShares = pgTable(
  "document_portal_shares",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /** read | read_upload (upload reserved for inbox; read is MVP) */
    permission: text("permission").notNull().default("read"),
    sharedByUserId: uuid("shared_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sharedAt: timestamp("shared_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("document_portal_shares_firm_doc_client_uq").on(
      t.firmId,
      t.documentId,
      t.clientId,
    ),
    index("document_portal_shares_firm_client_idx").on(t.firmId, t.clientId),
    index("document_portal_shares_firm_matter_idx").on(t.firmId, t.matterId),
  ],
);

/**
 * Client portal uploads land here first (quarantine). Staff must accept
 * before a normal matter document record is created.
 */
export const portalInboxUploads = pgTable(
  "portal_inbox_uploads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    portalUserId: uuid("portal_user_id")
      .notNull()
      .references(() => portalUsers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    storagePath: text("storage_path").notNull(),
    sizeBytes: integer("size_bytes"),
    /** pending | accepted | dismissed */
    status: text("status").notNull().default("pending"),
    acceptedDocumentId: uuid("accepted_document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("portal_inbox_firm_matter_idx").on(t.firmId, t.matterId),
    index("portal_inbox_firm_status_idx").on(t.firmId, t.status),
  ],
);

/** Lightweight in-app alerts for staff (portal inbox, etc.). */
export const staffNotifications = pgTable(
  "staff_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    /** Null = visible to all staff in the firm with access. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("staff_notifications_firm_created_idx").on(t.firmId, t.createdAt),
    index("staff_notifications_firm_user_idx").on(t.firmId, t.userId),
  ],
);

/**
 * Web session registry for firm admin (replaces desktop device pairing).
 * sessionId matches Supabase Auth JWT `session_id` claim when available.
 */
export const staffSessions = pgTable(
  "staff_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Supabase auth.sessions.id when known */
    sessionId: uuid("session_id"),
    userAgent: text("user_agent"),
    ipOrUserAgent: text("ip_or_user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("staff_sessions_firm_user_idx").on(t.firmId, t.userId),
    index("staff_sessions_session_id_idx").on(t.sessionId),
    index("staff_sessions_firm_active_idx").on(t.firmId, t.revokedAt),
  ],
);

/**
 * Background AI jobs (KB reindex / firm memory). Processed by
 * `npm run jobs:ai` or inline after enqueue on the web dyno.
 */
export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id").references(() => firms.id, { onDelete: "cascade" }),
    /** kb_reingest_all | kb_embed | firm_memory_reindex_all | firm_memory_reindex_matter */
    jobType: text("job_type").notNull(),
    /** pending | running | completed | failed */
    status: text("status").notNull().default("pending"),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    resultJson: jsonb("result_json").$type<Record<string, unknown>>(),
    errorMessage: text("error_message"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("ai_jobs_status_created_idx").on(t.status, t.createdAt),
    index("ai_jobs_firm_idx").on(t.firmId),
  ],
);

// --- Phase 6 Finance desk & HR (additive; billing/trust rows preserved). ---

/** Vault → bank trust movement audit (cash trust banked into master trust bank). */
export const trustVaultBankIns = pgTable(
  "trust_vault_bank_ins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    vaultAccountId: uuid("vault_account_id")
      .notNull()
      .references(() => trustAccounts.id, { onDelete: "restrict" }),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => trustAccounts.id, { onDelete: "restrict" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    reference: text("reference"),
    narrative: text("narrative"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("trust_vault_bank_ins_firm_idx").on(t.firmId),
    index("trust_vault_bank_ins_vault_idx").on(t.vaultAccountId),
    index("trust_vault_bank_ins_occurred_idx").on(t.firmId, t.occurredAt),
  ],
);

/** Physical vault count worksheet (system vs counted cash). */
export const trustVaultCounts = pgTable(
  "trust_vault_counts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    vaultAccountId: uuid("vault_account_id")
      .notNull()
      .references(() => trustAccounts.id, { onDelete: "restrict" }),
    countedAt: timestamp("counted_at", { withTimezone: true }).notNull(),
    systemBalanceCents: integer("system_balance_cents").notNull(),
    countedBalanceCents: integer("counted_balance_cents").notNull(),
    varianceCents: integer("variance_cents").notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("trust_vault_counts_firm_idx").on(t.firmId),
    index("trust_vault_counts_vault_idx").on(t.vaultAccountId),
  ],
);

/**
 * Trust or business bank reconciliation run (three-way trust bank, vault count, business bank).
 * statement_balance_cents = external statement or physical count; ledger_balance_cents = book.
 */
export const financeReconciliationRuns = pgTable(
  "finance_reconciliation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    /** trust_bank | trust_vault | business_bank */
    reconType: text("recon_type").notNull(),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    trustAccountId: uuid("trust_account_id").references(() => trustAccounts.id, {
      onDelete: "set null",
    }),
    bankAccountLabel: text("bank_account_label"),
    statementBalanceCents: integer("statement_balance_cents").notNull(),
    ledgerBalanceCents: integer("ledger_balance_cents").notNull(),
    varianceCents: integer("variance_cents").notNull(),
    /** draft | completed */
    status: text("status").notNull().default("draft"),
    notes: text("notes"),
    overrideReason: text("override_reason"),
    completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("finance_recon_runs_firm_period_idx").on(
      t.firmId,
      t.reconType,
      t.periodYear,
      t.periodMonth,
    ),
    index("finance_recon_runs_firm_status_idx").on(t.firmId, t.status),
  ],
);

/** Firm operating expenses (never trust). Categories validated in app layer. */
export const firmExpenses = pgTable(
  "firm_expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    expenseDate: timestamp("expense_date", { withTimezone: true }).notNull(),
    category: text("category").notNull(),
    payee: text("payee").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    matterId: uuid("matter_id").references(() => matters.id, { onDelete: "set null" }),
    paymentMethod: text("payment_method"),
    notes: text("notes"),
    glAccountId: uuid("gl_account_id").references(() => glAccounts.id, { onDelete: "set null" }),
    /** cash | ap | petty */
    paymentSource: text("payment_source").notNull().default("cash"),
    creditorInvoiceId: uuid("creditor_invoice_id"),
    budgetMonth: text("budget_month"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("firm_expenses_firm_date_idx").on(t.firmId, t.expenseDate),
    index("firm_expenses_firm_category_idx").on(t.firmId, t.category),
  ],
);

/** Business operating cashbook (firm money in/out; never trust). */
export const businessCashbookEntries = pgTable(
  "business_cashbook_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    entryDate: timestamp("entry_date", { withTimezone: true }).notNull(),
    /** in | out */
    entryType: text("entry_type").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    reference: text("reference"),
    bankAccountLabel: text("bank_account_label"),
    expenseId: uuid("expense_id").references(() => firmExpenses.id, { onDelete: "set null" }),
    feePaymentId: uuid("fee_payment_id").references(() => feePayments.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("business_cashbook_firm_date_idx").on(t.firmId, t.entryDate),
    index("business_cashbook_firm_type_idx").on(t.firmId, t.entryType),
  ],
);

/** Petty cash float (Phase 7 P7-07). */
export const pettyCashFloats = pgTable(
  "petty_cash_floats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    openingDate: timestamp("opening_date", { withTimezone: true }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    /** open | closed */
    status: text("status").notNull().default("open"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("petty_cash_floats_firm_status_idx").on(t.firmId, t.status)],
);

/** Petty cash movements: vault_to_petty | petty_spend | petty_return */
export const pettyCashMovements = pgTable(
  "petty_cash_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    floatId: uuid("float_id")
      .notNull()
      .references(() => pettyCashFloats.id, { onDelete: "cascade" }),
    movementType: text("movement_type").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    movementDate: timestamp("movement_date", { withTimezone: true }).notNull(),
    expenseGlAccountId: uuid("expense_gl_account_id").references(() => glAccounts.id, {
      onDelete: "set null",
    }),
    reference: text("reference"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("petty_cash_movements_firm_float_idx").on(t.firmId, t.floatId)],
);

/** Accounts payable suppliers (Phase 7). */
export const creditors = pgTable(
  "creditors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    defaultExpenseAccountId: uuid("default_expense_account_id").references(() => glAccounts.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("creditors_firm_active_idx").on(t.firmId, t.isActive)],
);

export const creditorInvoices = pgTable(
  "creditor_invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    creditorId: uuid("creditor_id")
      .notNull()
      .references(() => creditors.id, { onDelete: "cascade" }),
    invoiceDate: timestamp("invoice_date", { withTimezone: true }).notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    reference: text("reference"),
    /** open | paid | void */
    status: text("status").notNull().default("open"),
    expenseAccountId: uuid("expense_account_id").references(() => glAccounts.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("creditor_invoices_firm_creditor_idx").on(t.firmId, t.creditorId),
    index("creditor_invoices_firm_due_idx").on(t.firmId, t.dueDate),
  ],
);

export const creditorPayments = pgTable(
  "creditor_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    creditorInvoiceId: uuid("creditor_invoice_id")
      .notNull()
      .references(() => creditorInvoices.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    paymentMethod: text("payment_method"),
    reference: text("reference"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("creditor_payments_firm_invoice_idx").on(t.firmId, t.creditorInvoiceId)],
);

/** Firm public holidays for CRM desk (Phase 7 P7-08). */
export const firmHolidays = pgTable(
  "firm_holidays",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    holidayDate: timestamp("holiday_date", { withTimezone: true }).notNull(),
    name: text("name").notNull(),
    country: text("country").notNull().default("ZW"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("firm_holidays_firm_date_idx").on(t.firmId, t.holidayDate)],
);

/** Month-end period lock for finance postings (UTC year-month). */
export const financePeriodLocks = pgTable(
  "finance_period_locks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }).defaultNow().notNull(),
    lockedBy: uuid("locked_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
  },
  (t) => [
    unique("finance_period_locks_firm_period_uid").on(
      t.firmId,
      t.periodYear,
      t.periodMonth,
    ),
    index("finance_period_locks_firm_idx").on(t.firmId),
  ],
);

/** Light firm asset register (no depreciation engine). */
export const firmAssets = pgTable(
  "firm_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    acquiredDate: timestamp("acquired_date", { withTimezone: true }).notNull(),
    costCents: integer("cost_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("firm_assets_firm_idx").on(t.firmId)],
);

/** HR staff record (login user optional for non-system staff). */
export const hrStaffProfiles = pgTable(
  "hr_staff_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    jobTitle: text("job_title"),
    department: text("department"),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactPhone: text("emergency_contact_phone"),
    isActive: boolean("is_active").notNull().default(true),
    /** Manual annual leave entitlement (days per year). No accrual engine. */
    annualLeaveEntitlementDays: integer("annual_leave_entitlement_days"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("hr_staff_profiles_firm_idx").on(t.firmId),
    index("hr_staff_profiles_firm_active_idx").on(t.firmId, t.isActive),
    unique("hr_staff_profiles_firm_user_uid").on(t.firmId, t.userId),
  ],
);

/** Employment contract metadata (file path optional until HR doc upload in P6-12). */
export const hrContracts = pgTable(
  "hr_contracts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    staffProfileId: uuid("staff_profile_id")
      .notNull()
      .references(() => hrStaffProfiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }),
    /** draft | active | expired | terminated */
    status: text("status").notNull().default("active"),
    contractDocumentName: text("contract_document_name"),
    contractDocumentPath: text("contract_document_path"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("hr_contracts_firm_idx").on(t.firmId),
    index("hr_contracts_staff_idx").on(t.staffProfileId),
  ],
);

export const hrLeaveTypes = pgTable(
  "hr_leave_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    isPaid: boolean("is_paid").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("hr_leave_types_firm_code_uid").on(t.firmId, t.code),
    index("hr_leave_types_firm_idx").on(t.firmId),
  ],
);

export const hrLeaveRequests = pgTable(
  "hr_leave_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    staffProfileId: uuid("staff_profile_id")
      .notNull()
      .references(() => hrStaffProfiles.id, { onDelete: "cascade" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => hrLeaveTypes.id, { onDelete: "restrict" }),
    fromDate: timestamp("from_date", { withTimezone: true }).notNull(),
    toDate: timestamp("to_date", { withTimezone: true }).notNull(),
    /** requested | approved | rejected | cancelled */
    status: text("status").notNull().default("requested"),
    approverUserId: uuid("approver_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    notes: text("notes"),
    decisionNotes: text("decision_notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("hr_leave_requests_firm_idx").on(t.firmId),
    index("hr_leave_requests_staff_idx").on(t.staffProfileId),
    index("hr_leave_requests_firm_status_idx").on(t.firmId, t.status),
    index("hr_leave_requests_dates_idx").on(t.firmId, t.fromDate, t.toDate),
  ],
);

/** General ledger chart of accounts (Phase 7). */
export const glAccounts = pgTable(
  "gl_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** asset | liability | equity | revenue | direct_cost | expense */
    type: text("type").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => glAccounts.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").notNull().default(true),
    isSystem: boolean("is_system").notNull().default(false),
    /** debit | credit */
    normalBalance: text("normal_balance").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("gl_accounts_firm_code_uid").on(t.firmId, t.code),
    index("gl_accounts_firm_type_idx").on(t.firmId, t.type),
    index("gl_accounts_firm_parent_idx").on(t.firmId, t.parentId),
  ],
);

/** Posted GL journal entry header. */
export const glJournalEntries = pgTable(
  "gl_journal_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    entryDate: timestamp("entry_date", { withTimezone: true }).notNull(),
    reference: text("reference"),
    memo: text("memo"),
    /** manual | invoice | payment | trust | expense | quote | opening */
    sourceType: text("source_type").notNull().default("manual"),
    sourceId: uuid("source_id"),
    postedBy: uuid("posted_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    postedAt: timestamp("posted_at", { withTimezone: true }).defaultNow().notNull(),
    reversedByEntryId: uuid("reversed_by_entry_id").references(
      (): AnyPgColumn => glJournalEntries.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("gl_journal_entries_firm_date_idx").on(t.firmId, t.entryDate),
    index("gl_journal_entries_firm_source_idx").on(t.firmId, t.sourceType, t.sourceId),
  ],
);

/** GL journal entry lines (balanced debits/credits). */
export const glJournalLines = pgTable(
  "gl_journal_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => glJournalEntries.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => glAccounts.id, { onDelete: "restrict" }),
    debitCents: integer("debit_cents").notNull().default(0),
    creditCents: integer("credit_cents").notNull().default(0),
    matterId: uuid("matter_id").references(() => matters.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    currency: text("currency").notNull().default("USD"),
    lineMemo: text("line_memo"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("gl_journal_lines_firm_entry_idx").on(t.firmId, t.entryId),
    index("gl_journal_lines_firm_account_idx").on(t.firmId, t.accountId),
  ],
);

/** Firm service catalogue / price list (Phase 7). */
export const firmServices = pgTable(
  "firm_services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    defaultPriceCents: integer("default_price_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    revenueGlAccountId: uuid("revenue_gl_account_id").references(() => glAccounts.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("firm_services_firm_code_uid").on(t.firmId, t.code),
    index("firm_services_firm_active_idx").on(t.firmId, t.isActive),
  ],
);

/** Client quotations (Phase 7). No GL posting until invoice. */
export const quotations = pgTable(
  "quotations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    matterId: uuid("matter_id").references(() => matters.id, { onDelete: "set null" }),
    quoteNumber: text("quote_number").notNull(),
    /** draft | sent | accepted | declined | expired */
    status: text("status").notNull().default("draft"),
    currency: text("currency").notNull().default("USD"),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    discountCents: integer("discount_cents").notNull().default(0),
    discountPct: real("discount_pct"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("quotations_firm_quote_number_uid").on(t.firmId, t.quoteNumber),
    index("quotations_firm_status_idx").on(t.firmId, t.status),
    index("quotations_firm_client_idx").on(t.firmId, t.clientId),
  ],
);

export const quotationLines = pgTable(
  "quotation_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    firmServiceId: uuid("firm_service_id").references(() => firmServices.id, {
      onDelete: "set null",
    }),
    description: text("description").notNull(),
    qty: real("qty").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    lineTotalCents: integer("line_total_cents").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("quotation_lines_firm_quote_idx").on(t.firmId, t.quotationId)],
);

/**
 * Phase 8 platform diagnostics (not firm audit).
 * Never store KYC, matter titles, amounts, secrets, or document bodies.
 * firm_id / user_id are optional UUIDs only; product rows are not copied here.
 */
export const diagnosticEvents = pgTable(
  "diagnostic_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    /** api | frontend | health | worker */
    source: text("source").notNull(),
    /** debug | info | warn | error */
    level: text("level").notNull(),
    module: text("module").notNull(),
    /** Path without query string. */
    route: text("route"),
    httpMethod: text("http_method"),
    httpStatus: integer("http_status"),
    errorCode: text("error_code"),
    sqlstate: text("sqlstate"),
    messageSafe: text("message_safe").notNull().default(""),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    firmId: uuid("firm_id").references(() => firms.id, { onDelete: "set null" }),
    role: text("role"),
    durationMs: integer("duration_ms"),
    payloadJson: jsonb("payload_json")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [
    index("diagnostic_events_request_id_idx").on(t.requestId),
    index("diagnostic_events_created_at_idx").on(t.createdAt),
    index("diagnostic_events_module_idx").on(t.module),
    index("diagnostic_events_level_idx").on(t.level),
    index("diagnostic_events_firm_id_idx").on(t.firmId),
  ],
);

export const diagnosticSpans = pgTable(
  "diagnostic_spans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: text("request_id").notNull(),
    parentSpanId: uuid("parent_span_id").references((): AnyPgColumn => diagnosticSpans.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    durationMs: integer("duration_ms"),
    ok: boolean("ok").notNull().default(true),
    errorCode: text("error_code"),
  },
  (t) => [
    index("diagnostic_spans_request_id_idx").on(t.requestId),
    index("diagnostic_spans_parent_idx").on(t.parentSpanId),
  ],
);

export const diagnosticDiagnoses = pgTable(
  "diagnostic_diagnoses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    summary: text("summary").notNull(),
    likelyCause: text("likely_cause").notNull(),
    confidence: integer("confidence").notNull().default(0),
    alternativesJson: jsonb("alternatives_json")
      .$type<unknown[]>()
      .default(sql`'[]'::jsonb`),
    evidenceJson: jsonb("evidence_json")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`),
    /** none | retry | inspect_health | runtime_heal | propose_patch */
    recommendedAction: text("recommended_action").notNull().default("none"),
    modelId: text("model_id"),
    /** Ops user UUID or the literal "rules". */
    createdBy: text("created_by").notNull(),
  },
  (t) => [
    index("diagnostic_diagnoses_request_id_idx").on(t.requestId),
    index("diagnostic_diagnoses_created_at_idx").on(t.createdAt),
  ],
);

export const diagnosticRepairActions = pgTable(
  "diagnostic_repair_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    diagnosisId: uuid("diagnosis_id").references(() => diagnosticDiagnoses.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    /** runtime_heal | patch_proposal */
    kind: text("kind").notNull(),
    actionCode: text("action_code").notNull(),
    /** proposed | approved | running | succeeded | failed | rolled_back | rejected */
    status: text("status").notNull().default("proposed"),
    requestedBy: text("requested_by"),
    approvedBy: text("approved_by"),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    resultSafe: text("result_safe"),
    proposalPath: text("proposal_path"),
  },
  (t) => [
    index("diagnostic_repair_actions_diagnosis_idx").on(t.diagnosisId),
    index("diagnostic_repair_actions_status_idx").on(t.status),
    index("diagnostic_repair_actions_created_at_idx").on(t.createdAt),
  ],
);

export const schema = {
  appMeta,
  firms,
  platformAdmins,
  roles,
  permissions,
  rolePermissions,
  users,
  firmSettings,
  auditLogs,
  clients,
  matters,
  matterTeam,
  relatedParties,
  pendingProcedures,
  matterEvents,
  templates,
  templateVersions,
  documents,
  aiSettings,
  aiConversations,
  aiMessages,
  knowledgeSources,
  knowledgeChunks,
  aiEmbeddings,
  aiUsageEvents,
  calendarEvents,
  deadlineTemplates,
  matterDeadlines,
  timeEntries,
  disbursements,
  invoices,
  invoiceLines,
  feePayments,
  trustAccounts,
  trustLedgerEntries,
  intakes,
  conflictChecks,
  firmLicences,
  firmAiProxy,
  portalUsers,
  portalMagicLinks,
  matterPortalShares,
  documentPortalShares,
  portalInboxUploads,
  staffNotifications,
  staffSessions,
  aiJobs,
  trustVaultBankIns,
  trustVaultCounts,
  financeReconciliationRuns,
  firmExpenses,
  businessCashbookEntries,
  financePeriodLocks,
  firmAssets,
  hrStaffProfiles,
  hrContracts,
  hrLeaveTypes,
  hrLeaveRequests,
  glAccounts,
  glJournalEntries,
  glJournalLines,
  firmServices,
  quotations,
  quotationLines,
  pettyCashFloats,
  pettyCashMovements,
  creditors,
  creditorInvoices,
  creditorPayments,
  firmHolidays,
  passwordResetRequests,
  diagnosticEvents,
  diagnosticSpans,
  diagnosticDiagnoses,
  diagnosticRepairActions,
};
