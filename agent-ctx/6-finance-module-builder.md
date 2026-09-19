# Task ID: 6 — Finance Module Builder

وكيل بناء الوحدة المالية والمحاسبية لمنصة «مير».

## النطاق
- APIs: `/api/finance/expenses`, `/api/finance/invoices`, `/api/finance/payments`, `/api/vendors` (+`[id]`), `/api/cost-centers` (+`[id]`), `/api/budgets`
- Views: `src/components/views/finance-view.tsx`, `vendors-view.tsx`, `cost-centers-view.tsx`

## قواعد التصميم المعتمدة
- عربي أول RTL، ألوان مير (تيل #004645، برتقالي #ff7f32، كريمي، أخضر فاتح)، لا أزرق/إنديغو إلا في chips الحالات الموجودة في `STATUS_COLOR_CLASSES` الأصلية
- الصلاحيات: `finance.view` لكل القراءات، `finance.manage` للكتابات، `finance.view.amounts` لإظهار المبالغ (يُخفى بـ "—" لمن لا يملكها)
- لا حذف صلب — أرشفة عبر `active=false`
- تدقيق على كل التعديلات
- التحقق من المبالغ غير سالبة
- Next.js 16: `ctx.params` Promise — يُنتظر

## مرجع النمط
- راجع `src/components/views/dashboard-view.tsx` لأسلوب البطاقات والرسوم البيانية (recharts) والأيقونات (lucide-react)
- استخدم `StatCard`, `SectionCard`, `EmptyState`, `PageHeader` من `ui-bits/stat-card`
- استخدم `StatusBadge` من `ui-bits/status-badge`
- استخدم `apiFetch`, `canClient`, `CurrentUser` من `lib/client`
- استخدم `useQuery` من `@tanstack/react-query`

## ما تم إنجازه (سيُحدَّث)
- جاري إنشاء APIs ثم الواجهات

## الإنجاز النهائي (مكتمل)
- 8 مسارات API (expenses, invoices, payments, vendors, vendors/[id], cost-centers, cost-centers/[id], budgets)
- 3 عروض (finance-view, vendors-view, cost-centers-view)
- كل المسارات تطبّق RBAC خادميًا (finance.view / finance.manage) وتُخفي المبالغ عند غياب finance.view.amounts
- لا حذف صلب — أرشفة عبر active=false
- تدقيق على كل التغييرات + إشعارات (payment_done, budget_exceeded)
- Next.js 16: await ctx.params في [id]
- إصلاح قاعدة react-hooks/set-state-in-effect باستخدام نمط key + useState initializer
- bun run lint يمر على كل ملفاتي بدون أخطاء
- سجل العمل مُلحق في /home/z/my-project/worklog.md
