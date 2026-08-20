import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { ClientForm } from "@/components/clients/ClientForm";
import { toClientFormValues } from "@/components/clients/ClientDetailView";
import { AuthError } from "@/lib/auth/types";
import { serializeClient } from "@/lib/clients/serialize";
import { getClientById } from "@/lib/repos/clients";
import { requirePermission } from "@/lib/rbac/guards";
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
            initialValues={toClientFormValues(client)}
          />
        </div>
      </div>
    </section>
  );
}
