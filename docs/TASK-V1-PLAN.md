# تقرير فجوات إدارة المهام + خطة الإصدار الأول (V1)
**التاريخ:** 2026-09-20  **الحالة:** فحص + تخطيط (قبل التنفيذ)

---

## 1. ملخص الفحص

### التقنية الحالية
- **Framework:** Next.js 16 (App Router, Turbopack) + TypeScript 5 + Tailwind 4 + shadcn/ui
- **DB:** Prisma — مزدوج: SQLite محليًا (`schema.prisma`/`schema.dev.prisma`) + PostgreSQL إنتاج (`schema.prod.prisma`)
- **State:** React Query (server) + Zustand (client nav/filters)
- **Auth:** جلسات httpOnly + HMAC, RBAC على مستوى API, سجل تدقيق/نشاط/إشعارات
- **Deployment:** Railway (Docker, PostgreSQL مدارة)
- **كود المهام الحالي:** ~2,425 سطر عروض + ~917 سطر APIs = ~3,342 سطر

### نموذج المهمة الحالي (موجود)
| الحقل | النوع | الحالة |
|---|---|---|
| id, number (@unique) | String/Int | ✅ جيد |
| title, description | String | ✅ |
| type (6), source (5), status (11), priority (4) | String | ✅ |
| progress (0-100) | Int | ✅ |
| orgId, departmentId, projectId, costCenterId | String? | ✅ |
| parentId (مهام فرعية ذاتية العلاقة) | String? | ✅ |
| mainAssigneeId (@unique عبر TaskAssignee) | String? | ⚠️ يقيد النمذجة |
| createdById, startDate, dueDate, estimatedHours | - | ✅ |
| stallReason, isRecurring, recurrence (نص), tags (comma string) | - | ⚠️ بدائية |
| createdAt, updatedAt | DateTime | ✅ |
| **@index:** status, departmentId, mainAssigneeId, projectId | | ✅ |

### النماذج المساعدة الحالية
- `TaskAssignee` (taskId, userId, role responsible/contributor/follower, isMain, @@unique taskId+userId)
- `TaskDependency` (taskId, dependsOnId, type افتراضي finish_to_start, @@unique)
- `TaskChecklistItem` (text, done, order, required, completedAt)
- `TaskComment` (text, mentions)
- `TaskAttachment` (fileName, fileUrl, required)
- `TaskStatusHistory` (fromStatus?, toStatus, note?, createdAt) — ⚠️ **لا يوجد exitedAt**

---

## 2. الفجوات المرصودة (مرتبة حسب الأولوية)

### P0 — الأساس التشغيلي

#### فجوة 1: نموذج المهمة
| المتطلب | الحالة | الملاحظة |
|---|---|---|
| رقم مرجعي ثابت | ✅ | `number` موجود |
| عنوان واضح | ✅ | لكن POST يتحقق فقط من العنوان |
| وصف غني | ⚠️ | `description` نص بسيط (لا Markdown/Tiptap) |
| نوع/حالة/أولوية | ✅ | |
| إدارة/مشروع/مركز تكلفة | ✅ | |
| مسؤول رئيسي | ⚠️ | `mainAssigneeId` @unique يقيد — لكنه يعمل |
| مساهمون/متابعون | ✅ | عبر `TaskAssignee.role` |
| تواريخ بدء/استحقاق | ✅ | |
| تقدير جهد | ⚠️ | `estimatedHours` فقط (لا نقاط/story points) |
| نسبة تقدم محسوبة من الفرعية/checklist | ❌ | تُحدّث يدويًا فقط |
| وسوم | ⚠️ | comma string (لا فلترة بكفاءة) |
| قائمة تحقق | ✅ | لكن **لا يوجد "Definition of Done" منفصل** |
| مرفقات/تعليقات | ✅ | |
| مهمة رئيسية/فرعية | ✅ | |
| علاقات (تحجب/محجوبة/مرتبطة/مكررة) | ⚠️ | فقط `finish_to_start` افتراضيًا، لا أنواع أخرى، **لا منع دورات** |
| سبب التعثر/الانتظار | ⚠️ | `stallReason` موجود لكن لا `waitingReason` منفصل |
| معيار إنجاز (DoD) | ❌ | غير موجود |
| دليل إنجاز اختياري/إلزامي | ❌ | غير موجود |
| تواريخ تغيّر الحالة | ⚠️ | `statusHistory` لكن لا `exitedAt` لكل حالة |

