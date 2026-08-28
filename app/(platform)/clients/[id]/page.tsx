import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { ClientDetailView } from "@/components/clients/ClientDetailView";
import { serializeClient } from "@/lib/clients/serialize";
import { serializeMatter } from "@/lib/matters/serialize";
import { getClientById } from "@/lib/repos/clients";
import { canViewAllMatters } from "@/lib/rbac/guards";
import { getMatterCountsForClient, listFirmLawyers, listMatters } from "@/lib/repos/matters";
import { requireRouteAccess } from "@/lib/rbac/route-access";
import { tenantFirmId } from "@/lib/tenant/scope";

type PageProps = { params: Promise<{ id: string }> };

export default async function ClientDetailPage({ params }: PageProps) {
  const session = await requireRouteAccess("/clients");
  const firmId = tenantFirmId(session);
  const { id } = await params;

  const row = await getClientById(firmId, id);
  if (!row) notFound();

  const viewAll = canViewAllMatters(session);
  const matterCounts = await getMatterCountsForClient(firmId, id, {
    viewAll,
    userId: session.id,
  });
  const matterRows = await listMatters(firmId, {
    clientId: id,
    bucket: "all",
    viewAll,
    userId: session.id,
    sort: "updated",
    sortDir: "desc",
  });
  const client = serializeClient(row);
  const lawyers = await listFirmLawyers(firmId);
  const responsibleLawyerName =
    lawyers.find((lawyer) => lawyer.id === client.responsibleLawyerId)?.fullName ?? null;

  return (
    <ProtectedModulePage path="/clients">
      <Suspense fallback={<p className="muted">Loading client…</p>}>
        <ClientDetailView
          client={{ ...client, responsibleLawyerName }}
          matterCounts={matterCounts}
          matters={matterRows.map((m) => {
            const s = serializeMatter(m, {
              clientDisplayName: m.clientDisplayName,
              responsibleLawyerName: m.responsibleLawyerName,
            });
            return {
              id: s.id,
              title: s.title,
              status: s.status,
              statusLabel: s.statusLabel,
              areaOfLaw: s.areaOfLaw,
              matterNumber: s.matterNumber,
            };
          })}
        />
      </Suspense>
    </ProtectedModulePage>
  );
}
