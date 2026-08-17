import Link from "next/link";
import type { ReactNode } from "react";
import "@/styles/ops.css";

export const metadata = {
  title: "LexZim Ops",
  robots: { index: false, follow: false },
};

export default function OpsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="ops-shell">
      <header className="ops-header">
        <div className="ops-brand">
          <strong>LexZim Ops</strong>
          <span>Platform operators only · no matter contents</span>
        </div>
        <nav className="ops-nav">
          <Link href="/ops">Dashboard</Link>
          <Link href="/ops/diagnostics">Diagnostics</Link>
          <Link href="/login">Staff login</Link>
        </nav>
      </header>
      <main className="ops-main">{children}</main>
    </div>
  );
}
