import Link from "next/link";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { MatterForm } from "@/components/matters/MatterForm";
import { AuthError } from "@/lib/auth/types";
import { requirePermission } from "@/lib/rbac/guards";

type PageProps = {
  searchParams: Promise<{ clientId?: string }>;
};

export default async function NewMatterPage({ searchParams }: PageProps) {
  try {
    await requirePermission("matters.create");
  } catch (err) {
    if (err instanceof AuthError && err.code === "forbidden") {
      return <AccessDenied permission="matters.create" />;
    }
    throw err;
  }

  const params = await searchParams;
  const clientId = params.clientId?.trim() || "";

  return (
    <section className="view active scrollable" aria-label="New matter">
      <div className="panel">
        <div className="panel-head">
          <h3>New matter</h3>
          <Link href="/matters" className="btn btn-outline btn-sm">
            Back
          </Link>
        </div>
        <div className="panel-body">
          <MatterForm
            mode="create"
            initialValues={clientId ? { clientId } : undefined}
          />
        </div>
      </div>
    </section>
  );
}
