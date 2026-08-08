import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { TrustView } from "@/components/trust/TrustView";

export default function TrustPage() {
  return (
    <ProtectedModulePage path="/trust">
      <TrustView />
    </ProtectedModulePage>
  );
}
