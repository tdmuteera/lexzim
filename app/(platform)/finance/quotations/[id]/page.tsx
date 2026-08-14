import { QuotationDetailView } from "@/components/finance/QuotationDetailView";

type PageProps = { params: Promise<{ id: string }> };

export default async function QuotationDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <QuotationDetailView quotationId={id} />;
}
