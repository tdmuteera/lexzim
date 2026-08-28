import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { KnowledgeReportsView } from "@/components/knowledge/KnowledgeReportsView";

export default function KnowledgeReportsPage() {
  return (
    <ProtectedModulePage path="/knowledge/reports">
      <KnowledgeReportsView />
    </ProtectedModulePage>
  );
}
