import { OpsDiagnostics } from "@/components/ops/OpsDiagnostics";

export const metadata = {
  title: "LexZim Ops · Diagnostics",
  robots: { index: false, follow: false },
};

export default function OpsDiagnosticsPage() {
  return <OpsDiagnostics />;
}
