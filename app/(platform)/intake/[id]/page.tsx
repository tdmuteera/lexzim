import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { IntakeDetailView } from "@/components/intake/IntakeDetailView";

type PageProps = { params: Promise<{ id: string }> };

export default async function IntakeDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <ProtectedModulePage path="/intake">
      <IntakeDetailView intakeId={id} />
    </ProtectedModulePage>
  );
}
