import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const db = new PrismaClient();

async function main() {
  console.log("🧹 تنظيف البيانات السابقة...");
  await db.notification.deleteMany();
  await db.activityLog.deleteMany();
  await db.auditLog.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.invoice.deleteMany();
  await db.expense.deleteMany();
  await db.budget.deleteMany();
  await db.costCenter.deleteMany();
  await db.customer.deleteMany();
  await db.vendor.deleteMany();
  await db.decision.deleteMany();
  await db.meetingAttendee.deleteMany();
  await db.meeting.deleteMany();
  await db.requestNote.deleteMany();
  await db.requestAttachment.deleteMany();
  await db.approvalAction.deleteMany();
  await db.request.deleteMany();
  await db.approvalStep.deleteMany();
  await db.approvalWorkflow.deleteMany();
  await db.requestType.deleteMany();
  await db.taskStatusHistory.deleteMany();
  await db.taskAttachment.deleteMany();
  await db.taskComment.deleteMany();
  await db.taskChecklistItem.deleteMany();
  await db.taskDependency.deleteMany();
  await db.taskAssignee.deleteMany();
  await db.task.deleteMany();
  await db.project.deleteMany();
  await db.department.deleteMany();
  await db.setting.deleteMany();
  await db.user.deleteMany();
  await db.organization.deleteMany();

  console.log("🏢 إنشاء المؤسسة والإدارات...");
  const org = await db.organization.create({
    data: {
      name: "مجموعة مير القابضة",
      nameEn: "Mir Holding Group",
      currency: "SAR",
    },
  });

  const ceoDept = await db.department.create({
    data: { name: "الإدارة التنفيذية", code: "EXEC", orgId: org.id },
  });
  const opsDept = await db.department.create({
    data: { name: "إدارة العمليات", code: "OPS", orgId: org.id },
  });
  const finDept = await db.department.create({
    data: { name: "الإدارة المالية", code: "FIN", orgId: org.id },
  });
  const adminDept = await db.department.create({
    data: { name: "الإدارة الإدارية", code: "ADMIN", orgId: org.id },
  });

  console.log("👤 إنشاء المستخدمين...");
  const pw = await hashPassword("mir12345");
  const ceo = await db.user.create({
    data: {
      email: "ceo@mir.sa",
      name: "أ. خالد المهيدب",
      nameEn: "Khalid Almuhaidib",
      passwordHash: pw,
      phone: "+966500000001",
      jobTitle: "مدير الشركة",
      role: "ceo",
      departmentId: ceoDept.id,
      orgId: org.id,
    },
  });
  const ops = await db.user.create({
    data: {
      email: "ops@mir.sa",
      name: "م. سارة الدوسري",
      nameEn: "Sarah AlDosari",
      passwordHash: pw,
      phone: "+966500000002",
      jobTitle: "مدير التشغيل",
      role: "ops_manager",
      departmentId: opsDept.id,
      orgId: org.id,
    },
  });
  const fin = await db.user.create({
    data: {
      email: "finance@mir.sa",
      name: "أ. عبدالعزيز القحطاني",
      nameEn: "Abdulaziz AlQahtani",
      passwordHash: pw,
      phone: "+966500000003",
      jobTitle: "المدير المالي",
      role: "finance_manager",
      departmentId: finDept.id,
      orgId: org.id,
    },
  });
  const accountant = await db.user.create({
    data: {
      email: "accountant@mir.sa",
      name: "أ. نورة العتيبي",
      nameEn: "Nourah AlOtaibi",
      passwordHash: pw,
      phone: "+966500000004",
      jobTitle: "محاسب",
      role: "accountant",
      departmentId: finDept.id,
      orgId: org.id,
    },
  });
  const employee = await db.user.create({
    data: {
      email: "ahmed@mir.sa",
      name: "أ. أحمد الشمري",
      nameEn: "Ahmed AlShammari",
      passwordHash: pw,
      phone: "+966500000005",
      jobTitle: "أخصائي مشتريات",
      role: "employee",
      departmentId: opsDept.id,
      orgId: org.id,
    },
  });

  // ربط مدراء الإدارات
  await db.department.update({ where: { id: ceoDept.id }, data: { managerId: ceo.id } });
  await db.department.update({ where: { id: opsDept.id }, data: { managerId: ops.id } });
  await db.department.update({ where: { id: finDept.id }, data: { managerId: fin.id } });

  console.log("📁 إنشاء المشاريع...");
  const projectExpansion = await db.project.create({
    data: {
      name: "مشروع توسعة الفرع الرئيسي",
      code: "EXP-2026",
      description: "توسعة مقر الشركة الرئيسي وافتتاح صالة جديدة",
      status: "active",
      startDate: new Date("2026-01-15"),
      endDate: new Date("2026-06-30"),
      budget: 850000,
      orgId: org.id,
    },
  });
  const projectDigitization = await db.project.create({
    data: {
      name: "مشروع التحول الرقمي",
      code: "DIG-2026",
      description: "أتمتة العمليات وإطلاق منصة إدارة الأعمال",
      status: "active",
      startDate: new Date("2026-02-01"),
      budget: 320000,
      orgId: org.id,
    },
  });

  console.log("🏗️ إنشاء مراكز التكلفة والميزانيات...");
  const cc1 = await db.costCenter.create({
    data: { code: "CC-100", name: "العمليات العامة", managerId: ops.id },
  });
  const cc2 = await db.costCenter.create({
    data: { code: "CC-200", name: "التسويق والمبيعات", parentId: cc1.id },
  });
  const cc3 = await db.costCenter.create({
    data: { code: "CC-300", name: "تقنية المعلومات", parentId: cc1.id },
  });
  const cc4 = await db.costCenter.create({
    data: { code: "CC-400", name: "الإدارة المالية", managerId: fin.id },
  });

  await db.budget.createMany({
    data: [
      { costCenterId: cc1.id, period: "2026", periodType: "yearly", plannedAmount: 450000, actualAmount: 312000, committedAmount: 38000 },
      { costCenterId: cc2.id, period: "2026", periodType: "yearly", plannedAmount: 180000, actualAmount: 142500, committedAmount: 12000 },
      { costCenterId: cc3.id, period: "2026", periodType: "yearly", plannedAmount: 220000, actualAmount: 98000, committedAmount: 0 },
      { costCenterId: cc4.id, period: "2026", periodType: "yearly", plannedAmount: 95000, actualAmount: 61000, committedAmount: 0 },
    ],
  });

  console.log("🏷️ إنشاء أنواع الطلبات ومسارات الاعتماد...");
  const rtPurchase = await db.requestType.create({ data: { code: "purchase", nameAr: "طلب شراء", nameEn: "Purchase Request", category: "financial" } });
  const rtDisbursement = await db.requestType.create({ data: { code: "disbursement", nameAr: "طلب صرف", nameEn: "Disbursement Request", category: "financial" } });
  const rtPayment = await db.requestType.create({ data: { code: "payment", nameAr: "طلب دفعة", nameEn: "Payment Request", category: "financial" } });
  const rtReimbursement = await db.requestType.create({ data: { code: "reimbursement", nameAr: "طلب تعويض", nameEn: "Reimbursement Request", category: "financial" } });
  const rtCustody = await db.requestType.create({ data: { code: "custody", nameAr: "طلب عهدة", nameEn: "Custody Request", category: "financial" } });
  const rtContract = await db.requestType.create({ data: { code: "contract", nameAr: "طلب تعاقد", nameEn: "Contract Request", category: "financial" } });
  const rtOperational = await db.requestType.create({ data: { code: "operational", nameAr: "طلب إجراء تشغيلي", nameEn: "Operational Request", category: "operational" } });
  const rtException = await db.requestType.create({ data: { code: "exception", nameAr: "طلب استثناء", nameEn: "Exception Request", category: "operational" } });

  // مسار اعتماد للمصروفات الصغيرة (أقل من 50000): المدير المالي فقط
  await db.approvalWorkflow.create({
    data: {
      name: "المصروفات الصغيرة (أقل من 50,000)",
      requestTypeId: rtPurchase.id,
      minAmount: 0,
      maxAmount: 50000,
      active: true,
      steps: {
        create: [
          { order: 1, approverRole: "finance_manager", approverLabel: "المدير المالي", isFinal: true },
        ],
      },
    },
  });
  // مسار اعتماد للمصروفات الكبيرة (50,000 فأكثر): المدير المالي ثم مدير الشركة
  await db.approvalWorkflow.create({
    data: {
      name: "المصروفات الكبيرة (50,000 فأكثر)",
      requestTypeId: rtPurchase.id,
      minAmount: 50000,
      active: true,
      steps: {
        create: [
          { order: 1, approverRole: "finance_manager", approverLabel: "المدير المالي", isFinal: false },
          { order: 2, approverRole: "ceo", approverLabel: "مدير الشركة", isFinal: true },
        ],
      },
    },
  });

  // نجلب مسارات الاعتماد مع خطواتها
  const wfSmall = await db.approvalWorkflow.findFirstOrThrow({
    where: { name: "المصروفات الصغيرة (أقل من 50,000)" },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  const wfLarge = await db.approvalWorkflow.findFirstOrThrow({
    where: { name: "المصروفات الكبيرة (50,000 فأكثر)" },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  console.log("🏢 إنشاء الموردين والعملاء...");
  const v1 = await db.vendor.create({ data: { name: "شركة التقنية المتقدمة", nameEn: "Advanced Tech Co", taxNumber: "300123456700003", email: "sales@advtech.sa", phone: "+96611234567", bankAccount: "SA1234567890123456789012" } });
  const v2 = await db.vendor.create({ data: { name: "مؤسسة الأثاث الحديث", taxNumber: "300987654300003", email: "info@modernfurn.sa", phone: "+96655987654", bankAccount: "SA9876543210987654321098" } });
  const v3 = await db.vendor.create({ data: { name: "شركة الدورات اللوجستية", nameEn: "Logistics Routes Co", email: "ops@logroutes.sa", phone: "+96611445566" } });
  const c1 = await db.customer.create({ data: { name: "شركة الرياض للتجارة", taxNumber: "300111222300003", email: "ap@ryadhtrading.sa", phone: "+96611778899" } });

  console.log("📋 إنشاء المهام...");
  let taskNum = 1000;
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);
  const daysAhead = (d: number) => new Date(now.getTime() + d * 86400000);

  // مهمة استراتيجية كبرى من مدير الشركة
  const t1 = await db.task.create({
    data: {
      number: taskNum++,
      title: "إطلاق منصة إدارة الأعمال «مير» وإدخالها حيز التشغيل",
      description: "تطوير وتفعيل منصة موحدة لإدارة المهام والقرارات والاعتمادات والمالية، مع تدريب الفريق وتفعيل سجل التدقيق.",
      type: "strategic",
      source: "decision",
      status: "in_progress",
      priority: "urgent",
      progress: 45,
      orgId: org.id,
      departmentId: opsDept.id,
      projectId: projectDigitization.id,
      createdById: ceo.id,
      startDate: daysAgo(20),
      dueDate: daysAhead(15),
      estimatedHours: 320,
      tags: "تحول رقمي,أولوية قصوى",
      checklist: {
        create: [
          { text: "اعتماد المتطلبات الفنية", done: true, required: true, order: 1, createdById: ceo.id, completedAt: daysAgo(15) },
          { text: "تصميم قاعدة البيانات والـ APIs", done: true, required: true, order: 2, createdById: ceo.id, completedAt: daysAgo(10) },
          { text: "تطوير وحدات المهام والاعتمادات", done: true, required: true, order: 3, createdById: ceo.id, completedAt: daysAgo(5) },
          { text: "تطوير الوحدة المالية", done: false, required: true, order: 4, createdById: ceo.id },
          { text: "تدريب الفريق وتفعيل المنصة", done: false, required: true, order: 5, createdById: ceo.id },
        ],
      },
      comments: {
        create: [
          { userId: ceo.id, text: "هذه أولوية قصوى للربع الحالي. نحتاج إنجازها قبل نهاية الشهر.", createdAt: daysAgo(19) },
          { userId: ops.id, text: "بدأنا بتجهيز خطة التنفيذ التفصيلية، وسيتم تقسيمها إلى مهام فرعية.", createdAt: daysAgo(18) },
        ],
      },
      statusHistory: {
        create: [
          { userId: ceo.id, toStatus: "new", note: "تم إنشاء المهمة", createdAt: daysAgo(20) },
          { userId: ops.id, toStatus: "assigned", note: "تم الإسناد لمدير التشغيل", createdAt: daysAgo(19) },
          { userId: ops.id, toStatus: "in_progress", note: "بدء التنفيذ", createdAt: daysAgo(18) },
        ],
      },
    },
  });
  const a1 = await db.taskAssignee.create({ data: { taskId: t1.id, userId: ops.id, role: "responsible", isMain: true } });
  await db.task.update({ where: { id: t1.id }, data: { mainAssigneeId: a1.id } });
  await db.taskAssignee.create({ data: { taskId: t1.id, userId: employee.id, role: "contributor" } });

  // مهام فرعية للمهمة الاستراتيجية
  const sub1 = await db.task.create({
    data: {
      number: taskNum++,
      title: "تجهيز قائمة متطلبات وحدات النظام",
      type: "operational",
      source: "decision",
      status: "completed_approved",
      priority: "high",
      progress: 100,
      orgId: org.id,
      departmentId: opsDept.id,
      parentId: t1.id,
      createdById: ops.id,
      startDate: daysAgo(18),
      dueDate: daysAgo(12),
      checklist: { create: [{ text: "مراجعة نهائية", done: true, required: true, order: 1, createdById: ops.id }] },
    },
  });
  await db.taskAssignee.create({ data: { taskId: sub1.id, userId: employee.id, role: "responsible", isMain: true } });

  const sub2 = await db.task.create({
    data: {
      number: taskNum++,
      title: "إعداد البيانات التجريبية واختبار مسار الاعتماد",
      type: "operational",
      source: "decision",
      status: "in_progress",
      priority: "high",
      progress: 60,
      orgId: org.id,
      departmentId: opsDept.id,
      parentId: t1.id,
      createdById: ops.id,
      startDate: daysAgo(8),
      dueDate: daysAhead(3),
    },
  });
  await db.taskAssignee.create({ data: { taskId: sub2.id, userId: employee.id, role: "responsible", isMain: true } });

  // مهمة متعثرة
  const t2 = await db.task.create({
    data: {
      number: taskNum++,
      title: "توريد وتركيب أجهزة عرض للقاعة الجديدة",
      description: "شراء وتركيب 4 شاشات تفاعلية للقاعة الرئيسية ضمن مشروع التوسعة.",
      type: "operational",
      source: "financial_request",
      status: "stalled",
      priority: "high",
      progress: 30,
      orgId: org.id,
      departmentId: opsDept.id,
      projectId: projectExpansion.id,
      createdById: ops.id,
      startDate: daysAgo(25),
      dueDate: daysAgo(5),
      stallReason: "تأخر المورد في تسليم الأجهزة بسبب نقص في المخزون، وجاري البحث عن مورد بديل.",
      tags: "توريد,مشروع التوسعة",
      comments: {
        create: [
          { userId: ops.id, text: "المورد الأصلي اعتذر عن التسليم في الموعد، نبحث عن بديل.", createdAt: daysAgo(7) },
          { userId: ceo.id, text: "يرجى تصعيد الموضوع وسرعة إيجاد حل بديل.", createdAt: daysAgo(6) },
        ],
      },
    },
  });
  const a2 = await db.taskAssignee.create({ data: { taskId: t2.id, userId: employee.id, role: "responsible", isMain: true } });
  await db.task.update({ where: { id: t2.id }, data: { mainAssigneeId: a2.id } });

  // مهمة مالية بانتظار اعتماد
  const t3 = await db.task.create({
    data: {
      number: taskNum++,
      title: "تسوية فاتورة استضافة الخوادم السحابية",
      type: "financial",
      source: "financial_request",
      status: "awaiting_approval",
      priority: "medium",
      progress: 80,
      orgId: org.id,
      departmentId: finDept.id,
      costCenterId: cc3.id,
      createdById: accountant.id,
      startDate: daysAgo(4),
      dueDate: daysAhead(2),
    },
  });
  const a3 = await db.taskAssignee.create({ data: { taskId: t3.id, userId: accountant.id, role: "responsible", isMain: true } });
  await db.task.update({ where: { id: t3.id }, data: { mainAssigneeId: a3.id } });

  // مهمة مكتملة
  const t4 = await db.task.create({
    data: {
      number: taskNum++,
      title: "إقفال الحسابات الشهرية لشهر يناير",
      type: "accounting",
      source: "recurring",
      status: "completed_approved",
      priority: "high",
      progress: 100,
      orgId: org.id,
      departmentId: finDept.id,
      createdById: fin.id,
      startDate: daysAgo(30),
      dueDate: daysAgo(25),
      tags: "إقفال شهري",
    },
  });
  const a4 = await db.taskAssignee.create({ data: { taskId: t4.id, userId: accountant.id, role: "responsible", isMain: true } });
  await db.task.update({ where: { id: t4.id }, data: { mainAssigneeId: a4.id } });

  // مهمة جديدة (مسندة)
  const t5 = await db.task.create({
    data: {
      number: taskNum++,
      title: "إعداد تقرير أداء الموردين للربع الأول",
      type: "administrative",
      source: "independent",
      status: "assigned",
      priority: "medium",
      progress: 0,
      orgId: org.id,
      departmentId: opsDept.id,
      createdById: ops.id,
      startDate: daysAhead(1),
      dueDate: daysAhead(10),
    },
  });
  const a5 = await db.taskAssignee.create({ data: { taskId: t5.id, userId: employee.id, role: "responsible", isMain: true } });
  await db.task.update({ where: { id: t5.id }, data: { mainAssigneeId: a5.id } });

  // مهمة متأخرة (لا تزال قيد التنفيذ لكن تجاوزت الموعد)
  const t6 = await db.task.create({
    data: {
      number: taskNum++,
      title: "تحديث سياسة المشتريات وإجراءات التوريد",
      type: "administrative",
      source: "decision",
      status: "in_progress",
      priority: "medium",
      progress: 40,
      orgId: org.id,
      departmentId: adminDept.id,
      createdById: ceo.id,
      startDate: daysAgo(20),
      dueDate: daysAgo(3),
    },
  });
  const a6 = await db.taskAssignee.create({ data: { taskId: t6.id, userId: employee.id, role: "responsible", isMain: true } });
  await db.task.update({ where: { id: t6.id }, data: { mainAssigneeId: a6.id } });

  console.log("📝 إنشاء الطلبات ومسارات الاعتماد...");
  let reqNum = 5000;

  // طلب شراء صغير بانتظار اعتماد المدير المالي
  const r1 = await db.request.create({
    data: {
      number: reqNum++,
      refCode: "PUR-2026-001",
      requestTypeId: rtPurchase.id,
      workflowId: wfSmall.id,
      status: "under_review",
      title: "شراء 5 أجهزة حاسب محمول لفريق التشغيل",
      purpose: "تجهيز فريق التشغيل بأجهزة حديثة لدعم مشروع التحول الرقمي.",
      amount: 37500,
      taxAmount: 5625,
      totalAmount: 43125,
      currency: "SAR",
      costCenterId: cc3.id,
      projectId: projectDigitization.id,
      vendorId: v1.id,
      beneficiary: "شركة التقنية المتقدمة",
      dueDate: daysAhead(14),
      createdById: employee.id,
      assignedToId: fin.id,
      currentApproverRole: "finance_manager",
      attachments: {
        create: [
          { fileName: "عرض سعر - التقنية المتقدمة.pdf", fileUrl: "/uploads/quote1.pdf", required: true },
          { fileName: "مواصفات الأجهزة.pdf", fileUrl: "/uploads/spec1.pdf" },
        ],
      },
      notes: { create: [{ userId: employee.id, text: "تم إرفاق عروض الأسعار والمواصفات الفنية." }] },
    },
  });
  // ربط الطلب بمهمة
  await db.task.update({ where: { id: sub2.id }, data: { requestId: r1.id } });

  // طلب شراء كبير يحتاج اعتماد مدير الشركة (بانتظار الاعتماد النهائي)
  const r2 = await db.request.create({
    data: {
      number: reqNum++,
      refCode: "PUR-2026-002",
      requestTypeId: rtPurchase.id,
      workflowId: wfLarge.id,
      status: "awaiting_final",
      title: "تركيب نظام تكييف مركزي للقاعة الجديدة",
      purpose: "تجهيز القاعة الجديدة ضمن مشروع التوسعة بنظام تكييف مركزي عالي الكفاءة.",
      amount: 145000,
      taxAmount: 21750,
      totalAmount: 166750,
      currency: "SAR",
      costCenterId: cc1.id,
      projectId: projectExpansion.id,
      vendorId: v3.id,
      beneficiary: "شركة الدورات اللوجستية",
      dueDate: daysAhead(30),
      createdById: ops.id,
      assignedToId: ceo.id,
      currentApproverRole: "ceo",
      attachments: {
        create: [{ fileName: "عرض سعر التكييف.pdf", fileUrl: "/uploads/hvac.pdf", required: true }],
      },
      actions: {
        create: [
          { userId: fin.id, action: "approve", stepId: wfLarge.steps[0]?.id ?? null, note: "المبلغ ضمن الميزانية المعتمدة لمشروع التوسعة.", fromStatus: "under_review", toStatus: "preliminarily_approved", createdAt: daysAgo(2) },
        ],
      },
      notes: { create: [{ userId: fin.id, text: "تم الاعتماد المبدئي، بانتظار اعتماد مدير الشركة للحجم الكبير." }] },
    },
  });

  // طلب معتمد محوّل للمحاسب (قيد التنفيذ)
  const r3 = await db.request.create({
    data: {
      number: reqNum++,
      refCode: "PAY-2026-001",
      requestTypeId: rtPayment.id,
      workflowId: wfSmall.id,
      status: "in_execution",
      title: "سداد فاتورة استضافة الخوادم السحابية (ربع سنوي)",
      purpose: "سداد اشتراك البنية السحابية للربع الحالي.",
      amount: 28000,
      taxAmount: 4200,
      totalAmount: 32200,
      currency: "SAR",
      costCenterId: cc3.id,
      vendorId: v1.id,
      beneficiary: "شركة التقنية المتقدمة",
      dueDate: daysAhead(3),
      createdById: accountant.id,
      assignedToId: accountant.id,
      currentApproverRole: "accountant",
      actions: {
        create: [
          { userId: fin.id, action: "approve", stepId: wfSmall.steps[0]?.id ?? null, note: "معتمد للتنفيذ.", fromStatus: "under_review", toStatus: "approved", createdAt: daysAgo(2) },
          { userId: fin.id, action: "forward", note: "تم التحويل للمحاسب للتنفيذ.", fromStatus: "approved", toStatus: "forwarded_accountant", createdAt: daysAgo(2) },
        ],
      },
    },
  });
  await db.task.update({ where: { id: t3.id }, data: { requestId: r3.id } });

  // طلب مرفوض
  const r4 = await db.request.create({
    data: {
      number: reqNum++,
      refCode: "EXP-2026-001",
      requestTypeId: rtReimbursement.id,
      workflowId: wfSmall.id,
      status: "rejected",
      title: "تعويض مصاريف ضيافة اجتماع غير معتمد",
      purpose: "تعويض مصاريف تقديم الضيافة في اجتماع غير مجدول.",
      amount: 3200,
      taxAmount: 480,
      totalAmount: 3680,
      currency: "SAR",
      costCenterId: cc1.id,
      createdById: employee.id,
      assignedToId: fin.id,
      currentApproverRole: "finance_manager",
      rejectionReason: "الاجتماع غير معتمد مسبقًا، والمصاريف خارج سياسة الضيافة المعتمدة.",
      actions: {
        create: [
          { userId: fin.id, action: "reject", stepId: wfSmall.steps[0]?.id ?? null, note: "مرفوض لعدم توافقه مع السياسة.", fromStatus: "under_review", toStatus: "rejected", createdAt: daysAgo(6) },
        ],
      },
    },
  });

  // طلب مسودة
  const r5 = await db.request.create({
    data: {
      number: reqNum++,
      refCode: "CON-2026-001",
      requestTypeId: rtContract.id,
      workflowId: wfLarge.id,
      status: "draft",
      title: "تعاقد مع شركة صيانة شاملة للمعدات",
      purpose: "توقيع عقد صيانة وقائية شاملة لمعدات القاعة الجديدة.",
      amount: 96000,
      taxAmount: 14400,
      totalAmount: 110400,
      currency: "SAR",
      costCenterId: cc1.id,
      projectId: projectExpansion.id,
      createdById: ops.id,
    },
  });

  // طلب عهدة صغير معتمد ومنفذ
  const r6 = await db.request.create({
    data: {
      number: reqNum++,
      refCode: "CST-2026-001",
      requestTypeId: rtCustody.id,
      workflowId: wfSmall.id,
      status: "closed",
      title: "عهدة نثرية للصيانة الطارئة",
      purpose: "عهدة لشراء قطع غيار طارئة.",
      amount: 5000,
      totalAmount: 5000,
      currency: "SAR",
      costCenterId: cc1.id,
      createdById: employee.id,
      assignedToId: accountant.id,
      currentApproverRole: "accountant",
      actions: {
        create: [
          { userId: fin.id, action: "approve", stepId: wfSmall.steps[0]?.id ?? null, fromStatus: "under_review", toStatus: "approved", createdAt: daysAgo(10) },
          { userId: fin.id, action: "forward", fromStatus: "approved", toStatus: "forwarded_accountant", createdAt: daysAgo(10) },
          { userId: accountant.id, action: "approve", note: "تم صرف العهدة.", fromStatus: "in_execution", toStatus: "fully_executed", createdAt: daysAgo(8) },
        ],
      },
    },
  });

  console.log("💰 إنشاء المصروفات والفواتير والمدفوعات...");
  let expNum = 2000;
  let invNum = 3000;
  let payNum = 7000;

  const e1 = await db.expense.create({
    data: {
      number: expNum++,
      date: daysAgo(8),
      vendorId: v1.id,
      costCenterId: cc3.id,
      requestId: r1.id,
      category: "services",
      description: "أجهزة حاسب محمول - 5 وحدات",
      amount: 37500,
      taxAmount: 5625,
      totalAmount: 43125,
      status: "pending",
      createdBy: employee.id,
    },
  });
  const e2 = await db.expense.create({
    data: {
      number: expNum++,
      date: daysAgo(12),
      vendorId: v2.id,
      costCenterId: cc2.id,
      category: "supplies",
      description: "أثاث مكتبي للقاعة الجديدة",
      amount: 18500,
      taxAmount: 2775,
      totalAmount: 21275,
      status: "paid",
      paymentMethod: "bank_transfer",
      createdBy: ops.id,
      invoice: {
        create: {
          number: `INV-${invNum++}`,
          vendorId: v2.id,
          type: "payable",
          date: daysAgo(12),
          dueDate: daysAgo(2),
          amount: 18500,
          taxAmount: 2775,
          totalAmount: 21275,
          status: "paid",
          createdBy: ops.id,
          payments: {
            create: {
              number: `PAY-${payNum++}`,
              type: "outgoing",
              date: daysAgo(5),
              amount: 21275,
              method: "bank_transfer",
              reference: "TRX-558822",
              journalEntry: "JV-2026-0042",
              createdBy: accountant.id,
            },
          },
        },
      },
    },
  });
  const e3 = await db.expense.create({
    data: {
      number: expNum++,
      date: daysAgo(20),
      costCenterId: cc4.id,
      category: "utilities",
      description: "فواتير الكهرباء والماء - مارس",
      amount: 8600,
      taxAmount: 1290,
      totalAmount: 9890,
      status: "invoiced",
      createdBy: accountant.id,
      invoice: {
        create: {
          number: `INV-${invNum++}`,
          type: "payable",
          date: daysAgo(20),
          dueDate: daysAhead(10),
          amount: 8600,
          taxAmount: 1290,
          totalAmount: 9890,
          status: "unpaid",
          createdBy: accountant.id,
        },
      },
    },
  });
  // فاتورة مستحقة (متأخرة)
  const invOverdue = await db.invoice.create({
    data: {
      number: `INV-${invNum++}`,
      vendorId: v3.id,
      type: "payable",
      date: daysAgo(40),
      dueDate: daysAgo(10),
      amount: 22000,
      taxAmount: 3300,
      totalAmount: 25300,
      status: "overdue",
      createdBy: accountant.id,
    },
  });

  // مقبوضات
  await db.receipt.create({
    data: {
      number: `REC-${1000}`,
      customerId: c1.id,
      date: daysAgo(6),
      amount: 45000,
      method: "bank_transfer",
      reference: "DEP-992011",
      description: "تحويل عميل - تسوية فاتورة",
      createdBy: accountant.id,
    },
  });

  console.log("📅 إنشاء اجتماع وقرارات محوّلة لمهام...");
  const meeting = await db.meeting.create({
    data: {
      title: "اجتماع مجلس الإدارة الربع الأول 2026",
      date: daysAgo(15),
      location: "قاعة الاجتماعات - المقر الرئيسي",
      agenda: "1. مراجعة أداء الربع الأول.\n2. اعتماد خطة التحول الرقمي.\n3. مناقشة مشروع التوسعة.\n4. مراجعة المركز المالي.",
      minutes: "تمت مناقشة البنود وموافقة المجلس على إطلاق منصة إدارة الأعمال وتسريع مشروع التوسعة، مع مراجعة شاملة للمصروفات التشغيلية.",
      nextMeeting: daysAhead(75),
      organizerId: ceo.id,
      attendees: {
        create: [
          { userId: ceo.id, attended: true },
          { userId: ops.id, attended: true },
          { userId: fin.id, attended: true },
          { userId: accountant.id, attended: true },
        ],
      },
    },
  });
  // قرار محوّل إلى مهمة (المهمة الاستراتيجية t1)
  await db.decision.create({
    data: {
      meetingId: meeting.id,
      text: "إطلاق منصة إدارة الأعمال «مير» وتفعيلها خلال 30 يومًا",
      rationale: "لتحسين متابعة المهام والقرارات والاعتمادات وتقليل الاعتماد على المراسلات المتفرقة.",
      dueDate: daysAhead(15),
      decidedById: ceo.id,
      status: "converted",
      task: { connect: { id: t1.id } },
    },
  });
  // قرار آخر لم يُحوّل بعد
  await db.decision.create({
    data: {
      meetingId: meeting.id,
      text: "مراجعة هيكل مراكز التكلفة وتوزيع الميزانيات",
      rationale: "ضمان توافق المصروفات مع الأهداف الاستراتيجية لكل مركز.",
      dueDate: daysAhead(20),
      decidedById: ceo.id,
      status: "pending",
    },
  });

  console.log("🔔 إنشاء الإشعارات...");
  await db.notification.createMany({
    data: [
      { userId: fin.id, type: "approval_required", title: "طلب شراء بانتظار اعتمادك", body: "شراء 5 أجهزة حاسب محمول بقيمة 43,125 ر.س", link: "requests", entityType: "request", entityId: r1.id },
      { userId: ceo.id, type: "approval_required", title: "طلب اعتماد نهائي بانتظارك", body: "تركيب نظام تكييف مركزي بقيمة 166,750 ر.س", link: "approvals", entityType: "request", entityId: r2.id },
      { userId: accountant.id, type: "task_assigned", title: "مهمة مالية مسندة إليك", body: "تسوية فاتورة استضافة الخوادم السحابية", link: "tasks", entityType: "task", entityId: t3.id },
      { userId: ops.id, type: "overdue", title: "تأخر مهمة توريد الأجهزة", body: "يرجى مراجعة سبب التعثر", link: "tasks", entityType: "task", entityId: t2.id },
      { userId: ceo.id, type: "stalled", title: "تعثر في مشروع التوسعة", body: "تأخر توريد أجهزة العرض للقاعة الجديدة", link: "tasks", entityType: "task", entityId: t2.id },
      { userId: employee.id, type: "task_assigned", title: "مهمة جديدة مسندة إليك", body: "إعداد تقرير أداء الموردين", link: "tasks", entityType: "task", entityId: t5.id },
    ],
  });

  console.log("⚙️ إنشاء الإعدادات الافتراضية...");
  const settings = [
    { key: "approval.finance_limit", value: "50000", category: "approval", description: "حد اعتماد المدير المالي قبل تصعيده لمدير الشركة" },
    { key: "escalation.warning_before_due_hours", value: "24", category: "escalation", description: "تنبيه قبل الموعد النهائي (ساعة)" },
    { key: "escalation.overdue_notify_manager_hours", value: "12", category: "escalation", description: "تنبيه المدير المباشر بعد التأخير (ساعة)" },
    { key: "escalation.ceo_escalation_days", value: "3", category: "escalation", description: "تصعيد لمدير الشركة بعد (أيام)" },
    { key: "notification.enable_email", value: "false", category: "notification", description: "تفعيل إشعارات البريد (مستقبلاً)" },
    { key: "general.org_name", value: org.name, category: "general", description: "اسم المؤسسة" },
  ];
  for (const s of settings) {
    await db.setting.create({ data: { ...s, updatedBy: ceo.id } });
  }

  console.log("✅ اكتملت البذور بنجاح.");
  console.log("━━━ بيانات الدخول ━━━");
  console.log("مدير الشركة: ceo@mir.sa / mir12345");
  console.log("مدير التشغيل: ops@mir.sa / mir12345");
  console.log("المدير المالي: finance@mir.sa / mir12345");
  console.log("المحاسب: accountant@mir.sa / mir12345");
  console.log("الموظف: ahmed@mir.sa / mir12345");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
