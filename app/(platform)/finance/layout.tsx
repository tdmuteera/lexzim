import { FinanceModuleNav } from "@/components/finance/FinanceModuleNav";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="module-with-tabs">
      <FinanceModuleNav />
      {children}
    </div>
  );
}
