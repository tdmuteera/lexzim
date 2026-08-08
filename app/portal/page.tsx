import Link from "next/link";
import { redirect } from "next/navigation";
import { portalCurrentUser } from "@/lib/portal/auth";
import { getPortalStrategyNote, isPortalEnabled } from "@/lib/portal/config";

export default async function PortalLandingPage() {
  if (!isPortalEnabled()) return null;

  const user = await portalCurrentUser();
  if (user) redirect("/portal/home");

  return (
    <section className="portal-card">
      <h1>Client portal</h1>
      <p>
        View matters and documents your Zimbabwe law firm has <strong>explicitly shared</strong> with
        you. Nothing is shared by default.
      </p>
      <ul>
        <li>High-level matter status and next hearing date (when shared)</li>
        <li>Download of shared documents only</li>
        <li>No AI legal advice, trust ledgers, or internal timelines in this portal</li>
      </ul>
      <p className="muted">{getPortalStrategyNote()}</p>
      <p>
        <Link className="portal-btn" href="/portal/login">
          Sign in
        </Link>
      </p>
      <aside className="portal-disclaimer muted" style={{ fontSize: "0.85rem" }}>
        This portal is not a substitute for speaking with your lawyer. For account help, contact
        your firm.
      </aside>
    </section>
  );
}
