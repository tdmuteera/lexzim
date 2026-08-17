import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { ClientsListView } from "@/components/clients/ClientsListView";

export default function ClientsPage() {
  return (
    <ProtectedModulePage path="/clients">
      <ClientsListView />
    </ProtectedModulePage>
  );
}
