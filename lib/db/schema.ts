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
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [
    index("users_firm_id_idx").on(t.firmId),
    index("users_role_id_idx").on(t.roleId),
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
    clientType: text("client_type").notNull(), // individual | company
    fullName: text("full_name"),
    legalName: text("legal_name"),
    tradingName: text("trading_name"),
    nationalIdOrRegNumber: text("national_id_or_reg_number"),
    taxNumber: text("tax_number"),
    email: text("email"),
    phone: text("phone"),
    altPhone: text("alt_phone"),
    physicalAddress: text("physical_address"),
    postalAddress: text("postal_address"),
    kycNotes: text("kyc_notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("clients_firm_id_idx").on(t.firmId),
    index("clients_firm_archived_idx").on(t.firmId, t.archivedAt),
    index("clients_firm_type_idx").on(t.firmId, t.clientType),
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
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
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
    index("documents_matter_id_idx").on(t.matterId),
  ],
);

// --- Phase 2 AI (RAG / conversations / KB). No API keys in plaintext. ---

/** Per-firm AI preferences. Keys live in env / vault (P2-02), not here. */
export const aiSettings = pgTable("ai_settings", {
  firmId: uuid("firm_id")
    .primaryKey()
    .references(() => firms.id, { onDelete: "cascade" }),
  /** gemini | claude | openai (Phase 2: gemini) */
  providerDefault: text("provider_default").notNull().default("gemini"),
  /** e.g. gemini-2.0-flash */
  modelDefault: text("model_default").notNull().default("gemini-2.0-flash"),
  /** e.g. text-embedding-004 */
  embeddingsModel: text("embeddings_model").notNull().default("text-embedding-004"),
  webLookupEnabled: boolean("web_lookup_enabled").notNull().default(false),
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
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("trust_accounts_firm_id_idx").on(t.firmId),
    index("trust_accounts_firm_active_idx").on(t.firmId, t.isActive),
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
};
