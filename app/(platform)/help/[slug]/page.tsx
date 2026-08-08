import { ProtectedModulePage } from "@/components/shell/ProtectedModulePage";
import { HelpDocView } from "@/components/help/HelpDocView";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function HelpDocPage({ params }: PageProps) {
  const { slug } = await params;
  return (
    <ProtectedModulePage path="/help">
      <HelpDocView slug={slug} />
    </ProtectedModulePage>
  );
}
