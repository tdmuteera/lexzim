import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { MyDayView } from "@/components/my-day/MyDayView";

export default function WorkflowMyDayPage() {
  return (
    <ProtectedModulePage path="/workflow/my-day">
      <MyDayView />
    </ProtectedModulePage>
  );
}
