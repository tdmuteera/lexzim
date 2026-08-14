import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { MatterForm } from "@/components/matters/MatterForm";
import { AuthError } from "@/lib/auth/types";
import { toMatterFormValues } from "@/lib/matters/form-values";
import { serializeMatter } from "@/lib/matters/serialize";
import { getMatterById, userCanAccessMatter } from "@/lib/repos/matters";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditMatterPage({ params }: PageProps) {
  let session;
  try {
    session = await requirePermission("matters.edit");
  } catch (err) {
    if (err instanceof AuthError && err.code === "forbidden") {
      return <AccessDenied permission="matters.edit" />;
    }
    throw err;
  }

  const firmId = tenantFirmId(session);
  const { id } = await params;
  const viewAll = canViewAllMatters(session);

  const allowed = await userCanAccessMatter(firmId, id, session.id, viewAll);
  if (!allowed) {
    const exists = await getMatterById(firmId, id);
    if (!exists) notFound();
    return <AccessDenied permission="matters.view_all" />;
  }

  const row = await getMatterById(firmId, id);
  if (!row) notFound();

  const matter = serializeMatter(row, {
    clientDisplayName: row.clientDisplayName,
    responsibleLawyerName: row.responsibleLawyerName,
  });

  return (
    <section className="view active scrollable" aria-label="Edit matter">
      <div className="panel">
        <div className="panel-head">
          <h3>Edit matter</h3>
          <Link href={`/matters/${id}`} className="btn btn-outline btn-sm">
            Back
          </Link>
        </div>
        <div className="panel-body">
          <MatterForm
            mode="edit"
            matterId={id}
            initialValues={toMatterFormValues(matter)}
            lockClient
          />
        </div>
      </div>
    </section>
  );
}
