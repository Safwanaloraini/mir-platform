# Task ID: 7-8 — Meetings & Reports Builder

**Agent**: Meetings & Reports Builder (Z.ai Code)
**Task IDs**: 7 (الاجتماعات والقرارات) + 8 (التقارير)
**Status**: ✅ مكتمل

## ملخص العمل
بنيت وحدتين متكاملتين من منصة «مير»:
1. **وحدة الاجتماعات والقرارات** — قائمة، تفاصيل، إنشاء، تعديل، إضافة قرارات، وتحويل القرارات إلى مهام.
2. **وحدة التقارير** — لوحة تقارير شاملة بـ 12 نوع تقرير مع رسوم بيانية وجداول وتصدير CSV.

## الملفات المُنشأة

### مسارات API
- `src/app/api/meetings/route.ts`
  - **GET**: قائمة اجتماعات مع فلاتر (dateFrom, dateTo, organizerId, attendeeId=me, attendedOnly, search) + ترقيم. تضم المنظِّم والحضور وعدد القرارات/المهام. مرتّبة تنازليًا حسب التاريخ.
  - **POST**: إنشاء اجتماع (صلاحية `meeting.create`). يُنشئ سجلات `MeetingAttendee` للمدعوين، يكتب تدقيق، ويُرسل إشعارات `task_assigned` (كإشعار دعوة عام) لكل مدعو.

- `src/app/api/meetings/[id]/route.ts`
  - **GET**: تفاصيل كاملة — المنظِّم، الحضور مع `attended`، القرارات (مع `decidedBy` و`task` المُحوَّل)، والمهام المرتبطة (`meetingId`).
  - **PATCH**: تحديث الحقول (title/date/location/linkUrl/agenda/minutes/nextMeeting) وإعادة ضبط قائمة الحضور. يتطلب `meeting.edit` أو أن يكون المستخدم هو المنظِّم.

- `src/app/api/decisions/route.ts`
  - **GET**: قرارات اجتماع معيّن (`?meetingId=`).
  - **POST**: إضافة قرار لاجتماع (صلاحية `meeting.create`). ينشئ Decision بحالة `pending`.

- `src/app/api/decisions/[id]/convert/route.ts`
  - **POST**: تحويل قرار إلى مهمة (صلاحية `task.create`).
  - **معاملة ذرّية عبر `db.$transaction`**:
    1. توليد رقم المهمة (max+1).
    2. إنشاء `Task` بـ `type="administrative"`, `source="decision"`, `status="assigned"`, `meetingId`, `decisionId`.
    3. إنشاء `TaskAssignee` رئيسي (`isMain=true`, `role="responsible"`).
    4. تحديث `mainAssigneeId` على المهمة.
    5. إنشاء `TaskStatusHistory` (from=null → "assigned").
    6. تحديث `Decision.status` إلى `"converted"`.
  - **بعد المعاملة**: كتابة تدقيقين (create + status_change)، نشاط، إشعاران (`task_assigned` للمسؤول + `decision_converted` لمنظِّم الاجتماع إن لم يكن هو المُحوِّل).
  - يرجع `{ task, decision }` بحالة 201.

- `src/app/api/reports/route.ts`
  - **GET**: يدعم 12 نوع تقرير عبر `?type=` مع `dateFrom`/`dateTo`:
    - `tasks_by_status` — مجموعة المهام حسب الحالة (pie).
    - `tasks_by_assignee` — عدد، متأخرة، مكتملة، متوسط ساعات الإنجاز لكل مسؤول (bar).
    - `overdue_tasks` — قائمة تفصيلية للمهام المتأخرة (table).
    - `requests_by_type` — عدد + مجموع المبالغ لكل نوع طلب (bar).
    - `requests_by_status` — توزيع الطلبات حسب الحالة (pie).
    - `avg_approval_hours` — متوسط الفارق (بالساعات) بين إنشاء الطلب وأحدث إجراء `approve` (stat).
    - `expenses_by_category` — المصروفات حسب البند (pie).
    - `expenses_by_project` — حسب المشروع (bar).
    - `expenses_by_cost_center` — حسب مركز التكلفة (bar).
    - `budget_vs_actual` — المخطط مقابل الفعلي ونسبة الاستهلاك للسنة الجارية (bar).
    - `department_performance` — إجمالي/مكتملة/متأخرة لكل إدارة + نسبة الالتزام بالموعد (bar).
    - `decisions_implementation` — توزيع حالات القرارات (pending/converted/implemented/cancelled) (pie).
  - المبالغ تُرجع فقط لمن يملك `finance.view.amounts`. نطاق المهام يخضع للصلاحية (`task.view.all` أو مهام المستخدم فقط).
  - كل تقرير يرجع حقل `chartType` لتوجيه العميل لنوع الرسم المناسب.

