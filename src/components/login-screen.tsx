"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "فشل الدخول");
      toast.success("مرحبًا بك في منصة متابعة المهام");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "تعذّر تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* لوحة الهوية */}
      <div className="lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-[#004645] via-[#0a6362] to-[#003534] text-white p-8 lg:p-12 flex flex-col justify-between">
        <div className="absolute inset-0 bg-mir-pattern opacity-40" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpeg" alt="شعار منصة متابعة المهام" className="h-14 w-14 rounded-xl object-cover shadow-lg bg-white/10" />
            <div>
              <h1 className="text-2xl font-black tracking-tight">منصة متابعة المهام</h1>
              <p className="text-xs text-teal-100/80">إدارة ومتابعة الأعمال والمهام</p>
            </div>
          </div>
        </div>
        <div className="relative z-10 mt-12 lg:mt-0">
          <h2 className="text-3xl lg:text-5xl font-black leading-tight text-balance">
            نهتم بإدارة لحظاتك القرارية
          </h2>
          <p className="mt-4 text-teal-100/90 text-lg leading-relaxed max-w-md">
            منصّة موحّدة لتحويل القرارات إلى مهام، ومتابعة الاعتمادات والتشغيل والمالية، مع صلاحيات دقيقة وسجل تدقيق كامل.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 max-w-md">
            {[
              { n: "+١٢", l: "مؤشر أداء" },
              { n: "٤", l: "أدوار وصلاحيات" },
              { n: "١٠+", l: "أنواع طلبات" },
            ].map((s) => (
              <div key={s.l} className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 p-3">
                <div className="text-2xl font-black text-[#d4eb8e] nums">{s.n}</div>
                <div className="text-xs text-teal-100/80 mt-1">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 text-xs text-teal-100/60">© 2026 منصة متابعة المهام — جميع الحقوق محفوظة</div>
      </div>

      {/* نموذج الدخول */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <Card className="border-border shadow-sm">
            <CardHeader className="space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <ShieldCheck className="h-5 w-5" />
                <span className="text-sm font-medium">تسجيل الدخول الآمن</span>
              </div>
              <CardTitle className="text-2xl">أهلاً بعودتك</CardTitle>
              <CardDescription>سجّل دخولك للوصول إلى لوحة التحكم</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      dir="ltr"
                      placeholder="name@domain.com"
                      className="pr-9 text-right"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">كلمة المرور</Label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      dir="ltr"
                      placeholder="••••••••"
                      className="pr-9 text-right"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "دخول"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
