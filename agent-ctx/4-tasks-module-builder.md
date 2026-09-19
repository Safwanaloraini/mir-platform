# Task ID: 4 — Tasks Module Builder

وكيل بناء وحدة المهام لمنصة «مير».

## النطاق
- APIs:
  - `src/app/api/tasks/route.ts` (GET list with filters + POST create)
  - `src/app/api/tasks/[id]/route.ts` (GET detail + PATCH update)
  - `src/app/api/tasks/[id]/status/route.ts` (POST change status with transition rules)
  - `src/app/api/tasks/[id]/comments/route.ts` (POST comment)
  - `src/app/api/tasks/[id]/checklist/route.ts` (POST add / PATCH-like toggle/rename via body.id)
  - `src/app/api/tasks/[id]/attachments/route.ts` (POST attachment metadata)
- Views (`src/components/views/`):
  - `mywork-view.tsx`, `tasks-view.tsx`, `task-detail-view.tsx`,
    `task-new-view.tsx`, `kanban-view.tsx`, `calendar-view.tsx`

## قواعد التصميم المعتمدة
- عربي أول RTL، ألوان مير (تيل #004645، برتقالي #ff7f32)، لا أزرق/إنديغو إلا chips الحالات الدلالية الموروثة من `STATUS_COLOR_CLASSES`
- الصلاحيات: `task.create`, `task.view.all`/`task.view.own`, `task.edit`, `task.assign`, `task.approve_completion`
- توليد رقم المهمة ذريًا داخل معاملة (max(number)+1)
- كل تحول حالة يُسجَّل في TaskStatusHistory + AuditLog + ActivityLog + Notifications
- `completed_approved` يتطلب `task.approve_completion` + اكتمال كل عناصر checklist الإلزامية + وجود المرفقات الإلزامية
- Next.js 16: `ctx.params` Promise — يُنتظر
- مرجع النمط: `dashboard-view.tsx`
- استخدمت `Request` بدل `NextRequest` لتوافق توقيع `apiHandler` (لا تغيير على lib/api.ts)
- استخدمت `throw new Error("NOT_FOUND")` مباشرة (بدل helper `notFound()`) لضمان narrow النوع في TS

## ما تم إنجازه
### APIs (6 ملفات)
1. `GET /api/tasks` — قائمة مع فلاتر: status, priority, type, departmentId, assigneeId, projectId, overdue, stalled, search, mine, page, pageSize. نطاق: `task.view.all` أو منشئ/مسند. ترجع `{ items, total, page, pageSize }`.
2. `POST /api/tasks` — إنشاء: title (مطلوب) + description + type + source + priority + departmentId + projectId + costCenterId + parentId + assigneeIds + mainAssigneeId + dates + estimatedHours + tags + checklist + isRecurring/recurrence. رقم ذري، إسنادات + mainAssigneeId مع صحّة، Checklist، TaskStatusHistory أولي، إشعارات للمسندين، Audit + Activity.
3. `GET /api/tasks/[id]` — تفاصيل كاملة (department, project, costCenter, createdBy, parent, subtasks, assignees.user, dependencies.dependsOn, blockingTasks.task, checklist, comments.user, attachments, statusHistory.user, request, meeting, decision).
4. `PATCH /api/tasks/[id]` — تحديث الحقول + تعديل الإسناد (يتطلب task.assign) + تغيير الحالة (يكتب statusHistory + يتحقق من شروط completed_approved).
5. `POST /api/tasks/[id]/status` — تغيير حالة مع التحقق: completed_approved يتطلب صلاحية + checklist إلزامي منجز + مرفقات إلزامية موجودة. stalled يتطلب stallReason. completed_review يتطلب منشئ/مسؤول. تحديث progress لـ100 عند الإكمال. إشعارات + Audit.
6. `POST /api/tasks/[id]/comments` — تعليق + mentions + إشعارات + Audit.
7. `POST /api/tasks/[id]/checklist` — إضافة عنصر أو تعديله (body.id) مع تحديث completedAt وتحديث progress المهمة.
8. `POST /api/tasks/[id]/attachments` — تسجيل مرفق (بيانات وصفية) + required flag + Audit.

### Views (6 ملفات)
1. **mywork-view** — أعمالي: بطاقات إحصائية، أجندة اليوم، المهام المتأخرة، "ما يحتاج تدخلي"، قوائم حسب الحالة (مفتوحة/بانتظار/مكتملة) مع شريط تمرير مخصص.
2. **tasks-view** — قائمة المهام المتقدمة: بحث + فلاتر متعددة (status multi-select popover, priority, type, department, assignee, overdue, stalled, approval-pending, missing-attachments, mine) + جدول (رقم، عنوان، حالة، أولوية، مسؤول، إدارة، موعد، تقدم) + ترقيم صفحات + دعم `params.filter==="overdue"` + زر إنشاء (إن سُمح) + زر تصدير (إن سُمح).
3. **task-detail-view** — صفحة تفصيلية: ترويسة مع badges، زر تغيير الحالة (Dialog مع قواعد الانتقال)، تعديل المهمة (Dialog)، إدارة المسؤولين (Dialog)، تقدم (Slider)، قائمة تحق (Checkboxes + إضافة)، تعليقات (قائمة + إضافة)، خط زمني للحالة، المرفقات، التبعيات، الروابط (طلب/اجتماع/قرار). صلاحيات تطبَّق على مستوى الواجهة.
4. **task-new-view** — نموذج إنشاء: title + description + type/source/priority + department/project/costCenter + parent task + assignees (multi-select مع تعيين رئيسي بنجمة) + dates + estimatedHours + tags + isRecurring/recurrence + checklist dynamic. تحذير (لا منع) عند عدم وجود مسؤولين. إعادة توجيه لصفحة التفاصيل بعد النجاح.
5. **kanban-view** — لوحة كانبان بـ @dnd-kit/core: 8 أعمدة (الحالات النشطة)، سحب وإفلات بين الأعمدة، تحديث متفائل + استرجاع عند الفشل، بطاقات (رقم، عنوان، نقطة أولوية، أفاتار مسؤول، موعد نسبة، تقدم)، تمرير أفقي للموبايل.
6. **calendar-view** — تقويم شهري (date-fns مع locale عربي، الأسبوع يبدأ السبت): يعرض المهام المستحقة في كل يوم كبطاقات صغيرة + نقاط ألوان حسب الأولوية، لوحة جانبية للمهام المختارة في اليوم، ملخص الشهر.

## الجودة
- ESLint: نظيف لكل ملفاتي
- TypeScript: لا أخطاء في ملفاتي
- RTL + Arabic + responsive + loading/empty/error states في كل مكان
- الاستخدام المتسق لـ StatCard / PageHeader / SectionCard / EmptyState / StatusBadge / PriorityBadge
- استخدام `nums` class للأرقام LTR داخل النص العربي
- استخدام `apiFetch`, `useQuery`, `useQueryClient.invalidateQueries` للتحديثات
- useToast للإشعارات

## النهاية
الوحدة جاهزة للاستخدام وفق المواصفات.
