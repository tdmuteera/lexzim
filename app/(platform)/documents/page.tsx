import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { DocumentsHubView } from "@/components/documents/DocumentsHubView";

export default function DocumentsPage() {
  return (
    <ProtectedModulePage path="/documents">
      <DocumentsHubView />
    </ProtectedModulePage>
  );
}
