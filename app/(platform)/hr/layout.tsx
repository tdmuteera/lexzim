import { HrModuleNav } from "@/components/hr/HrModuleNav";
import { ModuleTabMotion } from "@/components/shell/ModuleTabMotion";

export default function HrLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="module-with-tabs">
      <HrModuleNav />
      <ModuleTabMotion>{children}</ModuleTabMotion>
    </div>
  );
}
