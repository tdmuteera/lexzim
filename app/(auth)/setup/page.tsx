import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { SetupForm } from "@/components/auth/SetupForm";
import { DbUnavailableView } from "@/components/system/DbUnavailableView";
import { authNeedsSetup } from "@/lib/auth/service";
import { getDbUnavailableFromError } from "@/lib/db/connectivity";
import { prepareDbRetry } from "@/lib/db";

type PageProps = {
  searchParams: Promise<{ db_retry?: string }>;
};

export default async function SetupPage({ searchParams }: PageProps) {
  const params = await searchParams;
  if (params.db_retry) {
    prepareDbRetry();
  }

  try {
    if (!(await authNeedsSetup())) {
      redirect("/login");
    }
    return <SetupForm />;
  } catch (err) {
    const unavailable = getDbUnavailableFromError(err, isRedirectError);
    if (unavailable) {
      return (
        <DbUnavailableView detail={unavailable.message} retryHref="/setup?db_retry=1" />
      );
    }
    throw err;
  }
}
