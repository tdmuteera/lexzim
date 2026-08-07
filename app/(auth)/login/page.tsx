import { redirect } from "next/navigation";
import { authCurrentUser, authNeedsSetup } from "@/lib/auth/service";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage() {
  if (await authNeedsSetup()) {
    redirect("/setup");
  }
  if (await authCurrentUser()) {
    redirect("/dashboard");
  }
  return <LoginForm />;
}
