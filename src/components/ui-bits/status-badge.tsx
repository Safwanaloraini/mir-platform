"use client";

import { cn } from "@/lib/utils";
import { statusBadgeClass } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  label: string;
  color: string;
  className?: string;
}

export function StatusBadge({ label, color, className }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn("border font-medium", statusBadgeClass(color), className)}>
      {label}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { label: string; color: string }> = {
    low: { label: "منخفضة", color: "slate" },
    medium: { label: "متوسطة", color: "sky" },
    high: { label: "عالية", color: "amber" },
    urgent: { label: "عاجلة", color: "red" },
  };
  const p = map[priority] ?? map.medium;
  return <StatusBadge label={p.label} color={p.color} />;
}
