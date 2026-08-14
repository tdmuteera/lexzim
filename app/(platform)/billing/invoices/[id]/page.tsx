import { FinanceModuleNav } from "@/components/finance/FinanceModuleNav";
import { InvoiceDetailView } from "@/components/billing/InvoiceDetailView";
import { LEGACY_BILLING_LIST_PATH } from "@/lib/billing/paths";

type PageProps = { params: Promise<{ id: string }> };

/** Legacy alias for finance invoicing invoice detail (bookmarks preserved). */
export default async function LegacyInvoiceDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <div className="module-with-tabs">
      <FinanceModuleNav />
      <InvoiceDetailView invoiceId={id} listPath={LEGACY_BILLING_LIST_PATH} />
    </div>
  );
}
