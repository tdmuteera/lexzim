import Link from "next/link";
import { redirect } from "next/navigation";
import { PortalSharedWorkspace } from "@/components/portal/PortalSharedWorkspace";
import { portalCurrentUser, portalLogout } from "@/lib/portal/auth";
import { isPortalEnabled } from "@/lib/portal/config";

async function signOutAction() {
  "use server";
  await portalLogout();
  redirect("/portal/login");
}

export default async function PortalHomePage() {
  if (!isPortalEnabled()) return null;

  const user = await portalCurrentUser();
  if (!user) redirect("/portal/login");

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <section className="portal-card">
        <h1 style={{ margin: 0 }}>Hello, {user.fullName}</h1>
        <p style={{ margin: 0 }}>
          Signed in to <strong>{user.firmName}</strong> as{" "}
          <strong>{user.clientDisplayName}</strong>.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <form action={signOutAction}>
            <button type="submit" className="portal-btn">
              Sign out
            </button>
          </form>
          <Link href="/portal">About this portal</Link>
        </div>
      </section>

      <PortalSharedWorkspace />
    </div>
  );
}
