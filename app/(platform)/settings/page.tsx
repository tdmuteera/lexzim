import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { SettingsView } from "@/components/settings/SettingsView";

export default function SettingsPage() {
  return (
    <ProtectedModulePage path="/settings">
      <SettingsView />
    </ProtectedModulePage>
  );
}
