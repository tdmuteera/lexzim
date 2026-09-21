import {
  conveyancingCategoryLabel,
  moneyClassLabel,
  proformaKindLabel,
  proformaStatusLabel,
  type ConveyancingCategory,
  type ProformaKind,
  type ProformaMoneyClass,
  type ProformaStatus,
} from "@/lib/proforma/types";

type ListRow = {
  proforma: {
    id: string;
    proformaNumber: string;
    kind: string;
    conveyancingCategory: string | null;
    status: string;
    currency: string;
    clientId: string;
    matterId: string | null;
    propertyValueCents: number | null;
    subject: string | null;
    notes: string | null;
    createdAt: Date;
  };
  clientDisplayLabel: string;
  matterTitle: string | null;
  matterNumber: string | null;
  totalCents: number;
  firmIncomeCents: number;
  clientCollectibleCents: number;
  lines: Array<{
    id: string;
    lineCode: string;
    description: string;
    moneyClass: string;
    included: boolean;
    isOptional: boolean;
    qty: number;
    unitPriceCents: number;
    lineTotalCents: number;
    ratePct: number | null;
    calcHint: string | null;
    sortOrder: number;
  }>;
};

function sumClasses(lines: ListRow["lines"]) {
  let firmIncomeCents = 0;
  let clientCollectibleCents = 0;
  let totalCents = 0;
  for (const l of lines) {
    if (!l.included) continue;
    totalCents += l.lineTotalCents;
    if (l.moneyClass === "firm_income") firmIncomeCents += l.lineTotalCents;
    else clientCollectibleCents += l.lineTotalCents;
  }
  return { firmIncomeCents, clientCollectibleCents, totalCents };
}

export function serializeProformaListItem(row: ListRow) {
  const kind = row.proforma.kind as ProformaKind;
  const status = row.proforma.status as ProformaStatus;
  const cat = row.proforma.conveyancingCategory as ConveyancingCategory | null;
  const sums =
    row.firmIncomeCents != null && row.clientCollectibleCents != null
      ? {
          firmIncomeCents: row.firmIncomeCents,
          clientCollectibleCents: row.clientCollectibleCents,
          totalCents: row.totalCents,
        }
      : sumClasses(row.lines);
  return {
    id: row.proforma.id,
    proformaNumber: row.proforma.proformaNumber,
    kind,
    kindLabel: proformaKindLabel(kind),
    conveyancingCategory: cat,
    conveyancingCategoryLabel: cat ? conveyancingCategoryLabel(cat) : null,
    status,
    statusLabel: proformaStatusLabel(status),
    currency: row.proforma.currency,
    clientId: row.proforma.clientId,
    clientDisplayLabel: row.clientDisplayLabel,
    matterId: row.proforma.matterId,
    matterTitle: row.matterTitle,
    matterNumber: row.matterNumber,
    propertyValueCents: row.proforma.propertyValueCents,
    subject: row.proforma.subject,
    totalCents: sums.totalCents,
    firmIncomeCents: sums.firmIncomeCents,
    clientCollectibleCents: sums.clientCollectibleCents,
    createdAt: row.proforma.createdAt.toISOString(),
  };
}

export function serializeProformaDetail(row: ListRow) {
  return {
    ...serializeProformaListItem(row),
    notes: row.proforma.notes,
    lines: row.lines.map((l) => {
      const moneyClass = (l.moneyClass || "client_collectible") as ProformaMoneyClass;
      return {
        id: l.id,
        lineCode: l.lineCode,
        description: l.description,
        moneyClass,
        moneyClassLabel: moneyClassLabel(moneyClass),
        included: l.included,
        isOptional: l.isOptional,
        qty: l.qty,
        unitPriceCents: l.unitPriceCents,
        lineTotalCents: l.lineTotalCents,
        ratePct: l.ratePct,
        calcHint: l.calcHint,
        sortOrder: l.sortOrder,
      };
    }),
  };
}
