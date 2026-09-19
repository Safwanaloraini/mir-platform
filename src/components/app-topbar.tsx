"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Search, Plus, Bell, LogOut, User, Settings, Sun, Moon, ChevronDown, Command } from "lucide-react";
import { useTheme } from "next-themes";
import { useNav } from "@/lib/store";
import { ROLES } from "@/lib/constants";
import type { CurrentUser } from "@/lib/client";
import { apiFetch } from "@/lib/client";
import { toast } from "sonner";

export function AppTopbar({ user }: { user: CurrentUser }) {
  const { setView } = useNav();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [notifCount, setNotifCount] = useState(0);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/notifications?count=true")
      .then((r) => r.json())
      .then((d) => setNotifCount(d.unread ?? 0));
  }, []);

  useEffect(() => {
    fetch("/api/notifications?limit=8")
      .then((r) => r.json())
      .then((d) => setNotifications(d.items ?? []));
  }, []);

  async function loadNotif() {
    const [c, l] = await Promise.all([
      fetch("/api/notifications?count=true").then((r) => r.json()),
      fetch("/api/notifications?limit=8").then((r) => r.json()),
    ]);
    setNotifCount(c.unread ?? 0);
    setNotifications(l.items ?? []);
  }

  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const d = await apiFetch(`/api/search?q=${encodeURIComponent(search)}`);
        setSearchResults(d.results ?? []);
        setSearchOpen(true);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    toast.success("تم تسجيل الخروج");
    router.refresh();
  }

  function initials(name: string) {
    return name.split(" ").slice(-2).map((p) => p[0]).join("");
  }

  return (
    <header className="sticky top-0 z-30 h-16 bg-background/95 backdrop-blur border-b border-border flex items-center gap-3 px-4 lg:px-6">
      {/* البحث الشامل */}
      <div className="relative flex-1 max-w-xl">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-pointer text-muted-foreground pointer-events-none" />
        <Input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث شامل في المهام والطلبات والقرارات..."
          className="pr-9 pl-16 bg-muted/50 border-transparent focus-visible:border-border focus-visible:bg-background"
        />
        <kbd className="absolute left-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground bg-background border rounded px-1.5 py-0.5">
          <Command className="h-3 w-3" />K
        </kbd>
        {searchOpen && searchResults.length > 0 && (
          <div className="absolute top-full mt-2 inset-x-0 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50 max-h-96 overflow-y-auto scrollbar-mir">
            {searchResults.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => {
                  setSearch("");
                  setSearchOpen(false);
                  if (r.type === "task") setView("task-detail", { id: r.id });
                  else if (r.type === "request") setView("request-detail", { id: r.id });
                  else if (r.type === "meeting") setView("meeting-detail", { id: r.id });
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent text-right border-b border-border/50 last:border-0"
              >
                <Badge variant="outline" className="shrink-0 text-[10px]">{r.typeLabel}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.title}</div>
                  <div className="text-xs text-muted-foreground nums">{r.ref}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {/* إنشاء سريع */}
        <Popover open={quickOpen} onOpenChange={setQuickOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 h-9">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">إنشاء</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-1">
            <div className="px-2 py-1.5 text-xs font-bold text-muted-foreground">إنشاء سريع</div>
            <QuickItem label="مهمة جديدة" onClick={() => { setQuickOpen(false); setView("task-new"); }} />
            <QuickItem label="طلب جديد" onClick={() => { setQuickOpen(false); setView("requests", { action: "new" }); }} />
            <QuickItem label="اجتماع جديد" onClick={() => { setQuickOpen(false); setView("meetings", { action: "new" }); }} />
          </PopoverContent>
        </Popover>

        {/* الإشعارات */}
        <Popover onOpenChange={(o) => o && loadNotif()}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9">
              <Bell className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
              {notifCount > 0 && (
                <span className="absolute top-1 left-1 h-4 min-w-4 px-1 rounded-full bg-[#ff7f32] text-white text-[10px] font-bold flex items-center justify-center nums">
                  {notifCount > 9 ? "9+" : notifCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-bold text-sm">الإشعارات</span>
              {notifCount > 0 && <Badge className="bg-[#ff7f32] text-white nums">{notifCount} غير مقروء</Badge>}
            </div>
            <div className="max-h-96 overflow-y-auto scrollbar-mir">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">لا توجد إشعارات</div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      if (n.link) setView(n.link as any);
                      markRead(n.id);
                    }}
                    className={`w-full text-right px-4 py-3 border-b border-border/50 last:border-0 hover:bg-accent transition ${!n.read ? "bg-accent/40" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-[#ff7f32] shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{n.title}</div>
                        {n.body && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</div>}
                        <div className="text-[10px] text-muted-foreground/70 mt-1 nums">{n.createdAt}</div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
            <button
              onClick={() => setView("notifications")}
              className="w-full text-center py-2.5 text-xs font-medium text-primary hover:bg-accent border-t border-border"
            >
              عرض كل الإشعارات
            </button>
          </PopoverContent>
        </Popover>

        {/* الوضع الفاتح/الداكن */}
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* قائمة المستخدم */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-accent transition">
              <Avatar className="h-8 w-8 border border-border">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block text-right leading-tight">
                <div className="text-xs font-semibold max-w-32 truncate">{user.name}</div>
                <div className="text-[10px] text-muted-foreground">{ROLES[user.role]}</div>
              </div>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="font-semibold">{user.name}</span>
                <span className="text-xs font-normal text-muted-foreground nums" dir="ltr">{user.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setView("profile")}>
              <User className="h-4 w-4 ml-2" /> الملف الشخصي
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              <Settings className="h-4 w-4 ml-2" /> الإعدادات
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 ml-2" /> تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );

  function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setNotifCount((c) => Math.max(0, c - 1));
    apiFetch(`/api/notifications/${id}/read`, { method: "POST" }).catch(() => {});
  }
}

function QuickItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-right px-3 py-2 text-sm hover:bg-accent rounded-md">
      {label}
    </button>
  );
}
