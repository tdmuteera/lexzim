import { redirect } from "next/navigation";
import { authNeedsSetup } from "@/lib/auth/service";
import { SetupForm } from "@/components/auth/SetupForm";

export default async function SetupPage() {
  if (!(await authNeedsSetup())) {
    redirect("/login");
  }
  return <SetupForm />;
}
