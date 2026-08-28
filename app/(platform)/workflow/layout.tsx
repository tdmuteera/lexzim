import { WorkflowModuleNav } from "@/components/workflow/WorkflowModuleNav";
import { ModuleTabMotion } from "@/components/shell/ModuleTabMotion";

export default function WorkflowLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="module-with-tabs workflow-module-root">
      <WorkflowModuleNav />
      <ModuleTabMotion>{children}</ModuleTabMotion>
    </div>
  );
}