#### فجوة 2: سير العمل
| المتطلب | الحالة | الملاحظة |
|---|---|---|
| فئات أساسية (غير مبدوءة/قيد التنفيذ/منتهية) | ❌ | حالات مسطحة فقط |
| حالات داخلية قابلة للتخصيص | ❌ | ثابتة في الكود |
| انتقالات مسموحة | ⚠️ | **معرّفة في client فقط (`STATUS_TRANSITIONS`)** — ثغرة أمنية |
| صلاحية لكل انتقال | ❌ | غير مطبّق |
| حقول واجب استكمالها لكل انتقال | ❌ | غير مطبّق |
| مخطط سير العمل في الإعدادات | ❌ | غير موجود |

#### فجوة 3: شاشة «أعمالي»
| المتطلب | الحالة |
|---|---|
| عاجل ومتأخر | ⚠️ جزئي (متأخر موجود، عاجل غير مفصول) |
| مستحق اليوم | ✅ |
| مستحق هذا الأسبوع | ❌ |
| محجوبة أو متعثرة | ⚠️ (متعثرة فقط، لا محجوبة) |
| تنتظر إجراء المستخدم | ✅ |
| أسندتها للآخرين | ❌ |
| أنشأها المستخدم | ❌ (مدمجة مع mine) |
| يتابعها المستخدم | ❌ |
| مكتملة حديثًا | ⚠️ (مكتملة فقط بدون حد زمني) |
| ترتيب (تعثر/أولوية/موعد/حالة) | ❌ (ترتيب افتراضي createdAt desc) |
| تأجيل Snooze | ❌ |

#### فجوة 4: التحميل وحالات الواجهة
| المتطلب | الحالة |
|---|---|
| Skeleton loaders | ⚠️ جزئي (mywork فقط) |
| لا قيم صفرية قبل اكتمال الطلب | ❌ (tasks-view يعرض جدولًا فارغًا) |
| فصل تحميل/فراغ/خطأ/صلاحية | ❌ |
| زر إعادة المحاولة | ❌ |
| عدم مسح البيانات أثناء التحديث | ⚠️ (React Query `keepPreviousData` غير مفعّل) |
| مؤشر "جارٍ التحديث" | ❌ |

### P1 — الإنتاجية والتنظيم

| المتطلب | الحالة |
|---|---|
| عروض موحدة (نفس الفلاتر) | ❌ كل عرض له منطق منفصل |
| تجميع حسب الحالة/المسؤول/الإدارة/المشروع/الأولوية/الموعد | ❌ |
| ترتيب متعدد المعايير | ❌ (فقط createdAt desc) |
| إظهار/إخفاء أعمدة | ❌ |
| فلاتر AND/OR | ❌ |
| حفظ العرض باسم | ❌ (لا `TaskView` model) |
| عروض شخصية/مشتركة | ❌ |
| تثبيت في القائمة الجانبية | ❌ |
| فلاتر في URL | ⚠️ جزئي (Zustand فقط) |
| إجراءات جماعية | ❌ |
| Undo | ❌ |
| اختصارات لوحة مفاتيح | ❌ |
| كانبان: أعمدة قابلة للضبط | ❌ (ثابتة) |
| كانبان: حدود WIP | ❌ |
| كانبان: Swimlanes | ❌ |
| كانبان: منع انتقال غير مسموح | ❌ (أي drop يغيّر الحالة) |
| كانبان: محمول | ⚠️ (scroll أفقى فقط) |
| Timeline/Gantt | ❌ |
| المسار الحرج | ❌ |
| أثر تغيير الموعد | ❌ |
| قوالب مهام | ❌ (لا `TaskTemplate` model) |
| مهام متكررة حقيقية (RRULE) | ❌ (نص بسيط، لا توليد تلقائي) |
| نموذج استقبال طلب | ❌ |
| فرز أولي | ❌ |
| كشف التكرار | ❌ |
| محرك أتمتة (Trigger→Conditions→Actions) | ❌ (لا `AutomationRule` model) |

### P2 — الإدارة والقياس

