/** Merge fields supported by LexZim starters (P1-08). Generation is P1-09. */

export const TEMPLATE_MERGE_FIELDS = [
  "CLIENT_NAME",
  "CLIENT_ADDRESS",
  "OPPOSING_PARTY",
  "COURT_NAME",
  "CASE_NUMBER",
  "MATTER_TITLE",
  "FILE_REF",
  "LAWYER_NAME",
  "FIRM_NAME",
  "DATE",
  "TODAY",
] as const;

export type TemplateMergeField = (typeof TEMPLATE_MERGE_FIELDS)[number];

export function mergeFieldToken(field: TemplateMergeField | string): string {
  return `{{${field}}}`;
}
