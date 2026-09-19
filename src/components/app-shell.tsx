"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { ViewRouter } from "@/components/view-router";
import { AppFooter } from "@/components/app-footer";
import type { CurrentUser } from "@/lib/client";
import { Loader2 } from "lucide-react";

export function AppShell({ userId }: { userId: string }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.user) setUser(d.user as CurrentUser);
        else router.refresh();
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [userId, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex flex-1">
        <AppSidebar user={user} />
        <div className="flex-1 flex flex-col min-w-0">
          <AppTopbar user={user} />
          <main className="flex-1 overflow-y-auto bg-mir-pattern">
            <ViewRouter user={user} />
          </main>
          <AppFooter org={user.org} />
        </div>
      </div>
    </div>
  );
}
