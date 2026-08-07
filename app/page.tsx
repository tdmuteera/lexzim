import { redirect } from "next/navigation";
import { authCurrentUser, authNeedsSetup } from "@/lib/auth/service";

export default async function Home() {
  if (await authNeedsSetup()) {
    redirect("/setup");
  }
  if (!(await authCurrentUser())) {
    redirect("/login");
  }
  redirect("/dashboard");
}
