"use client";

import { useState } from "react";
import Link from "next/link";
import { useNav, type ViewKey } from "@/lib/store";
import { canClient } from "@/lib/client";
import type { CurrentUser } from "@/lib/client";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ListTodo,
  Trello,
  Calendar,
  FileText,
  CheckCircle2,
  Wallet,
  Users2,
  Building2,
  Users,
  BarChart3,
  Bell,
  ScrollText,
  Settings,
  ShieldCheck,
  ChevronLeft,
  Clock,
  UserCog,
} from "lucide-react";

interface NavItem {
  view: ViewKey;
  label: string;
  icon: any;
  perm?: Permission;
  badge?: string;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "الرئيسية",
    items: [
      { view: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
      { view: "mywork", label: "أعمالي", icon: ListTodo },
    ],
  },
  {
    title: "المهام",
    items: [
      { view: "tasks", label: "قائمة المهام", icon: ListTodo },
      { view: "kanban", label: "لوحة كانبان", icon: Trello },
      { view: "calendar", label: "التقويم", icon: Calendar },
    ],
  },
  {
    title: "الطلبات والاعتمادات",
    items: [
      { view: "requests", label: "الطلبات", icon: FileText, perm: "request.view.all" },
      { view: "approvals", label: "صندوق الاعتمادات", icon: CheckCircle2, perm: "request.approve" },
    ],
  },
  {
    title: "المالية",
    items: [
      { view: "finance", label: "المالية والمحاسبة", icon: Wallet, perm: "finance.view" },
      { view: "vendors", label: "الموردون والعملاء", icon: Users2, perm: "finance.view" },
      { view: "cost-centers", label: "مراكز التكلفة والميزانيات", icon: Building2, perm: "finance.view" },
    ],
  },
  {
    title: "الاجتماعات والتنظيم",
    items: [
      { view: "meetings", label: "الاجتماعات والقرارات", icon: Users, perm: "meeting.create" },
      { view: "reports", label: "التقارير", icon: BarChart3, perm: "report.view" },
    ],
  },
  {
    title: "النظام",
    items: [
      { view: "notifications", label: "الإشعارات", icon: Bell },
      { view: "audit", label: "سجل التدقيق", icon: ScrollText, perm: "audit.view" },
      { view: "users", label: "المستخدمون والصلاحيات", icon: UserCog, perm: "users.manage" },
      { view: "settings-general", label: "الإعدادات", icon: Settings, perm: "settings.manage" },
    ],
  },
];

export function AppSidebar({ user }: { user: CurrentUser }) {
  const { view, setView } = useNav();
  const [collapsed, setCollapsed] = useCollapsed();

  return (
    <aside
      className={cn(
        "shrink-0 sticky top-0 h-screen bg-sidebar text-sidebar-foreground border-l border-sidebar-border flex flex-col transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* الهوية */}
      <div className="h-16 flex items-center gap-3 px-4 border-b border-sidebar-border shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpeg" alt="شعار منصة متابعة المهام" className="h-9 w-9 rounded-lg object-cover shadow shrink-0" />
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-black text-sm leading-tight text-white truncate">منصة متابعة المهام</div>
            <div className="text-[11px] text-sidebar-foreground/70 truncate">{user.org.name}</div>
          </div>
        )}
      </div>

      {/* القائمة */}
      <nav className="flex-1 overflow-y-auto scrollbar-mir py-3 px-2">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((it) => !it.perm || canClient(user, it.perm));
          if (items.length === 0) return null;
          return (
            <div key={group.title} className="mb-3">
              {!collapsed && (
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/50">
                  {group.title}
                </div>
              )}
              <div className="space-y-0.5">
                {items.map((it) => {
                  const active = view === it.view || view.startsWith(it.view + "-");
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.view}
                      onClick={() => setView(it.view)}
                      title={collapsed ? it.label : undefined}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors group",
                        active
                          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                          : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <Icon className="h-4.5 w-4.5 shrink-0" style={{ width: 18, height: 18 }} />
                      {!collapsed && <span className="truncate">{it.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* زر الطي */}
      <div className="p-2 border-t border-sidebar-border shrink-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent transition"
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          {!collapsed && <span>طي القائمة</span>}
        </button>
      </div>
    </aside>
  );
}

// خطّاف بسيط لحفظ حالة الطي
function useCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  return [collapsed, setCollapsed] as const;
}
