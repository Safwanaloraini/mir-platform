# Task ID: 5 — Requests & Approvals Builder

**Agent:** Requests & Approvals Builder
**Date:** 2026 (per project timeline)
**Status:** ✅ Complete

## What was built

### API Routes (Server-side, RBAC-enforced)

#### `src/app/api/requests/route.ts`
- **GET**: List requests with filters: `status` (comma), `requestTypeId`, `costCenterId`, `projectId`, `vendorId`, `mine`, `pending_my_approval`, `search` (title/refCode/purpose), `minAmount`, `maxAmount`, `page`, `pageSize`. Permission: `request.view.all` OR `request.view.own` (own→only createdById=user.id). Returns `{items,total,page,pageSize}` with requestType, costCenter, vendor, project, createdBy, currentStep.
- **POST**: Create new request. Permission `request.create`. Body accepts `requestTypeCode`/`requestTypeId`, `title`, `purpose`, `amount`, `taxAmount`, `currency`, `costCenterId`, `projectId`, `vendorId`, `beneficiary`, `dueDate`, `attachments[]`, `note`. Auto-generates `number` (max+1) and `refCode` (type-prefix-year-seq). Determines workflow automatically: filters `ApprovalWorkflow` where `requestTypeId` matches OR `null`, with `minAmount<=amount` AND `maxAmount==null||amount<=maxAmount`. Prefers workflows bound to this requestType, falls back to generic. If found: sets `workflowId`, `currentStepId=firstStep.id`, `currentApproverRole=firstStep.approverRole`, `status="under_review"` (so first approver can act immediately). Else `status="submitted"` (manual). Creates attachments, initial note. Audits + notifies first approver(s) (`type:"approval_required"`). Returns full request with includes.

#### `src/app/api/requests/[id]/route.ts`
- **GET**: Full request with includes: requestType, workflow.steps, currentStep, costCenter, vendor, project, createdBy, assignedTo, attachments, actions(user, step), notes (with user attached post-query since schema lacks relation), task. Permission: `request.view.all` OR creator OR current approver OR assignedTo. Hides amounts if `!canSeeAmounts`. Computes `_canTakeAction`, `_canExecute`, `_isCreator` flags for client UX.
- **PATCH**: Edit draft/needs_completion requests. Permission `request.edit` + creator only. Re-evaluates workflow if amount changed. Replaces attachments if provided. `submit=true` transitions `draft`→`under_review`/`submitted` and `needs_completion`→`under_review`.

#### `src/app/api/requests/[id]/action/route.ts`
- **POST**: Approval action `{action: "approve"|"reject"|"return"|"forward", note?, rejectionReason?}`.
  - **approve**: requires `request.approve` perm + `canApproveRequest(user, createdById)` (server-side self-approval block → 403). If current step is final OR no workflow → `status="approved"` then auto-forward: `status="forwarded_accountant"`, `assignedToId`=accountant, `currentApproverRole="accountant"`, notifies accountant (`approval_required`). Else advance to next step: `currentStepId=next.id`, `currentApproverRole=next.approverRole`, `status` = `awaiting_final` (if next is final) or `preliminarily_approved`. Notifies next approver(s) + creator.
  - **reject**: requires `rejectionReason`. `status="rejected"`, saves reason, notifies creator (`rejected`).
  - **return**: requires `note`. `status="needs_completion"`, notifies creator (`returned`).
  - **forward** (accountant only, requires `request.execute` + assignedToId===user.id): `forwarded_accountant`→`in_execution`→`fully_executed`→`closed`. Notifies creator of status change.
  - Creates `ApprovalAction` with fromStatus/toStatus. Audits + activity log on every action.

#### `src/app/api/requests/[id]/notes/route.ts`
- **POST**: Add a note to a request. Allowed for creator, current approver, assignedTo, or anyone with `request.view.all`. Returns note with user attached.

### View Components (Client, Arabic RTL)

#### `src/components/views/requests-view.tsx`
- PageHeader with "طلب جديد" button (only if `request.create`).
- StatCards: total, pending approval, approved, rejected.
- Filters bar: search input, type select, multi-status popover, cost center select (only if `finance.view.amounts`), amount range (min/max), mine toggle. Clear-all button.
- Table with columns: المرجع (requestNumber+refCode), العنوان (with type icon), النوع, الحالة (StatusBadge), القيمة (formatCurrency only if canSeeAmounts, else "—"), مقدم الطلب (name+role), المسار الحالي (currentStep.approverLabel or role), الموعد (date+relative). Row click → openDetail.
- Pagination with total/page display.
- CreateRequestDialog (auto-opens if `params.action === "new"`): requestType select, due date calendar, title, purpose, amount+tax (with computed total, only if canSeeAmounts), costCenter/project/vendor selects, beneficiary, attachments list (add/remove with fileName/fileUrl/required), opening note.
- On submit: POST → toast → openDetail. Avoids useEffect-setState pattern (uses prev-state-tracking for param sync per React 16 best practices).

