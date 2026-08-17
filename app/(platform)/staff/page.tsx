import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { StaffView } from "@/components/staff/StaffView";

export default function StaffPage() {
  return (
    <ProtectedModulePage path="/staff">
      <StaffView />
    </ProtectedModulePage>
  );
}
