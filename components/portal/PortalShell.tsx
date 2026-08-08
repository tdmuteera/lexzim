import type { ReactNode } from "react";
import Link from "next/link";

/** Minimal portal chrome. Separate from staff AppShell (P5-02). */
export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="portal-shell" aria-label="LexZim client portal">
      <header className="portal-header">
        <div className="portal-brand">
          <strong>LexZim</strong>
          <span>Client portal</span>
        </div>
        <nav className="portal-nav" aria-label="Portal">
          <Link href="/portal">Home</Link>
          <Link href="/portal/home">My access</Link>
          <Link href="/portal/login">Sign in</Link>
        </nav>
      </header>
      <main className="portal-main">{children}</main>
      <footer className="portal-footer">
        <p>
          Limited client access. Matters and documents appear only when your law firm shares them.
          Nothing is shared by default.
        </p>
        <p>
          <Link href="/login">Firm staff sign in</Link>
          {" · "}
          <span className="muted">Portal auth is separate from staff LexZim accounts.</span>
        </p>
      </footer>
    </div>
  );
}
