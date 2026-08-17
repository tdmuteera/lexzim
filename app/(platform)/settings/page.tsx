import { Suspense } from "react";
import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { SettingsView } from "@/components/settings/SettingsView";

export default function SettingsPage() {
  return (
    <ProtectedModulePage path="/settings">
      <Suspense fallback={<p className="muted">Loading settings…</p>}>
        <SettingsView />
      </Suspense>
    </ProtectedModulePage>
  );
}
