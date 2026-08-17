import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { CalendarView } from "@/components/calendar/CalendarView";

export default function CalendarPage() {
  return (
    <ProtectedModulePage path="/calendar">
      <CalendarView />
    </ProtectedModulePage>
  );
}
