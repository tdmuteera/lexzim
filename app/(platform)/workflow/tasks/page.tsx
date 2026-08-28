import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { TasksShellView } from "@/components/workflow/TasksShellView";

export default function WorkflowTasksPage() {
  return (
    <ProtectedModulePage path="/workflow/tasks">
      <TasksShellView />
    </ProtectedModulePage>
  );
}
