import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { DashboardView } from "@/components/dashboard/DashboardView";

export default function DashboardPage() {
  return (
    <ProtectedModulePage path="/dashboard">
      <DashboardView />
    </ProtectedModulePage>
  );
}
