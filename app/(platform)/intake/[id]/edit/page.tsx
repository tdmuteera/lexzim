import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { IntakeEditLoader } from "@/components/intake/IntakeEditLoader";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditIntakePage({ params }: PageProps) {
  const { id } = await params;
  return (
    <ProtectedModulePage path="/intake">
      <section className="view active scrollable">
        <IntakeEditLoader intakeId={id} />
      </section>
    </ProtectedModulePage>
  );
}
