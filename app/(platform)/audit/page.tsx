import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { AuditLogView } from "@/components/audit/AuditLogView";

export default function AuditPage() {
  return (
    <ProtectedModulePage path="/audit">
      <AuditLogView />
    </ProtectedModulePage>
  );
}
