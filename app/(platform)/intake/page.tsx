import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { IntakeListView } from "@/components/intake/IntakeListView";

export default function IntakePage() {
  return (
    <ProtectedModulePage path="/intake">
      <IntakeListView />
    </ProtectedModulePage>
  );
}
