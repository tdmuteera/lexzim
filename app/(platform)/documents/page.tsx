import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { TemplatesLibraryView } from "@/components/templates/TemplatesLibraryView";

export default function DocumentsPage() {
  return (
    <ProtectedModulePage path="/documents">
      <TemplatesLibraryView />
    </ProtectedModulePage>
  );
}
