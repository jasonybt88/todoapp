import { redirect } from "next/navigation";
import { AuthHome } from "@/components/AuthHome";
import { getSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return <AuthHome username={session.username} />;
}