| المتطلب | الحالة |
|---|---|
| حمل العمل والطاقة الاستيعابية | ❌ (لا `WorkloadCapacity` model) |
| Lead time / Cycle time | ❌ (لا تواريخ الانتقال محسوبة) |
| عمر المهام المفتوحة | ⚠️ (يحسب من createdAt لكن غير معروض) |
| نسبة الالتزام بالمواعيد | ❌ |
| وقت في كل حالة | ❌ (statusHistory بدون exitedAt) |
| مهام معاد فتحها | ❌ (لا تتبع) |
| مخطط تدفق تراكمي (CFD) | ❌ |
| اختناقات سير العمل | ❌ |
| الرسوم قابلة للنقر | ❌ |
| إشعارات مركّزة على الإجراء | ⚠️ (موجودة لكن غير مصنّفة) |
| Snooze الإشعارات | ❌ |
| ملخص يومي/أسبوعي | ❌ |
| تجميع الإشعارات المتشابهة | ❌ |

### الصلاحيات والأمان
| المتطلب | الحالة |
|---|---|
| RBAC موجود | ✅ |
| رؤية المهمة | ✅ (`task.view.all/dept/own`) |
| إنشاء/تعديل/حذف | ✅ |
| إسناد | ✅ |
| تغيير الحالة (منفصل) | ❌ (مدمج مع edit) |
| اعتماد الإنجاز | ✅ |
| إدارة القوالب | ❌ |
| إدارة الأتمتة | ❌ |
| إدارة سير العمل | ❌ |
| تصدير | ⚠️ (`report.export` لكن غير مخصص للمهام) |
| تسجيل محاولات مرفوضة | ❌ (تُرمى 403 بدون تسجيل) |
| الانتقالات في الخادم | ❌ (ثغرة — في client فقط) |

### التقنية
| المتطلب | الحالة |
|---|---|
| Server-side pagination/filtering/sorting | ⚠️ (pagination نعم، sorting لا) |
| منع N+1 | ⚠️ (subtasks لكل مهمة) |
| فهارس DB | ⚠️ (موجودة لكن ناقصة) |
| Optimistic updates | ❌ |
| سلامة التحرير المتزامن | ❌ (لا version/etag) |
| اختبارات | ❌ (ممنوعة حسب قواعد المشروع) |
| مراقبة API | ❌ |
| عدم كسر العقود | ⚠️ |

---

## 3. خطة الإصدار الأول (V1) — مفصّلة

### النطاق (Scope)
1. إصلاح التحميل (skeleton/empty/error/retry)
2. تحسين نموذج المهمة (حقول جديدة + منطق DoD)
3. قواعد الانتقال والإنجاز **في الخادم**
4. شاشة «أعمالي» العملية (9 أقسام + Snooze)
5. التبعيات والتعثر (تحذير + منع)
6. العروض والفلاتر المحفوظة (TaskView model)
7. الإجراءات الجماعية (+ Undo)

### 3.1 migrations قاعدة البيانات (قابلة للتراجع + backfill)

**مبدأ:** كل الحقول الجديدة اختيارية (nullable) أو لها default — لا فقدان بيانات. التراجع: حذف الحقول/الجداول الجديدة.

