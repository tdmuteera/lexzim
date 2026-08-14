import { toCsv } from "@/lib/reports/csv";

type StatementLine = {
  occurredAt: string;
  entryType: string;
  amountCents: number;
  currency: string;
  runningBalanceCents?: number;
  accountName?: string | null;
  narrative?: string | null;
  reference?: string | null;
  matterTitle?: string | null;
};

export function trustStatementToCsv(
  clientName: string,
  balanceCents: number,
  currency: string,
  lines: StatementLine[],
): string {
  const header = toCsv(
    ["client", "currency", "closingBalanceCents"],
    [[clientName, currency, balanceCents]],
  );
  const detail = toCsv(
    [
      "occurredAt",
      "entryType",
      "amountCents",
      "runningBalanceCents",
      "account",
      "matter",
      "reference",
      "narrative",
    ],
    lines.map((line) => [
      line.occurredAt,
      line.entryType,
      line.amountCents,
      line.runningBalanceCents ?? "",
      line.accountName,
      line.matterTitle,
      line.reference,
      line.narrative,
    ]),
  );
  return `${header}\n${detail}`;
}
