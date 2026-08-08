import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { IntakeForm } from "@/components/intake/IntakeForm";

export default function NewIntakePage() {
  return (
    <ProtectedModulePage path="/intake">
      <section className="view active scrollable">
        <IntakeForm mode="create" />
      </section>
    </ProtectedModulePage>
  );
}
