import {
  conveyancingCategoryLabel,
  proformaKindLabel,
  proformaStatusLabel,
  type ConveyancingCategory,
  type ProformaKind,
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
    notes: string | null;
    createdAt: Date;
  };
  clientDisplayLabel: string;
  matterTitle: string | null;
  matterNumber: string | null;
  totalCents: number;
  lines: Array<{
    id: string;
    lineCode: string;
    description: string;
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

export function serializeProformaListItem(row: ListRow) {
  const kind = row.proforma.kind as ProformaKind;
  const status = row.proforma.status as ProformaStatus;
  const cat = row.proforma.conveyancingCategory as ConveyancingCategory | null;
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
    totalCents: row.totalCents,
    createdAt: row.proforma.createdAt.toISOString(),
  };
}

export function serializeProformaDetail(row: ListRow) {
  return {
    ...serializeProformaListItem(row),
    notes: row.proforma.notes,
    lines: row.lines.map((l) => ({
      id: l.id,
      lineCode: l.lineCode,
      description: l.description,
      included: l.included,
      isOptional: l.isOptional,
      qty: l.qty,
      unitPriceCents: l.unitPriceCents,
      lineTotalCents: l.lineTotalCents,
      ratePct: l.ratePct,
      calcHint: l.calcHint,
      sortOrder: l.sortOrder,
    })),
  };
}
