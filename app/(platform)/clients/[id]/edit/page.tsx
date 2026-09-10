import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { ClientForm } from "@/components/clients/ClientForm";
import { AuthError } from "@/lib/auth/types";
import { toClientKycFormValues } from "@/lib/clients/kyc-form-values";
import { serializeClient } from "@/lib/clients/serialize";
import { getClientById, userCanAccessClient } from "@/lib/repos/clients";
import { canViewAllClients, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditClientPage({ params }: PageProps) {
  let session;
  try {
    session = await requirePermission("clients.edit");
  } catch (err) {
    if (err instanceof AuthError && err.code === "forbidden") {
      return <AccessDenied permission="clients.edit" />;
    }
    throw err;
  }

  const firmId = tenantFirmId(session);
  const { id } = await params;

  const row = await getClientById(firmId, id);
  if (!row) notFound();

  const allowed = await userCanAccessClient(
    firmId,
    id,
    session.id,
    canViewAllClients(session),
  );
  if (!allowed) {
    return (
      <AccessDenied
        title="Client not assigned to you"
        permission="clients.view_all"
      />
    );
  }

  const client = serializeClient(row);

  return (
    <section className="view active scrollable" aria-label="Edit client">
      <div className="panel">
        <div className="panel-head">
          <h3>Edit client KYC</h3>
          <Link href={`/clients/${id}`} className="btn btn-outline btn-sm">
            Back
          </Link>
        </div>
        <div className="panel-body">
          <ClientForm
            mode="edit"
            clientId={id}
            initialValues={toClientKycFormValues(client)}
          />
        </div>
      </div>
    </section>
  );
}
