import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { ApprovalsInboxView } from "@/components/workflow/ApprovalsInboxView";

export default function WorkflowApprovalsPage() {
  return (
    <ProtectedModulePage path="/workflow/approvals">
      <ApprovalsInboxView />
    </ProtectedModulePage>
  );
}
