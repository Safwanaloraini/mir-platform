"use client";

import { useNav } from "@/lib/store";
import { DashboardView } from "@/components/views/dashboard-view";
import { MyWorkView } from "@/components/views/mywork-view";
import { TasksView } from "@/components/views/tasks-view";
import { TaskDetailView } from "@/components/views/task-detail-view";
import { TaskNewView } from "@/components/views/task-new-view";
import { KanbanView } from "@/components/views/kanban-view";
import { CalendarView } from "@/components/views/calendar-view";
import { RequestsView } from "@/components/views/requests-view";
import { RequestDetailView } from "@/components/views/request-detail-view";
import { ApprovalsView } from "@/components/views/approvals-view";
import { FinanceView } from "@/components/views/finance-view";
import { VendorsView } from "@/components/views/vendors-view";
import { CostCentersView } from "@/components/views/cost-centers-view";
import { MeetingsView } from "@/components/views/meetings-view";
import { MeetingDetailView } from "@/components/views/meeting-detail-view";
import { ReportsView } from "@/components/views/reports-view";
import { NotificationsView } from "@/components/views/notifications-view";
import { AuditView } from "@/components/views/audit-view";
import { UsersView } from "@/components/views/users-view";
import { SettingsGeneralView } from "@/components/views/settings-views";
import { ProfileView } from "@/components/views/profile-view";
import type { CurrentUser } from "@/lib/client";

export function ViewRouter({ user }: { user: CurrentUser }) {
  const { view } = useNav();

  switch (view) {
    case "dashboard":
      return <DashboardView user={user} />;
    case "mywork":
      return <MyWorkView user={user} />;
    case "tasks":
      return <TasksView user={user} />;
    case "task-detail":
      return <TaskDetailView user={user} />;
    case "task-new":
      return <TaskNewView user={user} />;
    case "kanban":
      return <KanbanView user={user} />;
    case "calendar":
      return <CalendarView user={user} />;
    case "requests":
      return <RequestsView user={user} />;
    case "request-detail":
      return <RequestDetailView user={user} />;
    case "approvals":
      return <ApprovalsView user={user} />;
    case "finance":
      return <FinanceView user={user} />;
    case "vendors":
      return <VendorsView user={user} />;
    case "cost-centers":
      return <CostCentersView user={user} />;
    case "meetings":
      return <MeetingsView user={user} />;
    case "meeting-detail":
      return <MeetingDetailView user={user} />;
    case "reports":
      return <ReportsView user={user} />;
    case "notifications":
      return <NotificationsView user={user} />;
    case "audit":
      return <AuditView user={user} />;
    case "users":
      return <UsersView user={user} />;
    case "settings-general":
      return <SettingsGeneralView user={user} />;
    case "profile":
      return <ProfileView user={user} />;
    default:
      return <DashboardView user={user} />;
  }
}
