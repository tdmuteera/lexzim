import { HrModuleNav } from "@/components/hr/HrModuleNav";

export default function HrLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="module-with-tabs">
      <HrModuleNav />
      {children}
    </div>
  );
}
