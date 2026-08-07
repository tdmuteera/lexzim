import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { MattersListView } from "@/components/matters/MattersListView";

type PageProps = {
  searchParams: Promise<{ clientId?: string; bucket?: string }>;
};

export default async function MattersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return (
    <ProtectedModulePage path="/matters">
      <MattersListView
        initialClientId={params.clientId}
        initialBucket={params.bucket}
      />
    </ProtectedModulePage>
  );
}