### مكوّنات العرض (Client)
- `src/components/views/meetings-view.tsx`
  - PageHeader + زر «اجتماع جديد» (إن كان يملك `meeting.create`).
  - فلاتر: بحث نصّي، نطاق تاريخ، Switch «حضرتها» (يضع `attendeeId=me`).
  - قائمة بطاقات اجتماعات تعرض: العنوان، التاريخ، المكان/الرابط، المنظِّم، عدد الحضور، عدد القرارات، عدد المهام، الاجتماع القادم. اجتماعات قادمة تحمل بادج مميز.
  - نافذة إنشاء اجتماع: عنوان، تاريخ+وقت، مكان، رابط، جدول الأعمال، محضر أولي، اختيار مدعوين متعدد (Popover + بحث + شارات مع زر إزالة). عند `params.action === "new"` تُفتح تلقائيًا (تهيئة الحالة من البداية تجنّبًا لإعادة الرسم المتسلسلة).
  - استخدمت `key={dialogKey}` لإعادة تركيب النافذة عند الفتح فلا حاجة لإعادة ضبط الحالة عبر تأثير.

- `src/components/views/meeting-detail-view.tsx`
  - رجوع + PageHeader (العنوان + المنظِّم) + زر تعديل (إن كان المنظِّم أو `meeting.edit`).
  - بطاقة معلومات: التاريخ، المكان، الرابط (يفتح في تبويب جديد)، الاجتماع القادم. بادج «اجتماع قادم» إن كان تاريخه مستقبليًا.
  - تبويبات: بيانات الاجتماع (agenda + minutes)، الحضور (مع بادج حضر/لم يحضر)، القرارات، المهام المرتبطة.
  - قسم القرارات: لكل قرار رقم تسلسلي، نص، مبررات، مسؤول القرار، تاريخ استحقاق، بادج حالة (pending/converted/implemented/cancelled)، وزر «تحويل إلى مهمة» إن كانت الحالة pending. إن كان محوّلًا، يظهر رابط للمهمة المُنشأة (`م-XXXX` + العنوان).
  - نافذة التحويل: اختيار المسؤول (إجباري)، تاريخ استحقاق، أولوية، إدارة. عند النجاح: invalidateQueries + toast + setView("task-detail", { id }).
  - استخدمت `key={decisionId ?? "closed"}` لإعادة تركيب النافذة وضبط الحالة.

- `src/components/views/reports-view.tsx`
  - PageHeader + زر «تصدير CSV» (إن كان `report.export`).
  - شبكة `lg:grid-cols-[280px_1fr]`: الشريط الجانبي يحوي نطاق تاريخ + قائمة التقارير مصنّفة (المهام / الطلبات / المالية / الأداء). التقارير المالية تُخفى عمّن لا يملك `finance.view.amounts`.
  - عارض التقرير: يختار نوع الرسم المناسب (PieChart / BarChart أفقي / بطاقات إحصائية) حسب `chartType` من API، ثم جدول بيانات تفصيلي أسفله.
  - **تصدير CSV**: باني CSV على العميل يضيف BOM لدعم العربية، يهرب من الفواصل وعلامات التنصيص، ويُنزّل ملفًا باسم `{type}_{date}.csv`.

## الجودة
- ✅ Next.js 16: `ctx.params` يُنتظر (await) في كل مسارات `[id]`.
- ✅ RBAC مُطبّق على مستوى API (`meeting.create`, `meeting.edit`, `task.create`, `report.view`, `finance.view.amounts`).
- ✅ التحويل قرار→مهمة ذرّي عبر `db.$transaction` (إنشاء مهمة + إسناد + سجل حالة + تحديث حالة القرار + توليد رقم).
- ✅ تدقيق على كل تعديل/إنشاء/تحويل (`audit()` من `lib/audit.ts`).
- ✅ إشعارات (`notify()`) للمسؤول ولمنظِّم الاجتماع.
- ✅ لا أزرار/إجراءات ماليّة تظهر عمّن لا يملك `finance.view.amounts`.
- ✅ `bun run lint` ناجح بدون أخطاء في ملفاتي.
- ✅ `tsc --noEmit` ناجح لكل ملفاتي.
- ✅ تجنّب `setState` داخل `useEffect` (استخدمت `key` prop لإعادة التركيب وتهيئة الحالة في `useState`).

## التبعيات مع الوكلاء الآخرين
- استخدمت البنية التحتية القائمة: `db`, `getCurrentUser`, `can`, `apiHandler`, `audit/activity/notify`, `formatCurrency/formatDate/formatDateTime/taskNumber/TASK_STATUSES/TASK_PRIORITIES/REQUEST_STATUSES/EXPENSE_CATEGORIES`, `apiFetch/canClient/CurrentUser`, `useNav`.
- نموذج `Expense` لا يحوي علاقة `task` (فقط `taskId` كحقل، مع علاقة `request`)، فعملت في تقرير `expenses_by_project` على استخدام `request.project` فقط.
- مكوّنات shadcn/ui المستخدمة: dialog, input, label, textarea, button, badge, checkbox, switch, popover, select, tabs, table, scroll-area, avatar.
- متوافق مع نظام التصميم: تيل أساسي، برتقالي للتمييز، أرقام بـ`nums`، RTL، فاتح/داكن.

## نقاط للملاحظة
- نافذة تعديل الاجتماع الكاملة (محرر متقدّم) لم تُطلب صراحة، فاكتفيت بزر «تعديل» يفتح عرض القائمة — يمكن إضافة نافذة تعديل لاحقًا إن احتيج.
- التقرير المالي (`budget_vs_actual`) يعرض ميزانيات السنة الجارية فقط.
- التصدير حاليًا CSV فقط؛ يمكن إضافة PDF/Excel لاحقًا عبر skill مناسب.
