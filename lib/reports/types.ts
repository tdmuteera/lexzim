export const REPORT_TYPES = [
  "ar-aging",
  "time",
  "trust-balances",
  "trust-movements",
  "workload",
  "upcoming",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export function isReportType(value: string): value is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(value);
}
