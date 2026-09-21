# منصة «مير» — سجل العمل المشترك

هذا الملف هو سجل العمل المشترك لجميع الوكلاء. كل وكيل يقرأ هذا الملف قبل البدء ويضيف قسمه في النهاية (إلحاق فقط).

## هوية العلامة «مير» (من دليل الهوية)
- الألوان: تيل داكن `#004645`، برتقالي `#FF7F32`، كريمي `#FEF6DC`، أخضر فاتح `#D4EB8E`، بني `#502B1C`
- الخط: بديل HT Heliopolis → Tajawal / IBM Plex Sans Arabic
- التصميم: عربي أول، RTL، احترافي هادئ حديث، فاتح/داكن

## قواعد تقنية عامة للوكلاء
- المشروع Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui + Prisma(SQLite)
- المستخدم يرى فقط مسار `/` (تطبيق صفحة واحدة بتبديل عرض من جانب العميل)
- APIs تحت `/api/*`
- z-ai-web-dev-sdk في الخادم فقط
- لا تُنشئ ملفات اختبار
- استخدم مكونات shadcn/ui الموجودة في `src/components/ui`
- الصلاحيات تُطبق على مستوى API (ليس إخفاء الأزرار فقط)
- الأرقام المالية والتواريخ يجب التحقق منها
- كل تغيير حالة يُسجل في سجل الحالة + سجل التدقيق

## خريطة المسارات
- `/` → التطبيق (Shell داخلي يبدّل العروض حسب الحالة)
- `/api/auth/*` → المصادقة
- `/api/tasks`, `/api/requests`, `/api/finance/*`, `/api/meetings`, `/api/notifications`, `/api/audit`, `/api/users`, `/api/settings`, `/api/reports`, `/api/dashboard/*`

---
Task ID: 1
Agent: Main (Z.ai Code)
Task: الأساس — قاعدة البيانات، نظام التصميم، المصادقة، RBAC، هيكل التطبيق

