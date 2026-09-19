"use client";

export function AppFooter({ org }: { org: { name: string; nameEn?: string | null } }) {
  return (
    <footer className="shrink-0 h-10 bg-background border-t border-border flex items-center justify-between px-4 lg:px-6 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <span className="font-bold text-primary">مير</span>
        <span>— منصة إدارة الأعمال</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden sm:inline">{org.name}</span>
        <span className="hidden sm:inline">•</span>
        <span>© 2026 جميع الحقوق محفوظة</span>
      </div>
    </footer>
  );
}