#### الجداول الجديدة
```prisma
// تتبع وقت كل حالة (للتقارير + Lead/Cycle time)
model TaskStatusTransition {
  id           String    @id @default(cuid())
  taskId       String
  task         Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)
  fromStatus   String?
  toStatus     String
  userId       String
  user         User      @relation(fields: [userId], references: [id])
  note         String?
  stallReason  String?
  enteredAt    DateTime  @default(now())
  exitedAt     DateTime?  // null = الحالة الحالية
  @@index([taskId, enteredAt])
  @@index([toStatus, exitedAt])
}

// العروض المحفوظة (شخصية/مشتركة)
model TaskView {
  id          String   @id @default(cuid())
  name        String
  ownerId     String
  owner       User     @relation(fields: [ownerId], references: [id])
  isShared    Boolean  @default(false)
  isPinned    Boolean  @default(false)
  filtersJson String   // JSON: {status, priority, type, deptId, ...}
  sortBy      String   @default("createdAt:desc")
  groupBy     String?
  columnsJson String?  // الأعمدة الظاهرة في الجدول
  viewMode    String   @default("list") // list, kanban, calendar, timeline
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([ownerId, isPinned])
}

// تأجيل التنبيه (Snooze)
model TaskSnooze {
  id        String   @id @default(cuid())
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  until     DateTime
  reason    String?
  createdAt DateTime @default(now())
  @@index([taskId, userId])
  @@unique([taskId, userId])
}

// سجل الإجراءات الجماعية (لـ Undo)
model BulkAction {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  action      String   // assign/status/priority/dueDate/department/tags
  taskIds     String   // JSON array
  payloadJson String   // ما تم تغييره
  undone      Boolean  @default(false)
  undoneAt    DateTime?
  createdAt   DateTime @default(now())
  @@index([userId, createdAt])
}

// محرك الأتمتة (V3 — نُعدّ المخطط فقط في V1)
model AutomationRule {
  id          String   @id @default(cuid())
  name        String
  enabled     Boolean  @default(true)
  triggerJson String   // {event, conditions}
  actionsJson String   // [{type, params}]
  priority    Int      @default(100)
  lastRunAt   DateTime?
  lastError   String?
  runCount    Int      @default(0)
  failCount   Int      @default(0)
  createdById String
  createdBy   User     @relation(fields: [createdById], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

#### الحقول الجديدة على Task
```prisma
// على model Task:
definitionOfDone String?  // معيار الإنجاز (نص حر أو Markdown)
storyPoints      Int?     // بديل/مكمّل لـ estimatedHours
waitingReason    String?  // سبب الانتظار (مختلف عن stallReason)
startedAt        DateTime? // لـ Cycle time
completedAt      DateTime? // لـ Lead/Cycle time
cancelledAt      DateTime?
archivedAt       DateTime?
version          Int      @default(1) // للتحرير المتزامن (optimistic locking)
```

**Backfill:** 
```sql
-- لكل مهمة في status completed_approved/cancelled/archived، اضبط التواريخ من statusHistory
UPDATE Task SET completedAt = (SELECT MAX(createdAt) FROM TaskStatusHistory WHERE taskId=Task.id AND toStatus='completed_approved') WHERE status='completed_approved';
-- similar for cancelledAt, archivedAt, startedAt
```

#### تحسينات على نماذج موجودة
```prisma
// TaskDependency: دعم أنواع + منع دورات (في app layer)
type String @default("finish_to_start") 
// القيم المدعومة: finish_to_start, start_to_start, finish_to_finish, start_to_finish

// Task: فهرسة إضافية
@@index([dueDate])
@@index([priority, status])
@@index([createdById])
@@index([tags])  // إن تحوّل لـ relation لاحقًا

