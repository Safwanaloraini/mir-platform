import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

/**
 * سكربت الإنتاج المستقل — لا يعتمد على src/lib/db
 * يُنشئ PrismaClient مباشرة، آمن للتنفيذ داخل حاوية Docker.
 */
const db = new PrismaClient();

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hashSync(plain, 10);
}

async function main() {
  console.log("🚀 بدء الإعداد الإنتاجي لمنصة مير...");

  // ── المؤسسة ──
  let org = await db.organization.findFirst();
  if (!org) {
    org = await db.organization.create({
      data: { name: "مؤسستي", nameEn: "My Organization", currency: "SAR" },
    });
    console.log("✅ تم إنشاء المؤسسة:", org.name);
  } else {
    console.log("ℹ️  المؤسسة موجودة مسبقًا:", org.name);
  }

  // ── الإدارات ──
  const depts = ["الإدارة التنفيذية", "إدارة العمليات", "الإدارة المالية", "الإدارة الإدارية"];
  const deptIds: Record<string, string> = {};
  for (const name of depts) {
    let dept = await db.department.findFirst({ where: { name, orgId: org.id } });
    if (!dept) {
      dept = await db.department.create({ data: { name, code: name.slice(0, 4), orgId: org.id } });
    }
    deptIds[name] = dept.id;
  }

  // ── المستخدم الإداري ──
  const existingAdmin = await db.user.findUnique({ where: { email: "admin@mir.sa" } });
  if (!existingAdmin) {
    const pw = await hashPassword("Admin@Mir2026");
    await db.user.create({
      data: {
        email: "admin@mir.sa",
        name: "المدير العام",
        passwordHash: pw,
        role: "ceo",
        jobTitle: "مدير الشركة",
        departmentId: deptIds["الإدارة التنفيذية"],
        orgId: org.id,
        status: "active",
      },
    });
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("👤 تم إنشاء الحساب الإداري:");
    console.log("   البريد: admin@mir.sa");
    console.log("   كلمة المرور: Admin@Mir2026");
    console.log("⚠️  غيّر كلمة المرور فورًا بعد أول دخول!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } else {
    console.log("ℹ️  الحساب الإداري موجود مسبقًا");
  }

  // ── أنواع الطلبات ──
  const requestTypes = [
    { code: "purchase", nameAr: "طلب شراء", nameEn: "Purchase Request", category: "financial" },
    { code: "disbursement", nameAr: "طلب صرف", nameEn: "Disbursement", category: "financial" },
    { code: "payment", nameAr: "طلب دفعة", nameEn: "Payment Request", category: "financial" },
    { code: "reimbursement", nameAr: "طلب تعويض", nameEn: "Reimbursement", category: "financial" },
    { code: "custody", nameAr: "طلب عهدة", nameEn: "Custody", category: "financial" },
    { code: "transfer", nameAr: "طلب تحويل", nameEn: "Transfer", category: "financial" },
    { code: "contract", nameAr: "طلب تعاقد", nameEn: "Contract", category: "financial" },
    { code: "budget", nameAr: "طلب ميزانية", nameEn: "Budget", category: "financial" },
    { code: "operational", nameAr: "طلب إجراء تشغيلي", nameEn: "Operational", category: "operational" },
    { code: "exception", nameAr: "طلب استثناء", nameEn: "Exception", category: "operational" },
  ];
  for (const rt of requestTypes) {
    const existing = await db.requestType.findUnique({ where: { code: rt.code } });
    if (!existing) {
      await db.requestType.create({ data: rt });
    }
  }
  console.log("✅ أنواع الطلبات جاهزة");

  // ── مسارات الاعتماد ──
  const purchaseType = await db.requestType.findUnique({ where: { code: "purchase" } });
  if (purchaseType) {
    const smallExists = await db.approvalWorkflow.findFirst({ where: { name: "المصروفات الصغيرة (أقل من 50,000)" } });
    if (!smallExists) {
      await db.approvalWorkflow.create({
        data: {
          name: "المصروفات الصغيرة (أقل من 50,000)",
          requestTypeId: purchaseType.id,
          minAmount: 0,
          maxAmount: 50000,
          active: true,
          steps: { create: [{ order: 1, approverRole: "finance_manager", approverLabel: "المدير المالي", isFinal: true }] },
        },
      });
    }
    const largeExists = await db.approvalWorkflow.findFirst({ where: { name: "المصروفات الكبيرة (50,000 فأكثر)" } });
    if (!largeExists) {
      await db.approvalWorkflow.create({
        data: {
          name: "المصروفات الكبيرة (50,000 فأكثر)",
          requestTypeId: purchaseType.id,
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
    }
  }
  console.log("✅ مسارات الاعتماد جاهزة");

  // ── مراكز التكلفة الأساسية ──
  const ccExists = await db.costCenter.findFirst();
  if (!ccExists) {
    await db.costCenter.create({ data: { code: "CC-100", name: "العمليات العامة", active: true } });
    await db.costCenter.create({ data: { code: "CC-200", name: "الإدارة المالية", active: true } });
    await db.costCenter.create({ data: { code: "CC-300", name: "تقنية المعلومات", active: true } });
  }
  console.log("✅ مراكز التكلفة جاهزة");

  // ── الإعدادات الافتراضية ──
  const settings = [
    { key: "approval.finance_limit", value: "50000", category: "approval", description: "حد اعتماد المدير المالي" },
    { key: "escalation.warning_before_due_hours", value: "24", category: "escalation", description: "تنبيه قبل الموعد" },
    { key: "escalation.overdue_notify_manager_hours", value: "12", category: "escalation", description: "تنبيه المدير بعد التأخير" },
    { key: "escalation.ceo_escalation_days", value: "3", category: "escalation", description: "تصعيد لمدير الشركة" },
    { key: "notification.enable_email", value: "false", category: "notification", description: "إشعارات البريد" },
    { key: "general.org_name", value: org.name, category: "general", description: "اسم المؤسسة" },
  ];
  for (const s of settings) {
    const existing = await db.setting.findUnique({ where: { key: s.key } });
    if (!existing) {
      await db.setting.create({ data: s });
    }
  }
  console.log("✅ الإعدادات جاهزة");

  console.log("\n🎉 اكتمل الإعداد بنجاح!");
}

main()
  .catch((e) => {
    console.error("❌ فشل الإعداد:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
