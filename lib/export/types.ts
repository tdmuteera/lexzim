import "server-only";

/** Supported server export formats (Phase 7 P7-02). */
export const EXPORT_FORMATS = ["pdf", "docx", "xlsx", "csv"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export type ExportTableColumn = {
  key: string;
  header: string;
  width?: number;
  align?: "left" | "right";
};

/** Structured tabular document for PDF/DOCX/XLSX renderers. */
export type ExportDocument = {
  title: string;
  subtitle?: string;
  note?: string;
  asOf?: string;
  columns: ExportTableColumn[];
  rows: Array<Record<string, string>>;
  summaryLines?: string[];
};

export type FirmExportBranding = {
  firmId: string;
  firmName: string;
  logoUrl: string | null;
  addressLines: string[];
  contactEmail: string | null;
  contactPhone: string | null;
  footerNote: string;
};

export type ExportRenderOptions = {
  branding: FirmExportBranding;
  document: ExportDocument;
};

export function isExportFormat(value: string | null): value is ExportFormat {
  return typeof value === "string" && (EXPORT_FORMATS as readonly string[]).includes(value);
}

export function exportMimeType(format: ExportFormat): string {
  switch (format) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "csv":
      return "text/csv; charset=utf-8";
  }
}

export function exportFileExtension(format: ExportFormat): string {
  return format === "docx" ? "docx" : format;
}
