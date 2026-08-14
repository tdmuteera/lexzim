import Link from "next/link";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { ClientForm } from "@/components/clients/ClientForm";
import { requirePermission } from "@/lib/rbac/guards";
import { AuthError } from "@/lib/auth/types";

export default async function NewClientPage() {
  try {
    await requirePermission("clients.create");
  } catch (err) {
    if (err instanceof AuthError && err.code === "forbidden") {
      return <AccessDenied permission="clients.create" />;
    }
    throw err;
  }

  return (
    <section className="view active scrollable" aria-label="New client">
      <div className="panel">
        <div className="panel-head">
          <h3>New client (KYC intake)</h3>
          <Link href="/clients" className="btn btn-outline btn-sm">
            Back
          </Link>
        </div>
        <div className="panel-body">
          <ClientForm mode="create" />
        </div>
      </div>
    </section>
  );
}
