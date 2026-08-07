import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { MatterDetailView } from "@/components/matters/MatterDetailView";
import { serializeMatter } from "@/lib/matters/serialize";
import { serializeMatterEvent } from "@/lib/timeline/serialize";
import { listMatterEvents } from "@/lib/repos/timeline";
import { getMatterById, userCanAccessMatter } from "@/lib/repos/matters";
import { canViewAllMatters } from "@/lib/rbac/guards";
import { requireRouteAccess } from "@/lib/rbac/route-access";
import { tenantFirmId } from "@/lib/tenant/scope";

type PageProps = { params: Promise<{ id: string }> };

export default async function MatterDetailPage({ params }: PageProps) {
  const session = await requireRouteAccess("/matters");
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

  const events = await listMatterEvents(firmId, id);
  const matter = serializeMatter(row, {
    clientDisplayName: row.clientDisplayName,
    responsibleLawyerName: row.responsibleLawyerName,
  });

  return (
    <ProtectedModulePage path="/matters">
      <MatterDetailView
        matter={matter}
        events={events.map((e) =>
          serializeMatterEvent(e, { createdByName: e.createdByName }),
        )}
      />
    </ProtectedModulePage>
  );
}