Work Log:
- استخراج دليل هوية مير: ألوان (تيل #004645، برتقالي #ff7f32، كريمي #fef6dc، أخضر فاتح #d4eb8e، بني #502b1c)
- بناء مخطط Prisma شامل (30+ نموذج): مؤسسات، مستخدمون، مهام مع علاقاتها الكاملة، طلبات ومسارات اعتماد، مالية، اجتماعات وقرارات، إشعارات، سجل تدقيق
- رفع المخطط لقاعدة البيانات SQLite (db:push ناجح)
- بناء نظام التصميم: globals.css بهوية مير (RTL، فاتح/داكن، ألوان حالات دلالية، خط Tajawal + IBM Plex Sans Arabic)
- بناء المصادقة: جلسات httpOnly + HMAC + bcrypt، APIs: /api/auth/login, /logout, /me
- بناء RBAC: lib/permissions.ts (5 أدوار، 23 صلاحية، فصل الصلاحيات للاعتماد)
- بناء سجل التدقيق والإشعارات والنشاط: lib/audit.ts
- بناء مساعدات API: lib/api.ts (معالجة أخطاء موحدة UNAUTHORIZED/FORBIDDEN/VALIDATION)
- بناء الثوابت العربية: lib/constants.ts (تسميات، ألوان، formatters للعملة/التاريخ/الأرقام)
- بناء مخزن التنقل Zustand: lib/store.ts (useNav + filters)
- بناء shell: app-shell, app-sidebar (قائمة حسب الصلاحيات), app-topbar (بحث شامل، إشعارات، إنشاء سريع، تبديل الوضع), app-footer (sticky)
- بناء شاشة الدخول: login-screen.tsx بهوية مير
- بناء الـ ViewRouter ومكونات UI مشتركة: ui-bits/status-badge, ui-bits/stat-card
- بناء API لوحة التحكم: /api/dashboard (مؤشرات حسب الدور)
- بناء عرض لوحة التحكم: dashboard-view.tsx (بطاقات، رسوم بيانية، قوائم)
- إنشاء API بيانات مرجعية: /api/meta (مستخدمون، إدارات، مشاريع، أنواع طلبات، مراكز تكلفة، موردين)
- بناء سكربت البذور: scripts/seed.ts ببيانات عربية واقعية شاملة (5 مستخدمين، 6 مهام بمراحل مختلفة، 6 طلبات بمسارات اعتماد، مصروفات/فواتير/مدفوعات، اجتماع بقرارات محوّلة لمهام، إشعارات، إعدادات)

Stage Summary:
- الأساس مكتمل: قاعدة بيانات + تصميم + مصادقة + صلاحيات + shell + لوحة تحكم + بيانات تجريبية
- بيانات الدخول: ceo@mir.sa / ops@mir.sa / finance@mir.sa / accountant@mir.sa / ahmed@mir.sa (كلمة المرور: mir12345)
- الوكلاء التاليون يبنون الوحدات المتبقية بالتوازي وفق المواصفات أدناه
- يجب على كل وكيل قراءة هذا الملف قبل البدء، واتباع نظام التصميم القائم (راجع dashboard-view.tsx كمرجع، و lib/constants.ts للتسميات)

---
Task ID: 6
Agent: Finance Module Builder
Task: الوحدة المالية والمحاسبية — المصروفات والفواتير والمدفوعات ومراكز التكلفة والميزانيات والموردون والعملاء

Work Log:
- بناء 8 مسارات API:
  - `src/app/api/finance/expenses/route.ts`: GET (قائمة مع فلاتر dateFrom/dateTo/category/costCenterId/vendorId/status/requestId/search/page/pageSize + وضع summary يجمع byCategory/byCostCenter/byMonth) و POST (إنشاء برقم تسلسلي تلقائي max+1، تحقق من المبلغ غير السالب، تدقيق).
  - `src/app/api/finance/invoices/route.ts`: GET (فلاتر status/type/vendorId/overdue/dateFrom/dateTo/search + حساب المدفوع والباقي وتعليم isOverdue) و POST (رقم فاتورة فريد، نوع payable/receivable، حساب totalAmount، تدقيق).
  - `src/app/api/finance/payments/route.ts`: GET (فلاتر type/method/dateFrom/dateTo/vendorId/invoiceId/requestId/search) و POST (تسجيل دفعة + تحديث حالة الفاتورة المرتبطة تلقائيًا unpaid→partial→paid + إشعار منشئ الطلب type payment_done + تدقيق).
  - `src/app/api/vendors/route.ts`: GET (قائمة موردون + عملاء مع فلاتر type/active/search) و POST (إنشاء مورد أو عميل وفق kind، تدقيق).
  - `src/app/api/vendors/[id]/route.ts`: PATCH (تعديل حقول، أرشفة عبر active=false، كشف نوع الكيان vendor/customer تلقائيًا، تدقيق، منع الحذف الصلب).
  - `src/app/api/cost-centers/route.ts`: GET (قائمة مسطحة شجرية مع ميزانية السنة الحالية + تجميع المصروفات الفعلية لكل مركز + نسبة الاستهلاك + علم budgetExceeded) و POST (إنشاء، رمز فريد، التحقق من وجود الأب، تدقيق).
  - `src/app/api/cost-centers/[id]/route.ts`: PATCH (تعديل، منع الدورات في الشجرة، أرشفة، تدقيق).
  - `src/app/api/budgets/route.ts`: GET (فلاتر period/costCenterId، نسبة الاستهلاك) و POST (upsert حسب costCenterId+period، إشعار budget_exceeded عند التجاوز، تدقيق).
- بناء 3 مكونات عرض (client):
  - `src/components/views/finance-view.tsx`: تبويبات (نظرة عامة / المصروفات / الفواتير / المدفوعات والمقبوضات). نظرة عامة: بطاقات (إجمالي مصروفات الشهر، مدفوعات الشهر، مستحقات قادمة، فواتير متأخرة)، رسم شريطي للمصروفات الشهرية (recharts)، رسم لكل مركز تكلفة، جدول المستحقات القادمة (مع تعليم المتأخرة بالأحمر)، قائمة تنبيهات مالية (فواتير متأخرة + مراكز متجاوزة)، رسم دائري لتوزيع الفئات. مصروفات: فلاتر + جدول + نموذج حوار. فواتير: فلاتر + جدول + نموذج. مدفوعات: فلاتر + جدول + نموذج (ربط اختياري بفاتورة). كل القوائم مرقّمة صفحات.
  - `src/components/views/vendors-view.tsx`: تبويبات الموردون/العملاء، بحث وفلترة بالنوع والحالة، جدول كامل، زر إضافة، تعديل عبر Dialog، أرشفة عبر زر (لا حذف صلب).
  - `src/components/views/cost-centers-view.tsx`: شجرة هرمية قابلة للطي على اليسار، تفاصيل المركز المحدد على اليمين (بطاقات مخطط/فعلي/ملتزم/نسبة الاستهلاك + Progress ملوّن حسب النسبة)، جدول ميزانيات المركز عبر الفترات، رسم مقارنة مخطط مقابل فعلي لكل المراكز (recharts BarChart). نماذج إنشاء/تعديل مركز تكلفة وميزانية.
- الجودة:
  - Next.js 16: استخدم `await ctx.params` في المسارات الديناميكية `[id]`.
  - RBAC خادميًا: كل قراءات finance تتطلب `finance.view`، كل كتابات تتطلب `finance.manage`، إخفاء المبالغ بـ null عند عدم توفّر `finance.view.amounts` (وتظهر "—" في الواجهة).
  - لا حذف صلب — الأرشفة عبر `active=false` للموردين/العملاء/مراكز التكلفة.
  - تدقيق على كل تعديل (create/update/archive).
  - التحقق من المبالغ غير السالبة، وتواريخ صالحة، وأرقام فريدة، ومنع الدورات في شجرة مراكز التكلفة.
  - استخدمت `key` prop لإعادة إنشاء النماذج عند تغير الهدف بدل useEffect+setState (تجنب قاعدة react-hooks/set-state-in-effect).
  - `bun run lint` يمر نظيف لكل ملفاتي (الأخطاء المتبقية في settings-views.tsx و users-view.tsx تخص وكلاء آخرين).
  - اتباع نمط dashboard-view.tsx: StatCard/SectionCard/EmptyState/PageHeader، StatusBadge، recharts، lucide-react، ألوان مير (تيل #004645، برتقالي #FF7F32)، RTL عربي.

Stage Summary:
- الوحدة المالية جاهزة بالكامل (8 APIs + 3 عروض) مع فصل صلاحيات صارم وإخفاء المبالغ وفق الدور.
- نقاط الدخول: عرض `finance` (تبويبات)، `vendors`، `cost-centers` — مُسجّلة في `view-router.tsx` (يضمنها Main سابقًا).
- يُتوقع من الوكلاء الآخرين إنشاء بقية العروض المُشار إليها في view-router (tasks/requests/meetings/reports/audit/users/settings-views/...) حتى تختفي أخطاء Module not found.

---
Task ID: 5
Agent: Requests & Approvals Builder
Task: بناء وحدة الطلبات والاعتمادات الكاملة — APIs + العروض

Work Log:
- بناء APIs الطلبات مع RBAC صارم على مستوى الخادم:
  - `POST /api/requests`: إنشاء طلب مع تحديد مسار الاعتماد تلقائيًا بناءً على نوع الطلب والمبلغ (يعثر على `ApprovalWorkflow` المطابق ويعين الخطوة الأولى والمعتمد الحالي).
  - `GET /api/requests`: قائمة بفلاتر متقدمة (search, status comma, type, costCenter, project, vendor, mine, pending_my_approval, minAmount, maxAmount, pagination).
  - `GET /api/requests/[id]`: تفاصيل كاملة مع workflow.steps + currentStep + actions(user,step) + notes + task.
  - `PATCH /api/requests/[id]`: تعديل المسودات والطلبات المعادة للاستكمال (creator only).
  - `POST /api/requests/[id]/action`: اتخاذ إجراء اعتماد (approve/reject/return/forward) مع منطق الانتقال بين خطوات مسار الاعتماد والتحويل التلقائي للمحاسب عند الاعتماد النهائي.
  - `POST /api/requests/[id]/notes`: إضافة ملاحظة.
- منع الاعتماد الذاتي على مستوى الخادم: `canApproveRequest(user, request.createdById)` يرجع 403 إذا حاول المستخدم اعتماد طلب أنشأه.
- منع رؤية القيم المالية لمن لا يملك `finance.view.amounts` (يُخفي amount/taxAmount/totalAmount في كل من القائمة والتفاصيل).
- تسجيل تدقيق (AuditLog) + نشاط (ActivityLog) + إشعارات (Notification) على كل إجراء (create, update, approve, reject, return, forward, comment).
- بناء 3 عروض عربية RTL متكاملة:
  1. `requests-view.tsx`: قائمة الطلبات + نافذة إنشاء طلب جديد (تفتح تلقائيًا عند `params.action==="new"`). فلاتر متعددة (بحث، نوع، حالة متعددة، مركز تكلفة، نطاق مبلغ، طلباتي فقط) + ترقيم صفحات + جدول كامل.
  2. `request-detail-view.tsx`: تفاصيل الطلب + لوحة إجراءات حسب السياق + محوّر مسار اعتماد أفقي (Stepper) ملوّن حسب حالة كل خطوة (done/current/pending/rejected/returned) مع overlay للإجراءات + سجل تاريخي للإجراءات + المرفقات + الملاحظات + المهمة المرتبطة.
  3. `approvals-view.tsx`: صندوق اعتمادات بتبويبات (بانتظار اعتمادي / محولة لي للتنفيذ / أنجزتها) مع إجراءات سريعة inline (اعتماد/رفض بسب).
- استخدام `useQuery` + `apiFetch` للبيانات الخادمية + `useMutation` للإجراءات.
- تجنب نمط `setState` داخل `useEffect` (قاعدة lint الصارمة في React 16) باستخدام نمط تتبع الحالة السابقة.
- التزام بهوية مير: ألوان تيل/برتقالي دلالية، خط Tajawal، RTL، `nums` class للأرقام، شارات حالة موحدة.
- معالجة فجوة في المخطط: `RequestNote` لا يملك علاقة `user` (فقط `userId`) — تم حلها بجلب المستخدمين بعد الاستعلام ودمجهم بدلاً من تعديل المخطط.

Stage Summary:
- وحدة الطلبات والاعتمادات مكتملة: APIs + عروض + RBAC + مسارات اعتماد متعددة الخطوات + تحويل تلقائي للمحاسب + منع الاعتماد الذاتي + سجل تدقيق وإشعارات.
- ملفات API: `src/app/api/requests/route.ts`, `[id]/route.ts`, `[id]/action/route.ts`, `[id]/notes/route.ts`.
- ملفات العروض: `src/components/views/requests-view.tsx`, `request-detail-view.tsx`, `approvals-view.tsx`.
- `bun run lint` و `tsc --noEmit` يمران بدون أخطاء على ملفاتي.
- سجل العمل التفصيلي في `/agent-ctx/5-requests-builder.md`.
- الطلبات التجريبية في seed.ts تغطي جميع الحالات (under_review, awaiting_final, in_execution, rejected, draft, closed) ويمكن اختبارها بحسابات finance@mir.sa, ceo@mir.sa, accountant@mir.sa, ahmed@mir.sa (كلمة المرور: mir12345).

---
Task ID: 7-8
Agent: Meetings & Reports Builder (Z.ai Code)
Task: وحدتا الاجتماعات والقرارات + التقارير

Work Log:
- بناء API الاجتماعات الكامل: GET (قائمة + فلاتر dateFrom/dateTo/organizerId/attendeeId=me/attendedOnly/search + ترقيم)، POST (إنشاء + صلاحية meeting.create + إنشاء سجلات حضور + تدقيق + إشعارات دعوة).
- بناء API اجتماع فردي: GET (تفاصيل كاملة: منظِّم، حضور مع attended، قرارات مع decidedBy والمهمة المُحوَّلة، مهام meetingId)، PATCH (تحديث حقول + إعادة ضبط قائمة الحضور، صلاحية meeting.edit أو المنظِّم).
- بناء API القرارات: GET (قائمة اجتماع)، POST (إضافة قرار بحالة pending، صلاحية meeting.create).
- بناء API تحويل القرار إلى مهمة: POST مع معاملة ذرّية db.$transaction تشمل: توليد رقم مهمة max+1، إنشاء Task(type=administrative, source=decision, status=assigned, meetingId, decisionId) + TaskAssignee رئيسي + TaskStatusHistory، تحديث Decision.status إلى converted. خارج المعاملة: تدقيقان + نشاط + إشعاران (task_assigned للمسؤول + decision_converted لمنظِّم الاجتماع).
- بناء API التقارير: GET بـ ?type= يدعم 12 نوع تقرير (tasks_by_status, tasks_by_assignee, overdue_tasks, requests_by_type, requests_by_status, avg_approval_hours, expenses_by_category, expenses_by_project, expenses_by_cost_center, budget_vs_actual, department_performance, decisions_implementation) مع دعم dateFrom/dateTo. المبالغ محجوبة لمن لا يملك finance.view.amounts. نطاق المهام يخضع للصلاحية.
- بناء عرض الاجتماعات meetings-view: قائمة + فلاتر + نافذة إنشاء بـ multi-select للحضور عبر Popover مع بحث وشارات قابلة للإزالة. فتح تلقائي عند params.action==="new" عبر تهيئة useState (بدل useEffect).
- بناء عرض تفاصيل اجتماع meeting-detail-view: تبويبات (بيانات / حضور / قرارات / مهام)، عرض القرارات مع بادج حالة وزر «تحويل إلى مهمة»، نافذة تحويل (مسؤول، تاريخ، أولوية، إدارة)، رابط للمهمة المُنشأة.
- بناء عرض التقارير reports-view: شبكة جانبية لتصنيف التقارير + نطاق تاريخ + عارض مع رسوم بيانية (Pie/Bar/Stat) + جدول بيانات تفصيلي + تصدير CSV على العميل (مع BOM لدعم العربية).
- إصلاح أخطاء TypeScript: استبدال notFound()/badRequest() بـ throw new Error مباشر لتمكين narrowing بعد عدم وجود السجل (نظرًا لأن مساعدات lib/api.ts لا تُرجع never).
- إصلاح تحذيرات lint react-hooks/set-state-in-effect عبر نمط key prop لإعادة تركيب النوافذ وتهيئة الحالة في useState.

Stage Summary:
- وحدتا الاجتماعات والقرارات والتقارير مكتملتان بشكل إنتاجي.
- 5 مسارات API + 3 مكوّنات عرض منشأة، كلها تمر lint وtsc.
- الذرّية في تحويل القرار إلى مهمة مضمونة عبر transaction.
- الصلاحيات مُطبّقة على مستوى API، والمبالغ المالية محجوبة لغير المصرّح لهم.
- التكامل مع البنية القائمة: استخدمت lib/db, lib/session, lib/permissions, lib/api, lib/audit, lib/constants, lib/client, lib/store، وshadcn/ui + recharts + lucide-react.
- ملف العمل: /agent-ctx/7-8-meetings-reports-builder.md

---

## Task ID: 4
Agent: Tasks Module Builder
Task: بناء وحدة المهام الكاملة (APIs + 6 واجهات) لمنصة «مير»

Work Log:
- قراءة worklog.md وفهم البنية التحتية القائمة (Prisma, session, permissions, audit, constants, store, ui-bits)
- قراءة dashboard-view.tsx كمرجع للأسلوب و RTL والاستخدام المتسق لـ StatCard/PageHeader/SectionCard/recharts/lucide-react
- بناء 6 APIs:
  - `src/app/api/tasks/route.ts` — GET (قائمة مع فلاتر متقدمة: status/priority/type/departmentId/assigneeId/projectId/overdue/stalled/search/mine/page/pageSize) + POST (إنشاء مع توليد رقم ذري داخل transaction، إسنادات + mainAssigneeId، Checklist، TaskStatusHistory أولي، إشعارات، Audit+Activity)
  - `src/app/api/tasks/[id]/route.ts` — GET (تفاصيل كاملة بكل العلاقات) + PATCH (تحديث + تعديل إسناد + تغيير حالة مع قواعد completed_approved)
  - `src/app/api/tasks/[id]/status/route.ts` — POST (تغيير حالة مع RBAC + التحقق من شروط الإكمال والتعثر والاعتماد)
  - `src/app/api/tasks/[id]/comments/route.ts` — POST (تعليق + mentions + إشعارات + Audit)
  - `src/app/api/tasks/[id]/checklist/route.ts` — POST (إضافة أو تعديل عنصر + تحديث progress)
  - `src/app/api/tasks/[id]/attachments/route.ts` — POST (تسجيل مرفق + required flag + Audit)
- بناء 6 واجهات:
  - `mywork-view.tsx` — أعمالي: بطاقات إحصائية + أجندة اليوم + متأخرة + "ما يحتاج تدخلي" + قوائم حسب الحالة
  - `tasks-view.tsx` — قائمة مهام متقدمة: بحث + فلاتر متعددة (status multi-select popover, priority, type, department, assignee, overdue, stalled, approval-pending, missing-attachments, mine) + جدول شامل + ترقيم + دعم params.filter="overdue" + أزرار حسب الصلاحية
  - `task-detail-view.tsx` — صفحة تفصيلية: ترويسة + badges + زر تغيير الحالة (Dialog مع قواعد الانتقال وقواعد completed_approved) + تعديل المهمة + إدارة المسؤولين + تقدم (Slider) + قائمة تحقق + تعليقات + خط زمني للحالة + المرفقات + التبعيات + الروابط
  - `task-new-view.tsx` — نموذج إنشاء: title + description + type/source/priority + department/project/costCenter/parent + assignees (multi-select مع تعيين رئيسي بنجمة) + dates + estimatedHours + tags + isRecurring/recurrence + checklist ديناميكي
  - `kanban-view.tsx` — لوحة كانبان بـ @dnd-kit/core: 8 أعمدة + سحب وإفلات + تحديث متفائل + تمرير أفقي للموبايل
  - `calendar-view.tsx` — تقويم شهري (date-fns + locale عربي، الأسبوع يبدأ السبت) + بطاقات صغيرة للمهام المستحقة + لوحة جانبية لليوم المختار + ملخص الشهر
- ملاحظات تقنية:
  - استخدمت `req: Request` بدل `NextRequest` لتوافق توقيع `apiHandler`
  - استخدمت `throw new Error("NOT_FOUND")` مباشرة بدل helper `notFound()` لضمان narrow النوع (helper يعيد void وليس never)
  - استخدمت `crypto.randomUUID()` لتوليد ids مؤقتة لعناصر checklist في النموذج
  - في Kanban، عالجت over.id سواء كان عمودًا (status) أو بطاقة (taskId) للعثور على الحالة الهدف
  - كل العمليات الكتابة تُسجّل في AuditLog + ActivityLog + Notification
  - صلاحية `completed_approved` تتطلب `task.approve_completion` + اكتمال كل عناصر checklist الإلزامية + وجود المرفقات الإلزامية
- التحقق: ESLint نظيف لكل ملفاتي + TypeScript لا أخطاء في ملفاتي

Stage Summary:
- وحدة المهام مكتملة بالكامل: 6 APIs و 6 واجهات تغطي كل المتطلبات (إسناد، حالات، قوائم تحقق، تعليقات، مرفقات، تبعيات، تكرار، مهام فرعية، كانبان، تقويم)
- RBAC يُطبَّق على مستوى API (ليس إخفاء الأزرار فقط)
- توليد رقم المهمة ذري داخل معاملة
- كل تحول حالة يُسجَّل في statusHistory + AuditLog + ActivityLog + Notifications
- اتباع نظام تصميم مير (RTL، Arabic، ألوان تيل/برتقالي، StatCard/PageHeader/SectionCard/EmptyState/StatusBadge/PriorityBadge)
- نمط موحد مع dashboard-view.tsx
- الوكلاء التاليون يمكنهم البناء فوق هذه الوحدة: التقارير، لوحة التحكم (تحديث)، الإشعارات

---
Task ID: 9
Agent: System Modules Builder
Task: وحدات النظام — الإشعارات، سجل التدقيق، المستخدمون والصلاحيات، الإعدادات، الملف الشخصي، البحث الشامل

Work Log:
- بناء 9 مسارات API:
  - `/api/notifications` (GET): وضع `count=true` يُعيد `{unread}`، وبدونه قائمة إشعارات (حد 200، فلترة unread/type). يُعيد `createdAt` كنص نسبي عربي (relativeTime) لأن التوب‌بار يعرضه مباشرة، بالإضافة إلى `createdAtISO` الخام.
  - `/api/notifications/[id]/read` (POST): وسم مقروء — ملكية فقط.
  - `/api/notifications/read-all` (POST): وسم كل إشعارات المستخدم كمقروءة + إرجاع العدد.
  - `/api/audit` (GET): قائمة AuditLog مع فلترة (action/entityType/entityId/userId/dateFrom/dateTo/search/page/pageSize) — صلاحية `audit.view` (مع استثناء ?userId=me لاستخدام الملف الشخصي)، ترقيم صفحات، قبل/بعد JSON.
  - `/api/users` (GET): users.manage يرى الكل، غير ذلك يرى نفسه فقط. فلاتر role/status/departmentId/search. POST: إنشاء مستخدم (تحقق بريد فريد، تشفير bcrypt، صلاحية users.manage، تدقيق create).
  - `/api/users/[id]` (GET): مستخدم واحد مع department و _count (createdTasks/createdRequests/assignedTasks). PATCH: تحديث — الموظف يعدّل نفسه (name/nameEn/phone/jobTitle/avatarUrl فقط)، المدير يعدّل الكل + email/role/departmentId/status/password. تغيير الدور يسجَّل كـ permission_change. منع الموظف من رفع صلاحيات نفسه.
  - `/api/settings` (GET): تجميع حسب الفئة (general/approval/escalation/notification) — settings.manage يرى الكل، غير ذلك يرى general فقط. PUT: تحديث جماعي مع تدقيق لكل عنصر.
  - `/api/search` (GET): بحث شامل عبر المهام/الطلبات/الاجتماعات/القرارات — حد 5 لكل نوع، يلتزم بقيود الصلاحية (view.all/view.own/meeting.create). يُعيد {type,typeLabel,id,title,ref}.
  - `/api/auth/change-password` (POST): التحقق من كلمة المرور الحالية بـ verifyPassword ثم تحديث، تدقيق update.
- بناء 5 مكونات عرض (Client Components) متّبعةً نمط dashboard-view.tsx:
  - `notifications-view.tsx`: مركز إشعارات بتبويبات (الكل/غير المقروء)، تحديد الكل كمقروء، أيقونات حسب النوع (Bell, AlertTriangle, CheckCircle2, Clock, Flame, FileText, MessageCircle, AtSign, Paperclip, PauseCircle, Banknote, TrendingUp, ArrowLeftRight, RotateCcw, ScrollText)، نقطة برتقالية + خلفية فاتحة لغير المقروء، نقر → وسم مقروء + setView(link).
  - `audit-view.tsx`: عارض سجل التدقيق للقراءة فقط — فلاتر (action/entityType/user/dateFrom/dateTo/search)، جدول (تاريخ/مستخدم/إجراء/نوع/وصف/IP)، صفوف قابلة للتوسيع تعرض قبل/بعد JSON في <pre>، ترقيم صفحات، زر "سجلاتي" في فلتر المستخدم.
  - `users-view.tsx`: إدارة المستخدمين والصلاحيات — بطاقات (إجمالي/نشط/معطل/أكبر إدارة)، جدول كامل (اسم/بريد/دور/مسمى/إدارة/حالة/إجراءات)، بحث + فلاتر (role/status/department)، Dialog "مستخدم جديد" و"تحرير"، تعطيل/تفعيل، وقسم "الأدوار والصلاحيات" مع مصفوفة RBAC للقراءة فقط (5 أدوار × 14 صلاحية) + توزيع المستخدمين حسب الدور.
  - `settings-views.tsx`: مكون واحد يصدّر `SettingsGeneralView` مع تبويبات داخلية: عام (اسم المؤسسة/الاسم الإنجليزي/العملة)، مسارات الاعتماد (تحرير حد المدير المالي + عرض Workflows بخطواتها)، التنبيهات والتصعيد (3 حقول رقمية)، الإشعارات (toggle للبريد مع علم "قريبًا").
  - `profile-view.tsx`: ملف شخصي — بطاقة بيانات (Avatar+Role+JobTitle+Department+Status)، تعديل البيانات (name/nameEn/phone/jobTitle/avatarUrl) عبر PATCH /api/users/[meId]، تغيير كلمة المرور (تحقق currentPassword عبر /api/auth/change-password مع إظهار/إخفاء)، "نشاطي الأخير" (آخر 8 سجلات تدقيق خاصة بي عبر ?userId=me).
- جودة الكود:
  - Next.js 16: `ctx.params` معالج كـ Promise مع await.
  - RBAC مطبّق على مستوى API (users.manage/audit.view/settings.manage).
  - تدقيق على كل تعديل (إنشاء/تحديث مستخدم، تغيير إعداد، تغيير كلمة مرور) مع IP + UserAgent.
  - لا توجد setState داخل useEffect — استخدمت نمط "remount via key prop" للنماذج المتزامنة مع بيانات الخادم (ProfileEditForm, GeneralForm, ApprovalContent, EscalationForm, NotificationForm, UserFormBody).
  - الأرقام بـ `nums`، العملات بـ `formatCurrency`، التواريخ بـ `formatDateTime/relativeTime`.
  - تجاوز قواعد ESLint: react-hooks/set-state-in-effect (تم تفاديها بنمط الـ key remount) — لا يوجد أي تعطيل للقواعد في ملفاتي.
  - استخدام shadcn/ui: Card, Button, Input, Label, Badge, Avatar, Tabs, Switch, Select, Dialog, Table, ScrollArea.
  - تجاوب كامل (mobile-first)، RTL، رمز橙ي للإشعارات غير المقروءة، تيل للإجراءات الأساسية.
  - `bun run lint` و `tsc --noEmit` (لملفاتي) يمران بنجاح بلا أخطاء.
  - بقايا `NextRequest` استُبدلت بـ `Request` في كل المسارات لتتطابق مع توقيع `apiHandler`.
- العقود الملتزَم بها مع التوب‌بار:
  - `GET /api/notifications?count=true` → `{unread: number}`
  - `GET /api/notifications?limit=8` → `{items: Notification[]}` مع `createdAt` كنص نسبي جاهز للعرض
  - `POST /api/notifications/[id]/read` → `{ok:true}`
  - `GET /api/search?q=` → `{results: [{type, typeLabel, id, title, ref}]}` مع typeLabel عربي (مهمة/طلب/اجتماع/قرار)

Stage Summary:
- وحدات النظام الست جاهزة وتعمل: الإشعارات، التدقيق، المستخدمون، الإعدادات، الملف الشخصي، البحث.
- العقود مع التوب‌بار ملتزَم بها بالكامل.
- الصلاحيات تُطبَّق على مستوى API، وكل تعديل يُسجَّل في سجل التدقيق.
- نماذج النماذج تستخدم نمط React الصحيح (لا setState في useEffect) لتجاوز قاعدة Next.js 16 الصارمة.
- ملفاتي تمرّ في `bun run lint` و TypeScript بلا أخطاء.

---
Task ID: 10 (Integration & Verification)
Agent: Main (Z.ai Code)
Task: دمج العمل، إصلاح الأخطاء، التحقق بالـ Agent Browser

Work Log:
- استلام مخرجات 5 وكلاء فرعيين: وحدة المهام، الطلبات/الاعتمادات، المالية، الاجتماعات/التقارير، وحدات النظام
- إصلاح أخطاء TypeScript: إضافة علاقة manager لـ CostCenter، دعم indicatorClassName في Progress، إصلاح نوع getCurrentUser (يشمل org/dept)، تصحيح استيراد getClientIp/getUserAgent في login، إصلاح useState في sidebar، إضافة payments لاستعلام dashboard، إصلاح due null في invoices، إضافة notes لـ BudgetRow، إصلاح seed.ts (findFirstOrThrow)
- `bun run lint` نظيف، `tsc --noEmit` بلا أخطاء في كود التطبيق
- تشغيل خادم التطوير بنجاح (port 3000)
- التحقق بالـ Agent Browser:
  * شاشة الدخول تُعرض بهوية مير (تيل/برتقالي/كريمي، RTL، 5 أزرار دخول سريع)
  * الدخول كمدير شركة ناجح → لوحة تحكم كاملة (بطاقات، طلبات بانتظار الاعتماد، مهام متأخرة، التزامات قادمة، أنشطة، رسوم بيانية)
  * عرض تفاصيل المهمة: وصف، قائمة تحقق، تعليقات، خط زمني، تقدم، مسؤولون، مرفقات، أزرار تحديث الحالة والتعديل
  * قائمة الطلبات: 6 طلبات بمراحل اعتماد مختلفة مع قيم ومسارات
  * صندوق الاعتمادات: طلب بانتظار اعتماد المدير مع زر «اعتماد» — نُفّذ الإجراء وسُجّل في سجل التدقيق «اعتماد على PUR-2026-002»
  * لوحة كانبان: 8 أعمدة حالة مع سحب وإفلات
  * الوحدة المالية: تبويبات (نظرة عامة/مصروفات/فواتير/مدفوعات) مع قيم ورسوم
  * سجل التدقيق: يعرض إجراءات الدخول والاعتماد مع فلاتر
  * الاستجابة للجوال (390x844): الواجهة تتكيف
  * لا أخطاء وقت تشغيل في الـ console

Stage Summary:
- المنصة مكتملة وتعمل فعليًا مع جميع المسارات الأساسية
- مسار «من القرار إلى التنفيذ» يعمل: قرار → مهمة → طلب مالي → اعتماد المدير المالي → اعتماد مدير الشركة (للمبالغ الكبيرة) → تحويل تلقائي للمحاسب → تنفيذ
- الصلاحيات تُطبق على مستوى API، وسجل التدقيق يسجل كل إجراء
- التحقق بالـ Agent Browser أكّد: لا شاشات بيضاء، لا أخطاء hydration، التفاعلات تعمل، البيانات تُعرض

---
Task ID: FIX-1
Agent: Main (Z.ai Code)
Task: إصلاح خانة «الموردون والعملاء» التي لا تفتح

Work Log:
- تشخيص عبر Agent Browser: ظهر "Runtime Error: A <Select.Item /> must have a value prop that is not an empty string"
- تحديد السبب: في src/components/views/vendors-view.tsx سطرين 118 و131 استخدما <SelectItem value="">الكل</SelectItem> (قيمة فارغة غير مسموح بها في Radix Select)
- البحث في كل المشروع للتأكد عدم وجود حالات أخرى (لا توجد)
- الإصلاح: استبدال value="" بـ value="all" في كلا الفلترين (النوع والحالة)، وتحديث القيمة الابتدائية في useState من "" إلى "all"، وتحديث شرط الفلترة ليتجاهل "all" (if (activeFilter && activeFilter !== "all"))
- إصلاح إضافي مكتشف أثناء التشخيص: كلمات مرور المستخدمين كانت لا تطابق "mir12345" (hash تالف/غير متوافق) — أعدت تعيين كلمات مرور جميع المستخدمين الـ5 عبر hashPassword("mir12345")
- التحقق بالـ Agent Browser بعد الإصلاح:
  * الدخول ناجح كمدير شركة
  * صفحة «الموردون والعملاء» تفتح بدون أخطاء
  * تبويب الموردون: يعرض 3 موردين في جدول كامل (الاسم، النوع، الرقم الضريبي، الهاتف، البريد، الحالة، إجراءات)
  * تبويب العملاء: يعرض شركة الرياض للتجارة
  * نموذج «مورد جديد» يفتح بكل الحقول
  * فلاتر النوع والحالة تعرض "الكل" بشكل صحيح
  * لا أخطاء وقت التشغيل في console
- bun run lint نظيف

Stage Summary:
- المشكلة كانت في قيمتين فارغتين في SelectItem (Radix Select يمنع value="")
- الإصلاح بسيط لكنه كان يحجب الصفحة بالكامل (Runtime Error overlay)
- جميع بيانات الدخول تعمل الآن: ceo@mir.sa / ops@mir.sa / finance@mir.sa / accountant@mir.sa / ahmed@mir.sa (كلمة المرور: mir12345)

---
Task ID: S4
Agent: New Task APIs Builder
Task: بناء APIs إدارة المهام الجديدة لمرحلة V1 — إجراءات جماعية، عروض محفوظة، تأجيل التنبيهات، معيار الإنجاز

Work Log:
- قراءة worklog.md ومراجعة البنية التحتية القائمة من المرحلة السابقة (نماذج Prisma الجديدة + lib/task-workflow, lib/task-utils, lib/permissions المحدّثة).
- بناء 6 مسارات API جديدة:
  1. `src/app/api/tasks/bulk/route.ts` (POST):
     - صلاحية `task.bulk_action` (403 خلاف ذلك).
     - نطاق: viewAll → كل المؤسسة، خلاف ذلك createdById أو assignee فقط (تخطّي الباقي إلى `skipped`).
     - إجراءات مدعومة: `assign`, `status`, `priority`, `dueDate`, `department`, `tags` (التحقق من قيمة كل نوع).
     - للإجراء `status`: استخدام `canTransition` لكل مهمة، تخطّي غير المسموح مع سببه، فحص الحقول المطلوبة عبر `checkRequiredFields`، فحص الحجب عبر `getBlockingInfo` إن لم يكن `force=true`.
     - تنفيذ ذرّي `db.$transaction`: تحديث + زيادة `version` لكل مهمة، كتابة `TaskStatusTransition` (مع إغلاق `exitedAt` للانتقال المفتوح السابق) + `TaskStatusHistory`، ضبط `startedAt`/`completedAt`/`cancelledAt` حسب الحالة.
     - للإجراء `assign`: حذف الإسنادات الحالية وإعادة إنشائها + تحديد المسؤول الرئيسي.
     - إنشاء `BulkAction` بـ `taskIds` (JSON) + `payloadJson` يحتوي `{ value, before, versionAfter }` للتراجع.
     - تدقيق مختصر واحد + نشاط (`إجراء جماعي: ${action} على ${count} مهمة`).
     - الإرجاع: `{ updated, skipped, bulkActionId }`.
  2. `src/app/api/tasks/bulk/[id]/undo/route.ts` (POST):
     - تحقق ملكية الإجراء الأصلي.
     - تعليم `undone=true`, `undoneAt=now()`.
     - استرجاع لكل مهمة: فحص `version` الحالي مقابل `versionAfter` المسجَّل، تخطّي غير المتطابق.
     - للإجراء `status`: إغلاق الانتقال المفتوح الحالي + إنشاء انتقال عكسي + `TaskStatusHistory`.
     - للإجراء `assign`: حذف الإسنادات الحالية وإعادة بناء الإسناد السابق من `before.assigneeIds`.
     - تدقيق `bulk_undo` + نشاط.
     - الإرجاع: `{ restored, skipped }`.
  3. `src/app/api/tasks/views/route.ts`:
     - GET: قائمة العروض الشخصية + المشتركة، مرتبة (`isPinned desc, updatedAt desc`)، الإرجاع `{ items }`.
     - POST: إنشاء عرض — `name` مطلوب (≤ 80 حرفًا)، `viewMode` ضمن `[list, kanban, calendar, timeline]`، حجم `filtersJson` و `columnsJson` محدود (≤ 10000 حرف). `isShared=true` يتطلب `task.manage_views`. `ownerId = user.id`. تدقيق + نشاط.
  4. `src/app/api/tasks/views/[id]/route.ts`:
     - PATCH: تحديث الحقول (name, filtersJson, sortBy, groupBy, columnsJson, viewMode, isShared, isPinned). تحويل عرض شخصي → مشترك يتطلب `task.manage_views`. المالك يعدّل عرضه دائمًا، خلاف ذلك يتطلب `task.manage_views` للعروض المشتركة.
     - DELETE: حذف بنفس منطق الصلاحية. تدقيق `delete`.
  5. `src/app/api/tasks/[id]/snooze/route.ts`:
     - POST: تأجيل التنبيهات للمستخدم الحالي. `until` يجب أن يكون تاريخًا مستقبليًا صالحًا، `reason` اختياري (≤ 500 حرف). `upsert` على `TaskSnooze` (unique taskId+userId). لا يغيّر `dueDate`. تدقيق + نشاط.
     - DELETE: حذف سجل `TaskSnooze`. تدقيق `unsnooze`.
  6. `src/app/api/tasks/[id]/dod/route.ts` (PATCH):
     - تحديث `definitionOfDone`. يتطلب `task.edit` + (منشئ أو مسؤول).
     - دعم التحرير المتفائل عبر فحص `version` (إن أُرسلت ولم تتطابق → 400 برسالة عربية واضحة).
     - زيادة `version`. تدقيق + نشاط.
     - الإرجاع: `{ id, definitionOfDone, version }`.
- جودة الكود:
  - Next.js 16: `ctx.params` معالج كـ Promise مع `await` في كل المسارات الديناميكية.
  - كل المسارات ملفوفة بـ `apiHandler` لأخطاء موحّدة مع رموز `UNAUTHORIZED/FORBIDDEN/NOT_FOUND/VALIDATION`.
  - أخطاء عربية واضحة عبر `badRequest(message)` مع `.cause`.
  - TypeScript صارم، أقل `any` ممكن.
  - كل عملية كتابة → `audit` + `activity` (و`notify` عند اللزوم).
  - `bun run lint` نظيف على ملفاتي (لا أخطاء ولا تحذيرات).
  - `npx tsc --noEmit` نظيف على ملفاتي (لا أخطاء في الـ6 ملفات الجديدة).

Stage Summary:
- APIs إدارة المهام V1 مكتملة: 6 مسارات API (8 endpoints) تغطي الإجراءات الجماعية مع التراجع، العروض المحفوظة (CRUD كامل)، تأجيل التنبيهات، وتحديث معيار الإنجاز.
- الذرّية مضمونة عبر `db.$transaction` للإجراءات الجماعية.
- التراجع آمن: فحص `version` قبل الاسترجاع (لمنع التراجع عن إجراء تم تعديل مهامه بعده).
- صلاحيات RBAC صارمة على مستوى API: `task.bulk_action`, `task.manage_views`, `task.edit`, `task.view.all`.
- سجل التدقيق + النشاط على كل عملية.
- ملف العمل التفصيلي: `/agent-ctx/S4-new-task-apis.md`.
- الوكلاء التاليون يمكنهم البناء فوق هذه APIs لبناء واجهات الإجراءات الجماعية، إدارة العروض، وزر التأجيل في الواجهات.

---
Task ID: S3
Agent: Task APIs Fixer (Z.ai Code)
Task: إصلاح مسارات API المهام القائمة (status / list / detail) — الخطوة 3 من تحسين إدارة المهام V1

Work Log:
- قراءة worklog.md وفهم البنية التحتية القائمة (task-workflow.ts، task-utils.ts، permissions.ts، api.ts، audit.ts، prisma schema V1)
- قراءة الملفات الثلاثة المراد إصلاحها واكتشاف الأخطاء:
  * status/route.ts: استخدام فحوصات hardcoded بدل task-workflow.ts، خطأ منطقي في `hasMissing = requiredAttachments.length === 0` (دائمًا false في السياق الخاطئ)، لا فحص للحجب قبل الإكمال، لا كتابة TaskStatusTransition، لا ضبط startedAt/completedAt/cancelledAt، لا فحص version
  * tasks/route.ts (GET): لا دعم لـ sort/groupBy، overdue overwritten من stalled، لا dueBefore/dueAfter، لا hasAttachments/missingAttachments، لا فلترة tags، mine فقط true/false
  * tasks/[id]/route.ts: لا isBlocked/blockingTasks، لا computedProgress، لا availableTransitions، لا version optimistic locking، لا حقول V1 الجديدة

- إصلاح `src/app/api/tasks/[id]/status/route.ts` (إعادة كتابة كاملة):
  * استخدام `canTransition(oldStatus, newStatus, {isCreator, isAssignee, can})` من task-workflow.ts كمصدر وحيد للحقيقة
  * فحص الحقول المطلوبة عبر `getRequiredFields` + `checkRequiredFields`
  * تسجيل محاولات الرفض في سجل التدقيق كـ `status_change_denied` قبل رمي FORBIDDEN مع `cause` يحوي reason
  * فحص الحجب بـ `getBlockingInfo` قبل completed_review/completed_approved — يطالب بـ `force=true` للتجاوز
  * القفل المتفائل: فحص `version` من البدي → 409 مع `{error:"MODIFIED", currentVersion}`
  * ضبط الطوابع الزمنية: startedAt (دخول ACTIVE_EXECUTION لأول مرة)، completedAt (completed_approved)، cancelledAt (cancelled)، archivedAt (archived — دفاعي)، stallReason و waitingReason حسب الحالة
  * معاملة ذرّية $transaction: تحديث المهمة + إنشاء TaskStatusHistory + إغلاق TaskStatusTransition المفتوح (exitedAt=now) + إنشاء TaskStatusTransition جديد (exitedAt=null)
  * إشعار المستلمين (المنشئ + المسؤولون) بنوع status_change ورابط task-detail:${id}
  * `version: { increment: 1 }` لكل تحديث
  * DETAIL_INCLUDE يشمل `dependencies.dependsOn` (id, title, number, status) للحجب

- إصلاح `src/app/api/tasks/route.ts` (GET + POST):
  GET:
  * دعم `sort` بصيغة `field:dir` عبر `parseSort` + `buildOrderBy`
  * للأولوية/الحالة: جلب الكل (حتى 2000)، ترتيب في الذاكرة بـ PRIORITY_ORDER/STATUS_ORDER، ثم تقسيم الصفحات
  * دعم `groupBy` (تمرير للعميل للتجميع)
  * إصلاح overdue + stalled معًا: لا يطغى أحدهما على الآخر (status="stalled" AND dueDate<now إذا كان كلاهما true)
  * دعم `dueBefore` و `dueAfter` (lt و gte)
  * دعم `hasAttachments` (some) و `missingAttachments` (none)
  * دعم `tags` (comma-separated، match ANY عبر contains)
  * توسيع `mine`: assigned / created / following / all (+ true=all للتوافق)
  * إرجاع `sort` و `groupBy` في الاستجابة
  * الحقول الجديدة على Task (definitionOfDone, storyPoints, waitingReason, startedAt, completedAt, cancelledAt, version) تُعاد تلقائيًا عبر Prisma include

  POST:
  * التحقق الإلزامي للمهام الجدية (operational/financial/administrative/followup): require assigneeIds (≥1) + priority + dueDate
  * قبول الحقول الجديدة: definitionOfDone, storyPoints, waitingReason
  * `version: 1` افتراضيًا
  * التحقق من parentId: يجب أن يكون موجودًا وفي نفس orgId
  * إنشاء TaskStatusTransition أولي مع statusHistory للتوافق
  * إشعار + تدقيق + نشاط كامل

- إصلاح `src/app/api/tasks/[id]/route.ts` (GET + PATCH):
  GET:
  * إضافة `isBlocked` و `blockingTasks` و `blockedByCount` عبر `getBlockingInfo`
  * إضافة `computedProgress` عبر `computeProgress` (من المهام الفرعية أو قائمة التحقق)
  * إضافة `availableTransitions` (مصفوفة) عبر `getAvailableTransitions` — يعرض للعميل ما هو مسموح
  * إضافة `snoozes` (تأجيلات المستخدم الحالي على هذه المهمة)
  * إضافة `statusTransitions` إلى DETAIL_INCLUDE (السجل الزمني الكامل بـ enteredAt/exitedAt)

  PATCH:
  * القفل المتفائل: فحص `version` → 409 مع `{error:"MODIFIED", currentVersion}`
  * قبول الحقول الجديدة: definitionOfDone, storyPoints, waitingReason
  * `version: { increment: 1 }` عند كل حفظ
  * تغيير الحالة داخل PATCH يمر عبر `canTransition` + `checkRequiredFields` (إصلاح الثغرة الأمنية)
  * ضبط startedAt/completedAt/cancelledAt/archivedAt عند تغيير الحالة
  * كتابة TaskStatusHistory + TaskStatusTransition (مع إغلاق السابق exitedAt) عند تغيير الحالة
  * إصلاح خطأ التحقق من المرفقات الإلزامية في الاعتماد (تم عبر checkRequiredFields الآن بدل الفحص اليدوي المعطوب)

- جودة الكود:
  * Next.js 16: `ctx.params` معالج كـ Promise مع `await`
  * apiHandler wrapper مع رمي `Error("FORBIDDEN")` / `"NOT_FOUND"` / `"VALIDATION"` (مع `.cause`)
  * رسائل خطأ عربية
  * TypeScript: استخدام `Record<string, unknown>` بدل `any` قدر الإمكان
  * تدقيق + نشاط + إشعارات على كل تغيير
  * `bun run lint` نظيف (تحذيران فقط في ملفات سابقة لا تخصني: app-sidebar, login-screen)
  * `npx tsc --noEmit` لا أخطاء (مع استثناء examples/ و skills/)

Stage Summary:
- مسارات API المهام الثلاثة أصبحت متوافقة مع V1:
  * `POST /api/tasks/[id]/status` — محرّك سير عمل مركزي + قفل متفائل + تتبع زمني دقيق للحالات
  * `GET /api/tasks` — فلترة وترتيب وتجميع متقدم + حقول V1
  * `POST /api/tasks` — تحقق صارم للمهام الجدية + حقول V1 + تحقق من parentId
  * `GET /api/tasks/[id]` — معلومات الحجب والتقدم المحسوب والانتقالات المتاحة + التأجيلات
  * `PATCH /api/tasks/[id]` — قفل متفائل + حقول V1 + مرور عبر سير العمل عند تغيير الحالة
- البنية التحتية الجاهزة (task-workflow.ts، task-utils.ts) أصبحت مصدر الحقيقة الموحد للانتقالات والتحقق
- ملف العمل التفصيلي: `/agent-ctx/S3-task-apis-fixer.md`

---
Task ID: S5b
Agent: Task Detail/New/Kanban Enhancer
Task: تحسين عروض تفاصيل/إنشاء/كانبان المهام لمرحلة V1

Work Log:
- قراءة worklog.md ومراجعة البنية التحتية القائمة (task-workflow, task-utils, client, store, constants, ui-bits, shadcn/ui, @dnd-kit).
- قراءة الملفات الثلاثة القائمة (task-detail-view: 949 سطر، task-new-view: 384 سطر، kanban-view: 269 سطر) وفهم واجهاتها الحالية.
- قراءة V1 APIs: GET /api/tasks/[id] (isBlocked, blockingTasks, computedProgress, availableTransitions, snoozes, version, definitionOfDone, storyPoints, waitingReason, startedAt, completedAt)، POST /api/tasks/[id]/status (version + force)، PATCH /api/tasks/[id]/dod، POST/DELETE /api/tasks/[id]/snooze.
- تعديل صغير آمن على `src/app/api/tasks/route.ts`: إضافة `dependencies: { include: { dependsOn: { select: { id, title, number, status } } }, take: 50 }` إلى TASK_INCLUDE لتمكين الكانبان من حساب `isBlocked` من جهة العميل دون استدعاءات إضافية. مجرد إضافة علاقة — لا يكسر أي عقد قائم.

- إعادة كتابة `src/components/views/task-detail-view.tsx` كاملة (1500+ سطر):
  * **A. حذف `STATUS_TRANSITIONS` المحلي** — استبداله بـ `availableTransitions` من API. حوار تغيير الحالة يعرض الانتقالات المسموحة فقط؛ غير المسموحة تُعرض معطّلة مع tooltip يحوي `blockedReason`.
  * **B. بطاقة معيار الإنجاز (DoD)**: SectionCard جديد قرب الوصف. يعرض `definitionOfDone` إن وُجد. زر «تعديل» يفتح Dialog مع textarea (حد 5000 حرف، عداد). تلميح أمبر للمهام الجدية إن لم يُعرف.
  * **C. لافتة الحجب العلوية**: «⚠️ هذه المهمة محجوبة بـ X مهمة غير مكتملة» مع قائمة `blockingTasks` قابلة للنقر. في الحوار، عند الانتقال إلى completed_review/approved و`isBlocked`: تحذير أحمر + قائمة blockingTasks + checkbox «تجاوز الحجب» (يرسل `force=true`).
  * **D. القفل المتفائل**: كل استدعاء تحديث يُرسل `version` الحالي. معالج `handleMutationError` يلتقط `MODIFIED` → toast «تم تعديل المهمة من مستخدم آخر» + refetch، ويلتقط `BLOCKED` (JSON cause) لعرض رسالة الحجب بدقة.
  * **E. التأجيل**: زر «تأجيل» في الترويسة يفتح Popover بخيارات: ساعة، غدًا، أسبوع، مخصص (Calendar عربي locale arSA). حقل سبب اختياري. إن وُجد تأجيل نشط: شارة «مؤجلة حتى X» + زر «إلغاء التأجيل» (DELETE).
  * **F. التقدم المحسوب**: عرض `computedProgress` بجانب `progress` اليدوي عند الاختلاف، مع أيقونة Sparkles ووسم «التقدم المحسوب: X%». عرض `startedAt`، `completedAt`، `storyPoints` في بطاقة التقدم.
  * **G. حوار تغيير الحالة المحسّن**: قائمة الحقول المطلوبة (`requiredFields`) كـ checklist «هذا الانتقال يتطلب: ...». حقول ديناميكية: `stallReason` (لـ stalled)، `waitingReason` (لـ awaiting_info) — تظهر فقط عند الحاجة.
  * أنواع TypeScript صارمة: `TaskDetail`, `AvailableTransition`, `SnoozeRecord` بدل `any` قدر الإمكان.
  * استخدمت useMemo قبل أي early return (react-hooks/rules-of-hooks).

- إعادة كتابة `src/components/views/task-new-view.tsx` كاملة:
  * **حقل `definitionOfDone`** textarea بعد الوصف، مع أيقونة `ClipboardCheck` ووسم «اختياري لكن مُوصى به».
  * **حقل `storyPoints`** رقمي بجانب الساعات المقدّرة، مع تلميح «بديل للساعات المقدّرة (طريقة أجايل)».
  * **حقل `waitingReason`** للاستخدام المستقبلي، مع تلميح واضح أنه لا يؤثر في الإنشاء.
  * **تحقق صارم للمهام الجدية** (operational/financial/administrative/followup):
    - `assigneeIds` مطلوب (≥1) — Alert أمبر تحت عنوان «المسؤولون».
    - `priority` مطلوب (نجمة حمراء).
    - `dueDate` مطلوب (نجمة حمراء).
    - زر الإنشاء معطّل حتى تُستوفى هذه الشروط.
  * **تلميحات**: «المسؤول الرئيسي = أول مسند (يمكن تغييره لاحقًا)».
  * Alert تحذيري إن كان كل من `description` و `definitionOfDone` فارغًا (لا يمنع).
  * **عند النجاح**: `setView("task-detail", { id: created.id })` — يفتح تفاصيل المهمة المُنشأة.

- إعادة كتابة `src/components/views/kanban-view.tsx` كاملة:
  * **A. احترام سير العمل**: في `onDragEnd`، قبل أي استدعاء API، استدعِ `canTransition(task.status, newStatus, { isCreator, isAssignee, can })`. إن لم يُسمح: toast برسالة `check.reason` + لا تحرّك البطاقة (لا تحديث cache).
  * **A. جمع الحقول المطلوبة**: إن كان الانتقال يتطلب `stallReason`/`waitingReason` أو `force`، افتح `TransitionDialog` لجمعها قبل POST.
  * **B. شارة الحجب على البطاقة**: badge «🔒 محجوبة» برتقالي مع tooltip، تظهر للبطاقات ذات تبعيات finish_to_start غير مكتملة (محسوبة عبر `isBlockedClient` من `task.dependencies` المُضمَّنة).
  * **B. حوار تجاوز الحجب**: عند نقل بطاقة محجوبة إلى completed_review/approved، Dialog مع قائمة blockingTasks قابلة للنقر + checkbox «تجاوز الحجب» (يرسل `force=true`).
  * **C. ممرات السباحة (Swimlanes)**: زر «ممرات» (toggle) + Select لاختيار التجميع: حسب المسؤول / الإدارة / الأولوية. كل ممر = صف أفقي مستقل مع 8 أعمدة حالة داخله.
  * **D. حدود WIP**: Popover إعدادات في الترويسة. لكل عمود: حقل رقمي للحد الأقصى. عند التجاوز: حدود حمراء + Badge «count / limit» أحمر + شريط «تجاوز الحد المسموح (X/Y)». لا يمنع الإفلات (تحذير فقط).
  * **E. الجوال**: الأعمدة `min-w-max` مع ScrollArea أفقي، رؤوس الأعمدة `sticky top-0 z-10`، البطاقات `w-72 shrink-0`.
  * **القفل المتفائل**: إرسال `version` مع POST، رد الفعل على `MODIFIED` بـ toast + invalidate. معالجة أخطاء `BLOCKED` (parse JSON cause من رسالة الخطأ).

- جودة الكود:
  * Next.js 16 + TypeScript صارم، أقل `any` ممكن.
  * Arabic-first RTL، Tailwind semantic tokens (primary=teal، accent=orange)، لا blue/indigo مضافة حديثًا.
  * `nums` class للأرقام، خط Tajawal.
  * shadcn/ui: Dialog, Popover, Tooltip, Calendar, Select, Badge, Avatar, ScrollArea, Alert, Checkbox, Switch, Separator, Input, Textarea, Label, Button, Card.
  * dnd-kit: محافظ على البنية + إضافة طبقة فحص سير العمل قبل التحديث المتفائل.
  * react-hooks/rules-of-hooks مُحترمة (useMemo قبل early returns، TransitionDialog يُنشأ شرطياً من الوالد لضمان حالة نظيفة).
  * react-hooks/preserve-manual-memoization: لا أخطاء.
  * إمكانية الوصول: aria-label, role="region/alert/button", tabIndex=0, Enter/Space لفتح البطاقة.
  * Loading/Empty/Error states: skeletons، EmptyState، toasts.
  * `bun run lint`: 0 أخطاء في ملفاتي (تحذيران سابقان في app-sidebar و login-screen لا يخصاني).
  * `npx tsc --noEmit` (مستثنى examples/ و skills/): لا أخطاء.

Stage Summary:
- ثلاثة عروض رئيسية (تفاصيل، إنشاء، كانبان) أصبحت متوافقة بالكامل مع V1:
  * التفاصيل: حجب، DoD، تأجيل، قفل متفائل، تقدم محسوب، انتقالات ذكية مع جمع الحقول المطلوبة.
  * الإنشاء: حقول V1 (definitionOfDone، storyPoints، waitingReason) + تحقق صارم للمهام الجدية + تلميحات.
  * الكانبان: يحترم سير العمل بالكامل (canTransition قبل النقل)، شارات محجوبة، حوار تجاوز الحجب، ممرات سباحة، حدود WIP، تجاوب جوال.
- تعديل صغير آمن على GET /api/tasks لإضافة علاقة `dependencies` — يمكن للوكلاء التاليين الاستفادة منها.
- البنية التحتية (task-workflow, task-utils, client, store, constants, ui-bits) لم تُمَس — استُخدمت فقط.
- ملف العمل التفصيلي: `/agent-ctx/S5b-task-detail-new-kanban-enhancer.md`.

---
Task ID: S5a
Agent: Task List Views Enhancer (Z.ai Code)
Task: تحسين عرضي قائمة المهام (`tasks-view.tsx`) وأعمالي (`mywork-view.tsx`) — الخطوة 5a من V1 لتحسين إدارة المهام

Work Log:
- قراءة worklog.md ومراجعة البنية التحتية القائمة (task-workflow.ts، task-utils.ts، client.ts، store.ts، constants.ts، ui-bits/*، APIs من S3 و S4: bulk، views، snooze).
- إضافة API جديد: `GET /api/tasks/snoozes` (`src/app/api/tasks/snoozes/route.ts`) — يرجع تأجيلات المستخدم الحالي النشطة (until > now). ضروري لعرض قسم «مؤجّلة» في mywork-view.
- تعديل بسيط على `GET /api/tasks` لدعم `priority` و `type` كقائمة مفصولة بفواصل (`{ in: [...] }`) — متوافق مع `status` الذي كان يدعم ذلك مسبقًا. هذا التعديل ضروري لتمكين فلترة multi-select على الأولوية والنوع من الواجهة.

**File 1: `src/components/views/tasks-view.tsx` (تحسين شامل):**

أ) حالات التحميل والخطأ (P0):
- `TableSkeleton` — صفوف animate-pulse بمسحوبات Skeleton مطابقة للأعمدة (8 أعمدة + checkbox).
- `ErrorState` — بطاقة خطأ مع أيقونة AlertTriangle + رسالة + زر «إعادة المحاولة» يستدعي `refetch`.
- `placeholderData: keepPreviousData` — البيانات القديمة تبقى مرئية أثناء جلب الصفحة التالية.
- شارة «جارٍ التحديث» (Loader2 + نص) أعلى يمين الجدول عندما `isFetching && !isLoading`.
- تمييز «فارغ» عن «لا صلاحية» (user يفتقد `task.view.all` و `task.view.own` → EmptyState منفصلة).

ب) الفلاتر المتقدمة (P1):
- الحالة: متعدد الاختيار (OR داخل الحالة) عبر Popover + Checkbox.
- الأولوية + النوع: متعدد الاختيار عبر `MultiSelectPopover` مخصص.
- الإدارة، المسؤول، المشروع: اختيار واحد عبر `FilterSelect`.
- الوسوم: إدخال متعدد عبر `TagsInput` (chips قابلة للإزالة).
- نطاق تاريخ الاستحقاق: `<Input type="date">` من/إلى في Popover.
- بمرفقات / بدون مرفقات: `ToggleChip` (دعم API `hasAttachments`/`missingAttachments`).
- متأخرة / متعثرة / بانتظار اعتماد: `ToggleChip`.
- Mine: `MineSegmented` بـ4 خيارات (الكل / المسندة لي / أنشأتها / أتابعها).
- زر «مسح الفلاتر» يظهر عند وجود أي فلتر نشط + عداد للفلاتر النشطة.
- زر «حفظ العرض» يفتح Dialog لاسم العرض (+ خيار المشاركة لمن يملك `task.manage_views`) → POST `/api/tasks/views` → toast «تم حفظ العرض».
- زر «العروض المحفوظة» (DropdownMenu) لعرض القائمة + تثبيت/إلغاء تثبيت (Pin) + حذف + تحميل (يطبق filters + sort + groupBy).

ج) الترتيب والتجميع (P1):
- `SortControl` — Select بحقول (created/updatedAt/dueDate/priority/status/title/progress) + زر asc/desc. افتراضي `createdAt:desc`.
- `GroupControl` — Select باستخدام `GROUP_OPTIONS`.
- عند التجميع: `GroupedTaskList` يعرض أقسامًا قابلة للطي (Collapsible) لكل مفتاح مجموعة + عداد + checkbox لتحديد المجموعة (مع دعم الحالة المعيّنة جزئيًا «indeterminate»).
- الترتيب يُطبَّق داخل كل مجموعة (الـ API يرتب النتائج ثم تُجمَّع في الذاكرة عبر `groupTasks`).

د) الإجراءات الجماعية (P1):
- عمود Checkbox أول (لمن يملك `task.bulk_action`).
- Checkbox في الرأس «تحديد الكل» (يحدد كل عناصر الصفحة الحالية).
- شريط إجراءات جماعي ثابت أسفل الشاشة (`fixed bottom-4 left-1/2 -translate-x-1/2`) يظهر عند تحديد ≥1 مهمة: عداد «X محدد» + 6 أزرار (إسناد / الحالة / الأولوية / الموعد / الإدارة / الوسوم) + زر «إلغاء».
- كل زر يفتح Dialog بـ `BulkActionForm`:
  * status: Select للحالة + Checkbox لـ `force` (تجاوز الحجب).
  * priority: Select للأولوية.
  * dueDate: `<Input type="date">` (فارغ = إزالة).
  * department: Select للإدارة (مع خيار «بدون»).
  * tags: Input نصي مفصول بفواصل.
  * assign: قائمة Checkbox للمستخدمين + Select للمسؤول الرئيسي.
- زر «تنفيذ على X مهمة» → POST `/api/tasks/bulk`.
- على النجاح: تحديث متفائل في الـ cache (onMutate) واسترجاع عند الخطأ (onError) + إلغاء التحديد + `invalidateQueries(["tasks"])` + toast «تم تحديث X مهمة» مع زر «تراجع» لمدة 10 ثوانٍ (`duration: 10000`). زر التراجع يستدعي POST `/api/tasks/bulk/[id]/undo`.
- على الفشل الجزئي: toast يعرض أيضًا «تم تخطّي X مهمة» كوصف.

هـ) مزامنة الفلاتر مع URL (P1):
- `filtersToQuery(filters, sort, groupBy, page)` — يبني query string.
- `queryToFilters(qs)` — يحلل query string إلى filters.
- عند التحميل: يقرأ URL الحالي ويطبّق الفلاتر.
- عند أي تغيير: `history.replaceState` يحدّث URL دون إعادة تحميل.
- يدعم الإعداد المسبق عبر `useNav` store (`params.filter === "overdue"` → يفعّل فلتر المتأخرة).

تحسينات إضافية على الجدول:
- شارة «محجوبة» (Ban icon) باللون الأحمر عندما `status === "stalled"`.
- شارة الأولوية مع نقطة ملونة + Label (لا يعتمد على اللون وحده — إمكانية وصول).
- تمييز الموعد المتأخر: أحمر + bold + أيقونة Clock + tooltip بالتاريخ الكامل.
- صفوف قابلة للنقر (تفتح تفاصيل المهمة).

**File 2: `src/components/views/mywork-view.tsx` (تحسين شامل):**

9 أقسام (مرتبة حسب الأولوية):
1. **عاجل ومتأخر** — `priority === "urgent"` OR `dueDate < today` (ليست منتهية). مع تمييز برتقالي للحدود.
2. **مستحق اليوم** — `dueDate` ضمن اليوم الحالي (ليست منتهية).
3. **مستحق هذا الأسبوع** — `dueDate` خلال 7 أيام القادمة (بعد اليوم).
4. **محجوبة أو متعثرة** — `status === "stalled"` (مع تمييز أحمر للحدود).
5. **تنتظر إجراءك** — (`in_progress` AND assignee) OR (`awaiting_info` AND assignee) OR (`awaiting_approval` AND creator) OR (`completed_review` AND (creator OR canApprove)).
6. **أسندتها للآخرين** — creator AND has assignees AND NOT main assignee (ليست منتهية).
7. **أنشأتها** — createdById = me (ليست منتهية).
8. **أتابعها** — assignee with `role === "follower"`.
9. **مكتملة حديثًا** — `completed_approved` خلال آخر 7 أيام.

+ قسم إضافي **«مؤجّلة»** يظهر فقط عند وجود مهام مؤجّلة (لون برتقالي).

بطاقات إحصائية (4):
- عاجلة (Flame, orange) / متأخرة (AlertTriangle, red, مع trend) / مستحقة اليوم (CalendarClock, amber) / تنتظر إجراء (Hand, primary).

جلب البيانات:
- استعلامان متوازيان: `GET /api/tasks?mine=all&pageSize=200` + `GET /api/tasks/snoozes`.
- استبعاد المهام المؤجّلة من الأقسام النشطة وعرضها في قسم «مؤجّلة».

زر التأجيل (SnoozeButton):
- أيقونة `BellOff` صغيرة على كل صف. عند المرور (hover) على الصف، يظهر الزر. عند التأجيل، يبقى ظاهرًا باللون البرتقالي.
- النقر يفتح Popover بخيارات سريعة: «ساعة» (+1 ساعة) / «غدًا» (+24 ساعة) / «أسبوع» (+168 ساعة) / «تاريخ مخصص» — `<Input type="datetime-local">` + زر تأكيد.
- POST `/api/tasks/[id]/snooze` بـ `{ until, reason }`.
- بعد التأجيل: `invalidateQueries(["mywork-snoozes"])` → المهمة تنتقل لقسم «مؤجّلة».
- زر «إلغاء التأجيل» في صف المهام المؤجّلة → DELETE `/api/tasks/[id]/snooze`.

smartSort من task-utils.ts يطبَّق داخل كل قسم لترتيب: التعثر → الأولوية → قرب الموعد → الحالة.

حالات التحميل والخطأ:
- skeleton: 4 بطاقات + 3 أقسام placeholder.
- خطأ: EmptyState مع أيقونة AlertTriangle + رسالة + زر إعادة المحاولة.

إمكانية الوصول (a11y):
- `aria-label` على أزرار الأيقونات (تأجيل/إلغاء التأجيل).
- الأولوية كنقطة + Label (لا يعتمد على اللون وحده).
- شارة «محجوبة» بصريًا ونصيًا.
- التواريخ بـ `relativeTime` + tooltip بالتاريخ الكامل.

جودة الكود:
- TypeScript صارم، أقل `any` ممكن (interfaces صريحة لـ TaskListItem و SnoozeInfo).
- `useQuery` + `apiFetch` + `useMutation` + `useQueryClient`.
- React Compiler: الالتزام بـ dependencies الكاملة في useMemo (تمرير `user` بدل `user.id`/`user.role`).
- RTL عربي أول، shadcn/ui، Tailwind semantic tokens.
- لا ألوان blue/indigo جديدة (استبدلتها بـ teal/orange/amber في PriorityBadgeWithDot و «مؤجّلة»).
- تجاوب كامل (mobile-first): الشبكات `grid-cols-2 lg:grid-cols-4`، الجدول يخفي أعمدة على الموبايل، الشريط الجماعي يلتف.
- استخدام `nums` على كل الأرقام.
- Next.js 16: لا `setState` داخل `useEffect` — استخدمت `history.replaceState` مباشرة.
- `bun run lint` نظيف على ملفاتي (لا أخطاء ولا تحذيرات).
- `npx tsc --noEmit` نظيف على ملفاتي (لا أخطاء).
- ملف العمل التفصيلي: `/agent-ctx/S5a-task-list-views-enhancer.md`.

Stage Summary:
- تم تحسين العرضين بشكل شامل وفقًا لمتطلبات V1.
- العروض الآن تتعامل مع حالات التحميل/الخطأ/الإعادة بشكل احترافي (Skeleton + ErrorState + retry + keepPreviousData + «جارٍ التحديث»).
- الفلاتر المتقدمة مع دعم multi-select للأولوية والنوع والحالة، نطاق التواريخ، الوسوم، ومفهوم «mine» الموسع (all/assigned/created/following).
- الترتيب والتجميع مع أقسام قابلة للطي، الترتيب داخل كل مجموعة.
- الإجراءات الجماعية الكاملة مع تحديث متفائل، شريط ثابت، 6 أنواع إجراءات، زر تراجع لمدة 10 ثوانٍ.
- العروض المحفوظة CRUD كامل عبر الـ UI (حفظ/تحميل/تثبيت/حذف).
- مزامنة الفلاتر مع URL عبر `history.replaceState`.
- «أعمالي» أصبحت مركزًا يوميًا بـ9 أقسام ذكية + 4 بطاقات إحصائية + زر تأجيل على كل مهمة + قسم «مؤجّلة» منفصل.
- API جديد `/api/tasks/snoozes` لتتبع التأجيلات.
- تعديل بسيط على `/api/tasks` لدعم multi-value priority/type (متوافق مع status).
- جودة عالية: RTL، a11y، TypeScript صارم، لا ألوان blue/indigo جديدة، تجاوب كامل.
- الوكلاء التاليون يمكنهم البناء فوق هذه العروض لإضافة المزيد من التحسينات (مثل تكامل القفل المتفائل مع toast تفصيلي، أو إضافة المزيد من الإجراءات الجماعية).

---
Task ID: V1-COMPLETE
Agent: Main (Z.ai Code)
Task: إكمال الإصدار الأول (V1) لتطوير إدارة المهام

Work Log (سلّم 1-7):
- **سلّم 1 (DB):** إضافة 5 نماذج جديدة (TaskStatusTransition, TaskView, TaskSnooze, BulkAction, AutomationRule) + 8 حقول على Task (definitionOfDone, storyPoints, waitingReason, startedAt, completedAt, cancelledAt, archivedAt, version) + فهارس جديدة. مزامنة schema.prisma ↔ schema.dev.prisma ↔ schema.prod.prisma. db:push ناجح.
- **سلّم 2 (محرّك سير العمل):** إنشاء src/lib/task-workflow.ts (مصدر الحقيقة الوحيد: TRANSITIONS map + canTransition + getRequiredFields + getAvailableTransitions + STATUS_CATEGORIES). إنشاء src/lib/task-utils.ts (computeProgress, getBlockingInfo, wouldCreateCycle, checkRequiredFields, parseSort, buildOrderBy, smartSort, groupTasks). إضافة صلاحيات جديدة (task.change_status, task.bulk_action, task.manage_views, task.export, task.manage_workflow) في permissions.ts + client.ts. إضافة TASK_DEPENDENCY_TYPES + BULK_ACTIONS في constants.ts.
- **سلّم 3 (إصلاح APIs):** (وكيل فرعي S3) إعادة كتابة /api/tasks/[id]/status باستخدام task-workflow.ts — إصلاح خطأ hasMissing المنطقي، إضافة فحص الحجب، القفل المتفائل (version→409)، كتابة TaskStatusTransition مع exitedAt، ضبط startedAt/completedAt/cancelledAt، تسجيل محاولات الرفض. تحسين GET /api/tasks (sort, groupBy, dueBefore/After, hasAttachments, tags, mine split). تحسين GET/PATCH /api/tasks/[id] (isBlocked, blockingTasks, computedProgress, availableTransitions, snoozes, version).
- **سلّم 4 (APIs جديدة):** (وكيل فرعي S4) إنشاء /api/tasks/bulk (POST + undo) مع BulkAction للتراجع. /api/tasks/views (GET/POST) + /[id] (PATCH/DELETE). /api/tasks/[id]/snooze (POST/DELETE). /api/tasks/[id]/dod (PATCH). كلها مع RBAC + تدقيق + نشاط.
- **سلّم 5 (عروض محسّنة):** (وكيلان فرعيان S5a + S5b بالتوازي)
  - tasks-view.tsx (~1700 سطر): Skeleton/Error/Retry + keepPreviousData + "جارٍ التحديث" badge، فلاتر OR/AND متقدمة (status/priority/type multi-select, tags chips, date range, hasAttachments), حفظ العروض, ترتيب (7 حقول), تجميع (7 خيارات), إجراءات جماعية (6 أنواع) مع Undo toast 10ث, URL filter sync.
  - mywork-view.tsx (~800 سطر): 9 أقسام (عاجل ومتأخر/مستحق اليوم/مستحق الأسبوع/محجوبة أو متعثرة/تنتظر إجراءك/أسندتها/أنشأتها/أتابعها/مكتملة حديثًا) + 4 بطاقات إحصائية + smartSort + Snooze popover + قسم مؤجلة.
  - task-detail-view.tsx: حذف STATUS_TRANSITIONS المحلية، استخدام availableTransitions من API, قسم DoD, لافتة حجب + force, القفل المتفائل (MODIFIED→refetch), Snooze, computedProgress.
  - task-new-view.tsx: حقول definitionOfDone + storyPoints + waitingReason, تحقق إلزامي (assignee/priority/dueDate للمهام الجدية).
  - kanban-view.tsx: canTransition قبل النقل (revert + toast), حوار جمع الحقول, شارة محجوبة 🔒, ممرات سباحة (3 أوضاع), حدود WIP, محمول scrollable.
- **سلّم 6 (تكامل + اختبار):** تابع فعليًا بالـ Agent Browser:
  - الدخول كمدير شركة ✓
  - قائمة المهام: عداد 9 مهام, فلاتر (الكل/المسندة لي/أنشأتها/أتابعها), ترتيب, تجميع, حفظ العرض, عمود تحديد الكل, pagination ✓
  - تفاصيل المهمة: زر تأجيل, قسم DoD مع تلميح, قائمة تحقق, الخط الزمني ✓
  - كانبان: ممرات السباحة + حدود WIP + 8 أعمدة ✓
  - أعمالي: 4 بطاقات + 9 أقسام جميعها ظاهرة ✓
  - نموذج إنشاء: DoD + storyPoints + تحقق إلزامي ✓
  - حوار تغيير الحالة: الانتقالات المسموحة فقط تظهر (من "مسندة": قيد التنفيذ/بانتظار معلومات/متعثرة/ملغاة — لا تظهر "جديدة" أو "مكتملة") ✓ (إثبات أن task-workflow.ts يُطبّق)
  - سجل التدقيق: يعرض الإجراءات (تسجيل دخول + IP) ✓
  - الاستجابة للجوال (390x844): تعمل ✓
  - لا أخطاء runtime في console ✓
- **سلّم 7 (توثيق + نشر):** تحديث worklog.md (هذا القسم), lint نظيف, tsc بلا أخطاء, جاهز للرفع على GitHub.

Stage Summary:
- V1 مكتمل بالكامل (7 سلالم)
- 3 ثغرات حرجة أُصلحت: (1) انتقالات في الخادم بدل client, (2) منطق المرفقات الإلزامية, (3) فحص التبعيات الحاجبة
- 5 نماذج + 8 حقول جديدة قابلة للتراجع (كلها nullable/default + backfill متاح)
- 4 صلاحيات جديدة منفصلة
- 9 APIs جديدة (bulk+undo, views CRUD, snooze, dod) + 3 APIs محسّنة (status, list, detail)
- 5 عروض محسّنة (tasks ~1700 سطر, mywork ~800, kanban, task-detail, task-new)
- اختبار Agent Browser: جميع المسارات الحرجة تعمل, لا أخطاء
- جاهز للرفع على GitHub → Railway سيعيد النشر تلقائيًا

---
Task ID: DEL-1
Agent: Delete UI Builder
Task: إضافة أزرار حذف المرفقات وحذف المهام في منصة متابعة المهام (Arabic-first RTL)

Work Log:
- قراءة سجل العمل السابق وفهم البنية (TaskDetailView، canClient، apiFetch، useToast، task-workflow.ts). قسم المرفقات موجود في `task-detail-view.tsx` (وليس tasks-view.tsx كما في التعليمات) — أُضيف الزر هناك لأنه موقع العرض الفعلي.
- استيرادات جديدة في `task-detail-view.tsx`:
  - `AlertDialog` وملحقاته (`AlertDialogAction`, `AlertDialogCancel`, `AlertDialogContent`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogHeader`, `AlertDialogTitle`) من `@/components/ui/alert-dialog`.
  - `Trash2` من `lucide-react`.
  - `getStatusCategory` من `@/lib/task-workflow` (لتحديد فئة الحالة → not_started / in_progress / done) لاختيار نص الوصف المناسب.
- تعديل قسم المرفقات (السطور ~461-495):
  - غلاف الصف أصبح `<div>` نسبيًا بدل `<a>` مباشر، مع إبقاء `<a href>` داخل المنطقة الرئيسية (flex-1) ليبقى الرابط قابلًا للنقر لفتح المرفق.
  - زر حذف منفصل (`AttachmentDeleteButton`) كأخ للرابط (shrink-0) — لا يوقف عمل الرابط.
  - يظهر فقط إذا `canEdit` (المستخدم منشئ/مسؤول مع task.edit) — معاد استخدام `canEdit` الحالي.
- مكوّن جديد `AttachmentDeleteButton`:
  - زر ghost صغير (h-7 w-7) بأيقونة `Trash2` و `aria-label="حذف المرفق"`.
  - `e.preventDefault()` و `e.stopPropagation()` على الزر حتى لا يفتح الرابط عند النقر على زر الحذف.
  - `AlertDialog` للتأكيد يعرض اسم الملف.
  - `AlertDialogAction` مع `e.preventDefault()` في الـ handler لمنع الإغلاق التلقائي حتى تنتهي العملية.
  - على نجاح DELETE `/api/tasks/[id]/attachments/[attachmentId]`: toast «تم حذف المرفق» + إغلاق الحوار + `invalidateAll()`.
  - على فشل: toast بالخطأ (destructive) ويبقى الحوار مفتوحًا.
  - حالات: spinner داخل الزر أثناء الحذف (`Loader2 animate-spin`) + تعطيل الإلغاء والحذف أثناء التنفيذ.
- مكوّن جديد `DeleteTaskButton`:
  - زر `variant="destructive"` بحجم sm مع `Trash2` و label «حذف المهمة».
  - يُعرض في الترويسة في نهاية صف الأزرار (آخر عنصر في الـ flex-row RTL = يسار بصريًا) بعد `EditTaskDialog` و `StatusChangeButton` و `SnoozeButton`.
  - شرط العرض: `task.createdById === user.id` OR `canClient(user, "task.delete")` OR `canClient(user, "task.edit")`.
  - `AlertDialog` بعنوان «حذف المهمة» وأيقونة `AlertTriangle` حمراء.
  - نص الوصف يتكيف مع فئة الحالة عبر `getStatusCategory(task.status)`:
    - not_started (draft/new/assigned): «سيتم حذف المهمة نهائيًا. لا يمكن التراجع.»
    - in_progress (in_progress/awaiting_*/stalled/completed_review): «سيتم أرشفة المهمة أولًا (حذف ناعم). للحذف النهائي استخدم خيار «الحذف النهائي».»
    - done (completed_approved/cancelled/archived): «سيتم حذف المهمة نهائيًا وجميع بياناتها (تعليقات، مرفقات، سجل).»
  - حقل تأكيد `confirmText` يظهر فقط إذا للمهمة مهام فرعية أو تعليقات؛ يلزم مطابقة عنوان المهمة أو كلمة «تأكيد» لتفعيل زر «الحذف النهائي» فقط (الأرشفة لا تتطلب تأكيدًا).
  - زرّان للإجراء:
    1. «أرشفة فقط» (outline) → `DELETE /api/tasks/[id]` بدون `?hard=true`. على نجاح: toast «تمت أرشفة المهمة» + `onChanged()` + `onDone()` (تعيد المستخدم لقائمة المهام).
    2. «الحذف النهائي» (destructive) → `DELETE /api/tasks/[id]?hard=true`. على نجاح: toast «تم حذف المهمة نهائيًا» + نفس الإجراءات. معطّل إذا كان `requiresConfirm && !confirmMatches` أو لا يملك `task.delete`/منشئ.
  - عند 400 (مثال: مهام فرعية نشطة) — تُلتقط رسالة الخطأ من `apiFetch` (`err.message` = `data.error`) وتُعرض داخل الحوار في صندوق أحمر (`role="alert"`) ويبقى الحوار مفتوحًا لإتاحة إعادة المحاولة. `setBusy(null)` يُعاد تفعيل الأزرار.
  - استخدام `Button` العادية بدل `AlertDialogAction` للأزرار التشغيلية لإبقاء الحوار مفتوحًا حتى أنا من يتحكم في `setOpen(false)`. `AlertDialogCancel` يُغلق افتراضيًا (سلوك صحيح للإلغاء).
- `invalidateAll()` يُعاد استخدامها لإبطال: `["task", id]`, `["tasks"]`, `["mywork"]`, `["kanban"]`, `["calendar"]` — يطابق المتطلبات.
- الوصولية (a11y):
  - `aria-label="حذف المرفق"` و `aria-label="حذف المهمة"` على الأزرار.
  - `role="alert"` على صندوق رسالة الخطأ.
  - `htmlFor`/`id` على label التأكيد والحقل.
  - التركيز يُدار تلقائيًا عبر radix AlertDialog (focus trap + ESC للإغلاق).
  - تعطيل الأزرار أثناء التحميل لمنع النقرات المزدوجة.
- جودة الكود:
  - TypeScript صارم بدون `any` جديد في توقيعات الدوال (توقيعات صريحة لـ props). استخدمت `any` فقط في `catch (err: any)` كما هو معتاد في الكود القائم.
  - استخدمت `apiFetch` و `useToast` و `useQueryClient` (عبر `invalidateAll` المُمرَّر) — لا fetch مباشر ولا state management جديد.
  - `bun run lint` نظيف على ملفاتي (تحذيرات موجودة مسبقًا في app-sidebar.tsx و login-screen.tsx فقط، ليست لي).
  - `npx tsc --noEmit` نظيف تمامًا على ملفاتي (لا أخطاء).
  - لا ألوان blue/indigo جديدة (استخدمت destructive/redTailwind tokens الموجودة).
  - RTL عربي أول: نصوص واضحة، أيقونات في الاتجاه الصحيح، تباعد منطقي.
  - تجاوب: الحوارات `sm:max-w-md`/`sm:max-w-lg`، الأزرار تلتفت (`flex-wrap` على الحاوية الأم).
- ملاحظة عن عدم تطابق اسم الملف: التعليمات ذكرت `tasks-view.tsx` لقسم المرفقات، لكن قسم المرفقات فعليًا في `task-detail-view.tsx`. طبّقتُ كلا التغييرين (المرفقات + زر حذف المهمة) في `task-detail-view.tsx` لأنه الموقع الصحيح.

Stage Summary:
- أُضيف زر حذف صغير لكل مرفق في صفحة تفاصيل المهمة، مع `AlertDialog` للتأكيد يعرض اسم الملف، يستدعي `DELETE /api/tasks/[id]/attachments/[attachmentId]`، ثم toast + invalidate. يظهر فقط إذا `canEdit`.
- أُضيف زر «حذف المهمة» في ترويسة تفاصيل المهمة (يسار بصريًا في RTL)، بحوار تأكيد ذكي:
  - نص الوصف يتكيف مع فئة الحالة (not_started/in_progress/done).
  - زرّا «أرشفة فقط» و «الحذف النهائي».
  - حقل تأكيد كتابي (عنوان المهمة أو «تأكيد») يلزم لتفعيل الحذف النهائي فقط عند وجود مهام فرعية/تعليقات.
  - رسائل خطأ 400 تُعرض داخل الحوار ويبقى مفتوحًا لإعادة المحاولة.
- صلاحيات صحيحة على مستوى الـ UI (تطابق صلاحيات الـ API): `createdById === user.id` OR `task.delete` OR `task.edit` للحذف، `canEdit` للمرفقات.
- `bun run lint` و `npx tsc --noEmit` نظيفان على ملفاتي.
- لا تغييرات في الـ API (الخادم جاهز مسبقًا حسب التعليمات).
- الملف المعدّل: `src/components/views/task-detail-view.tsx` فقط.