#### `src/components/views/request-detail-view.tsx`
- Header: refCode+number, title, StatusBadge, type label, edit button (creator+draft only), back to list.
- Banner showing "عند من الآن؟" (current location) — derived from status+currentStep.
- Reject reason card (red) if rejected.
- Main grid (lg:3 cols):
  - Left col (2/3): Purpose card; Financial details (amount/tax/total, costCenter, project, vendor, beneficiary, dueDate — amounts hidden if !canSeeAmounts); Attachments list with download links + "إلزامي" badge; **Workflow Stepper** (horizontal, scrollable) showing each ApprovalStep with status (done=current=pending=rejected=returned color-coded), action taken (user, time, note) overlaid; Actions history timeline (chronological with fromStatus→toStatus).
  - Right col (1/3): ActionPanel (context-aware), Info card (creator, role, department, assignee, dates), Linked task card (if any), Notes section with add-note textarea + timeline.
- ActionPanel logic:
  - If `_canTakeAction` (currentApproverRole===role, canApproveRequest, pending status): shows green "اعتماد", amber "إعادة للاستكمال" (opens dialog requiring note), red "رفض" (opens dialog requiring reason).
  - If `_canExecute` (accountant+assignedTo+forwarded/in_execution/fully_executed): shows orange "بدء التنفيذ" / "إتمام التنفيذ" / "إغلاق" contextually.
  - Else: shows informational card explaining why no action is available.

#### `src/components/views/approvals-view.tsx`
- Guards: requires `request.approve` or `request.execute`. If neither → empty state.
- StatCards: pending approval (mine), pending execution (mine), approved total, rejected total.
- Tabs (context-aware):
  - "بانتظار اعتمادي" (only if canApprove): list of pending items with quick "اعتماد" button and "رفض" (opens reason dialog) inline. Row click → detail.
  - "محولة لي للتنفيذ" (only if canExecute): list of forwarded_accountant/in_execution items with "بدء التنفيذ" / "إتمام التنفيذ" inline.
  - "أنجزتها" (history): recent requests with terminal/transitional statuses.

## Design Decisions & Notes
- **Status on create with workflow**: Spec said `status="submitted"` but that creates a gap (first approver can't see action buttons since approval gate checks `under_review`/`preliminarily_approved`/`awaiting_final`). Interpreted as `status="under_review"` when workflow exists (matches seed data pattern for r1), `status="submitted"` when no workflow (manual triage).
- **Self-approval block**: Enforced server-side via `canApproveRequest(user, request.createdById)` — returns 403 if same user. Also visually hidden but the server check is authoritative.
- **RequestNote schema gap**: Schema lacks `user` relation on `RequestNote` (only `userId` field). Resolved by fetching users separately post-query and merging. Did NOT modify the schema (respects the "DO NOT modify" rule).
- **RBAC visibility**: Client uses `canClient` to hide UI elements, but every API endpoint re-validates permissions server-side.
- **Auto-forward to accountant**: On final approval, system looks up `User` with `role="accountant"` in same org and assigns to them automatically.
- **Workflow stepper**: Color-coded by step status (done=green, current=primary+ring, rejected=red, returned=amber, pending=muted).
- **useEffect-setState lint rule**: React 16's strict `react-hooks/set-state-in-effect` rule was respected by using the "track previous prop" pattern instead of useEffect.

## Quality Checks
- `bun run lint` ✅ passes for all my files (no errors).
- `tsc --noEmit --skipLibCheck` ✅ no type errors in my files.
- Self-approval blocked server-side.
- Audit + notify + activity on every action.
- Amounts hidden for users without `finance.view.amounts`.
- Responsive (mobile-first, lg: breakpoints).
- RTL Arabic-first, no blue/indigo (uses primary=teal, accent=orange, semantic colors only).

## Files Created
- `src/app/api/requests/route.ts` (GET list + POST create)
- `src/app/api/requests/[id]/route.ts` (GET detail + PATCH edit draft)
- `src/app/api/requests/[id]/action/route.ts` (POST approval action)
- `src/app/api/requests/[id]/notes/route.ts` (POST add note)
- `src/components/views/requests-view.tsx` (list + create dialog)
- `src/components/views/request-detail-view.tsx` (detail + stepper + action panel)
- `src/components/views/approvals-view.tsx` (inbox + tabs)

## Demo Data Available
The seed script provides 6 sample requests in various states:
- r1: under_review, awaiting finance_manager approval (small workflow)
- r2: awaiting_final, awaiting ceo approval (large workflow, 2 steps)
- r3: in_execution, assigned to accountant (forwarded)
- r4: rejected (with reason)
- r5: draft (creator can edit)
- r6: closed (fully executed)

Login as different users to see different views:
- `finance@mir.sa` → sees pending approvals for finance_manager role (r1)
- `ceo@mir.sa` → sees pending approvals for ceo role (r2)
- `accountant@mir.sa` → sees execution queue (r3)
- `ahmed@mir.sa` → employee, sees own requests (r1, r4, r6 as creator)

## Coordination Notes
- View-router.tsx already references my views (RequestsView, RequestDetailView, ApprovalsView) — no router changes needed.
- Sidebar already has menu items for "الطلبات" (`requests` view) and "صندوق الاعتمادات" (`approvals` view).
- The dev server shows errors for missing `task-new-view` and other views — those belong to other agents (Task Builder, Meetings Builder, Finance Builder, etc.) and are out of my scope.
