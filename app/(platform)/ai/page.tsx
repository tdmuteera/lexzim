import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { LegalResearchChatView } from "@/components/ai/LegalResearchChatView";

export default function AiPage() {
  return (
    <ProtectedModulePage path="/ai">
      <LegalResearchChatView />
    </ProtectedModulePage>
  );
}
