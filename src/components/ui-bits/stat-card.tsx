"use client";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: string; up: boolean };
  color?: "primary" | "orange" | "green" | "red" | "amber" | "violet";
  subtitle?: string;
}

const colorMap = {
  primary: "bg-primary/10 text-primary",
  orange: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  green: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  red: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
};

export function StatCard({ label, value, icon: Icon, trend, color = "primary", subtitle }: StatCardProps) {
  return (
    <Card className="p-4 lg:p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-black text-foreground nums truncate">{value}</div>
          {subtitle && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</div>}
          {trend && (
            <div className={cn("mt-2 inline-flex items-center gap-1 text-xs font-medium", trend.up ? "text-green-600" : "text-red-600")}>
              {trend.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
              <span className="nums">{trend.value}</span>
            </div>
          )}
        </div>
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", colorMap[color])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="font-bold text-foreground">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-black text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function SectionCard({ title, children, action, className }: { title?: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("p-4 lg:p-5", className)}>
      {title && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </Card>
  );
}
