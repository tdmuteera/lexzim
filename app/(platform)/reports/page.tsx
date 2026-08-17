import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { ReportsView } from "@/components/reports/ReportsView";

export default function ReportsPage() {
  return (
    <ProtectedModulePage path="/reports">
      <ReportsView />
    </ProtectedModulePage>
  );
}
