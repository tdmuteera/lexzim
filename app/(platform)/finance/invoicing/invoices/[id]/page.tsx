import { InvoiceDetailView } from "@/components/billing/InvoiceDetailView";

type PageProps = { params: Promise<{ id: string }> };

export default async function FinanceInvoiceDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <InvoiceDetailView invoiceId={id} />;
}
