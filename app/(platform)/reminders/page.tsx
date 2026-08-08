import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { RemindersCenter } from "@/components/reminders/RemindersCenter";

export default function RemindersPage() {
  return (
    <ProtectedModulePage path="/reminders">
      <RemindersCenter />
    </ProtectedModulePage>
  );
}
