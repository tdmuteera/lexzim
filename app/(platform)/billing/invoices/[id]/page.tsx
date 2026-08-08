import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { InvoiceDetailView } from "@/components/billing/InvoiceDetailView";

type PageProps = { params: Promise<{ id: string }> };

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <ProtectedModulePage path="/billing">
      <InvoiceDetailView invoiceId={id} />
    </ProtectedModulePage>
  );
}
