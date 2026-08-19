import { FinanceModuleNav } from "@/components/finance/FinanceModuleNav";
import { ModuleTabMotion } from "@/components/shell/ModuleTabMotion";
import { UiAnomalyProbe } from "@/components/diagnostics/UiAnomalyProbe";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="module-with-tabs">
      <UiAnomalyProbe scope="finance" />
      <FinanceModuleNav />
      <ModuleTabMotion>{children}</ModuleTabMotion>
    </div>
  );
}
