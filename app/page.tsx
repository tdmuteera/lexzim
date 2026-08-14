import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { DbUnavailableView } from "@/components/system/DbUnavailableView";
import { authCurrentUser, authNeedsSetup } from "@/lib/auth/service";
import { getDbUnavailableFromError } from "@/lib/db/connectivity";
import { prepareDbRetry } from "@/lib/db";

type PageProps = {
  searchParams: Promise<{ db_retry?: string }>;
};

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  if (params.db_retry) {
    prepareDbRetry();
  }

  try {
    if (await authNeedsSetup()) {
      redirect("/setup");
    }
    if (!(await authCurrentUser())) {
      redirect("/login");
    }
    redirect("/dashboard");
  } catch (err) {
    const unavailable = getDbUnavailableFromError(err, isRedirectError);
    if (unavailable) {
      return <DbUnavailableView detail={unavailable.message} retryHref="/?db_retry=1" />;
    }
    throw err;
  }
}
