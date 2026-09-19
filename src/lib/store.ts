"use client";

import { create } from "zustand";

export type ViewKey =
  | "dashboard"
  | "mywork"
  | "tasks"
  | "task-detail"
  | "task-new"
  | "kanban"
  | "calendar"
  | "requests"
  | "request-detail"
  | "approvals"
  | "finance"
  | "vendors"
  | "cost-centers"
  | "meetings"
  | "meeting-detail"
  | "reports"
  | "notifications"
  | "audit"
  | "users"
  | "settings-approvals"
  | "settings-escalation"
  | "settings-general"
  | "profile";

interface NavState {
  view: ViewKey;
  params: Record<string, string>;
  setView: (view: ViewKey, params?: Record<string, string>) => void;
  openDetail: (view: ViewKey, id: string) => void;
  filters: Record<string, string>;
  setFilter: (key: string, value: string) => void;
  clearFilters: () => void;
}

export const useNav = create<NavState>((set) => ({
  view: "dashboard",
  params: {},
  setView: (view, params = {}) => set({ view, params }),
  openDetail: (view, id) => set({ view, params: { id } }),
  filters: {},
  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),
  clearFilters: () => set({ filters: {} }),
}));
