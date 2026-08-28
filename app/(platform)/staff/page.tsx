import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { StaffView } from "@/components/staff/StaffView";

export default function StaffPage() {
  return (
    <ProtectedModulePage path="/staff">
      <div className="hr-module-root">
        <StaffView />
      </div>
    </ProtectedModulePage>
  );
}
