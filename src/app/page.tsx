import { getCurrentUser } from "@/lib/session";
import { LoginScreen } from "@/components/login-screen";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) return <LoginScreen />;
  return <AppShell userId={user.id} />;
}
