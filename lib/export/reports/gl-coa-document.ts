import "server-only";

import type { ExportDocument } from "@/lib/export/types";
import { listGlAccounts } from "@/lib/gl/accounts";

export async function chartOfAccountsToExportDocument(firmId: string): Promise<ExportDocument> {
  const accounts = await listGlAccounts(firmId);
  return {
    title: "Chart of Accounts",
    subtitle: "Firm general ledger account listing",
    columns: [
      { key: "code", header: "Code" },
      { key: "name", header: "Account" },
      { key: "type", header: "Type" },
      { key: "normalBalance", header: "Normal balance" },
      { key: "status", header: "Status" },
    ],
    rows: accounts.map((a) => ({
      code: a.code,
      name: a.name,
      type: a.type,
      normalBalance: a.normalBalance,
      status: a.isActive ? "Active" : "Inactive",
    })),
  };
}