// User: علاقات جديدة
taskViews        TaskView[]
taskSnoozes      TaskSnooze[]
bulkActions      BulkAction[]
automationRules  AutomationRule[]
```

### 3.2 الملفات المتأثرة

#### ملفات جديدة (V1)
| المسار | الوظيفة |
|---|---|
| `src/lib/task-workflow.ts` | **محرّك سير العمل**: تعريف الحالات/الانتقالات/الصلاحيات/الحقول المطلوبة (مصدر الحقيقة الوحيد) |
| `src/lib/task-utils.ts` | دوال مساعدة: حساب التقدم، كشف الحجب، تجميع، ترتيب |
| `src/lib/use-query-helpers.ts` | `keepPreviousData`, retry, optimistic update helpers |
| `src/components/ui-bits/skeleton.tsx` | Skeleton components موحّدة |
| `src/components/ui-bits/error-state.tsx` | حالة خطأ + زر إعادة محاولة |
| `src/app/api/tasks/bulk/route.ts` | POST: إجراءات جماعية + Undo |
| `src/app/api/tasks/views/route.ts` | GET/POST/DELETE: العروض المحفوظة |
| `src/app/api/tasks/[id]/snooze/route.ts` | POST: تأجيل التنبيه |
| `src/app/api/tasks/[id]/dod/route.ts` | PATCH: تحديث معيار الإنجاز |
| `prisma/migrations/` | migrations حقيقية (بديل db push) |

#### ملفات معدّلة (V1)
| المسار | التغيير |
|---|---|
| `prisma/schema.prisma` + `schema.prod.prisma` | إضافة النماذج/الحقول الجديدة + مزامنة |
| `src/lib/permissions.ts` | إضافة: `task.change_status`, `task.manage_views`, `task.bulk_action`, `task.export` |
| `src/lib/constants.ts` | إضافة: فئات الحالات الأساسية, أنواع التبعية, مفاتيح الانتقالات |
| `src/app/api/tasks/route.ts` | GET: ترتيب متعدد, تجميع, فلاتر OR/AND, فصل `mine` لسباقات منفصلة, إصلاح N+1; POST: تحقق من الحقول الإلزامية |
| `src/app/api/tasks/[id]/route.ts` | GET: إضافة `isBlocked`, `blockingCount`, `computedProgress`; PATCH: version check |
| `src/app/api/tasks/[id]/status/route.ts` | **إعادة كتابة**: استخدام `task-workflow.ts`, فحص الانتقالات, فحص التبعيات الحاجبة, إصلاح منطق المرفقات الإلزامية |
| `src/components/views/tasks-view.tsx` | Skeleton + Error + Retry, فلاتر OR/AND, تجميع, ترتيب, حفظ عرض, إجراءات جماعية |
| `src/components/views/mywork-view.tsx` | 9 أقسام, Snooze, ترتيب ذكي |
| `src/components/views/kanban-view.tsx` | منع انتقال غير مسموح, swimlanes, WIP limits |
| `src/components/views/task-detail-view.tsx` | DoD section, تحذير حجب, إزالة STATUS_TRANSITIONS المحلية |
| `src/components/views/task-new-view.tsx` | حقل DoD, storyPoints, تحقق إلزامي |
| `src/lib/store.ts` | `filters` in URL (sync), saved views |
| `src/components/app-sidebar.tsx` | عرض العروض المحفوظة المثبّتة |

### 3.3 ترتيب التنفيذ (7 سلالم)

#### سلّم 1: قاعدة البيانات + migrations (يوم 1)
- إنشاء `prisma/migrations/` حقيقية
- إضافة النماذج الجديدة + الحقول
- backfill للحقول الجديدة من statusHistory
- مزامنة `schema.prisma` ↔ `schema.prod.prisma`
- **التراجع:** `prisma migrate resolve --rolled-back` + حذف الحقول

#### سلّم 2: محرّك سير العمل (يوم 1-2)
- `src/lib/task-workflow.ts`: 
  - `STATUS_CATEGORIES` (غير مبدوءة/قيد التنفيذ/منتهية)
  - `TRANSITIONS`: خريطة الانتقالات المسموحة + الصلاحية + الحقول المطلوبة
  - `canTransition(user, task, fromStatus, toStatus)`
  - `getRequiredFields(task, toStatus)`
- `src/lib/permissions.ts`: إضافة الصلاحيات الجديدة
- **التراجع:** حذف الملف + إعادة الصلاحيات القديمة

#### سلّم 3: إصلاح API الحالي (يوم 2-3)
- `POST /api/tasks`: تحقق من priority/assignee/dueDate للمهام التنفيذية
- `GET /api/tasks`: ترتيب متعدد, تجميع, إصلاح N+1 (تحميل subtasks مرة واحدة), فصل `mine`
- `POST /api/tasks/[id]/status`: استخدام `task-workflow.ts`, إصلاح منطق المرفقات الإلزامية, فحص التبعيات الحاجبة, كتابة `TaskStatusTransition` (مع exitedAt للسابق)
- **التراجع:** استرجاع الكود القديم من git

#### سلّم 4: APIs جديدة (يوم 3)
- `POST /api/tasks/bulk`: إجراءات جماعية + إنشاء `BulkAction` للتراجع
- `GET/POST/DELETE /api/tasks/views`: العروض المحفوظة
- `POST /api/tasks/[id]/snooze`: تأجيل
- `PATCH /api/tasks/[id]/dod`: تحديث DoD
- **التراجع:** حذف المسارات

#### سلّم 5: عروض محسّنة (يوم 4-5)
- `tasks-view.tsx`: Skeleton/Error/Retry + فلاتر OR/AND + تجميع + ترتيب + حفظ عرض + إجراءات جماعية
- `mywork-view.tsx`: 9 أقسام + Snooze + ترتيب ذكي
- `task-detail-view.tsx`: DoD + تحذير حجب + إزالة STATUS_TRANSITIONS
- `kanban-view.tsx`: منع انتقال + swimlanes + WIP
- `task-new-view.tsx`: DoD + storyPoints + تحقق
- **التراجع:** git revert

#### سلّم 6: التكامل + الاختبار اليدوي (يوم 5)
- ربط العروض المحفوظة بالـ sidebar
- مزامنة الفلاتر في URL
- اختبار صلاحيات الأدوار على كل انتقال
- اختبار التبعيات الحاجبة
- اختبار الإجراءات الجماعية + Undo
- **التراجع:** git revert

#### سلّم 7: توثيق + نشر (يوم 6)
- تحديث `worklog.md`
- دليل المدير لسير العمل
- دليل المستخدم لأعمالي
- نشر على Railway
- **التراجع:** rollback النشر

### 3.4 مخاطر وطريقة التراجع

| المخاطرة | الاحتمال | الأثر | التخفيف | التراجع |
|---|---|---|---|---|
| migrations تفقد بيانات | منخفض | عالٍ | كل الحقول nullable/default + backfill | `migrate resolve --rolled-back` |
| تغيير API STATUS_TRANSITIONS يكسر client | متوسط | متوسط | طبقة توافق: قبول الحالات القديمة + تحذير | استرجاع الكود القديم |
| N+1 بعد إضافة computed fields | متوسط | متوسط | تحميل دفعة واحدة + cache | index إضافي |
| الإجراءات الجماعية تسبب تعارض | منخفض | عالٍ | version check + transaction | BulkAction.undone |
| فلاتر OR/AND معقدة بطيئة | منخفض | متوسط | index مركّب + server-side | تقييد العمق |
| Snooze يخفي مهمة مهمة | منخفض | منخفض | مؤقت فقط + auto-expire | حذف السجل |
| تخصيص سير العمل لكل إدارة (V2) | - | - | مؤجّل لـ V2 | - |

### 3.5 مقارنة قبل/بعد

| الجانب | قبل V1 | بعد V1 |
|---|---|---|
| **التخطيط عند التحميل** | جدول فارغ / أصفار | Skeleton + Error + Retry |
| **الانتقالات** | client فقط (ثغرة) | خادم (مصدر الحقيقة) |
| **الحقول الإلزامية للإنجاز** | checklist فقط | checklist + DoD + مرفقات + وصف |
| **التبعيات الحاجبة** | غير محترمة | تحذير + منع |
| **أعمالي** | 5 أقسام | 9 أقسام + Snooze + ترتيب ذكي |
| **الفلاتر** | AND بسيط | OR/AND + حفظ العرض + URL |
| **الإجراءات الجماعية** | غير مدعومة | مدعومة + Undo |
| **التقدم** | يدوي | محسوب من الفرعية/checklist |
| **التقارير** | تعتمد createdAt | تواريخ دقيقة (startedAt, completedAt) |
| **N+1** | موجود في subtasks | محسوم |
| **الترتيب** | createdAt desc فقط | متعدد المعايير |
| **التجميع** | غير مدعوم | مدعوم server-side |
| **صلاحيات الانتقال** | مدمجة مع edit | منفصلة + مسجّلة |
| **محاولات مرفوضة** | غير مسجّلة | مسجّلة في audit |

---

## 4. ما لا يُنفّذ في V1 (مؤجّل)
- القوالب والمهام المتكررة (RRULE) → V2
- نموذج الاستقبال والفرز الأولي → V2
- Timeline/Gantt → V2
- محرك الأتمتة (نُعدّ المخطط فقط) → V3
- حمل العمل والطاقة الاستيعابية → V3
- التقارير التشغيلية المتقدمة (CFD, time-in-state) → V3 (نحتاج TaskStatusTransition أولًا)

---

## 5. الافتراضات (تحتاج تأكيد المستخدم)
1. السماح بإضافة `version` field للـ Task (optimistic locking) — قد يكسر الكود القديم إن لم يُمرّر.
2. نقل `STATUS_TRANSITIONS` من client للخادم — سيمنع بعض الإجراءات السريعة الحالية (لكن أكثر أمانًا).
3. إضافة `task.change_status` كصلاحية منفصلة — قد يحتاج موظف حاليًا يغيّر الحالة (له task.edit) لصلاحية جديدة.
4. الحفاظ على `db push` للإنتاج (لا migrations حقيقية) أم الانتقال لـ `prisma migrate`؟ أقترح `migrate` لتتبّع أفضل.
5. الوسوم: إبقاؤها comma string (بسيط) أم تحويلها لـ relation؟ أقترح إبقاؤها + فهرسة contains.

---

**هذا التقرير للمراجعة قبل التنفيذ. لم يُعدّل أي ملف كود.**
