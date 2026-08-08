import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { HelpView } from "@/components/help/HelpView";

export default function HelpPage() {
  return (
    <ProtectedModulePage path="/help">
      <HelpView />
    </ProtectedModulePage>
  );
}
