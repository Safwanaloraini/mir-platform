import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { apiHandler, badRequest, getClientIp, getUserAgent } from "@/lib/api";
import { audit } from "@/lib/audit";

const VENDOR_TYPES: Record<string, string> = {
  vendor: "مورد",
  supplier: "مورّد (توريد)",
  contractor: "مقاول",
  customer: "عميل",
};

/**
 * الموردون/العملاء: قائمة مع فلاتر + إنشاء
 * نُرجع أيضًا العملاء (Customer) لتسهيل عرض التبويبات في الواجهة.
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "finance.view")) throw new Error("FORBIDDEN");

  const url = new URL(req.url);
  const params = url.searchParams;
  const type = params.get("type") || undefined;
  const active = params.get("active");
  const search = params.get("search") || undefined;

  const vendorWhere: any = {};
  if (type && type !== "customer") vendorWhere.type = type;
  if (active != null) vendorWhere.active = active === "true";
  if (search) {
    vendorWhere.OR = [
      { name: { contains: search } },
      { nameEn: { contains: search } },
      { taxNumber: { contains: search } },
      { phone: { contains: search } },
      { email: { contains: search } },
    ];
  }

  const customerWhere: any = {};
  if (active != null) customerWhere.active = active === "true";
  if (search) {
    customerWhere.OR = [
      { name: { contains: search } },
      { nameEn: { contains: search } },
      { taxNumber: { contains: search } },
      { phone: { contains: search } },
      { email: { contains: search } },
    ];
  }

  const [vendors, customers] = await Promise.all([
    db.vendor.findMany({ where: vendorWhere, orderBy: { name: "asc" } }),
    type === "customer" || !type
      ? db.customer.findMany({ where: customerWhere, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  return {
    vendors: vendors.map((v) => ({ ...v, kind: "vendor" as const, typeLabel: VENDOR_TYPES[v.type] ?? v.type })),
    customers: customers.map((c) => ({ ...c, kind: "customer" as const, typeLabel: "عميل" })),
  };
});

export const POST = apiHandler(async (req: Request) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!can(user, "finance.manage")) throw new Error("FORBIDDEN");

  const body = await req.json().catch(() => ({}));
  const { kind, name, nameEn, type, taxNumber, email, phone, address, bankAccount, active } = body || {};

  if (!name || typeof name !== "string" || !name.trim()) badRequest("الاسم مطلوب");

  // عميل
  if (kind === "customer") {
    const customer = await db.customer.create({
      data: {
        name: name.trim(),
        nameEn: nameEn || null,
        taxNumber: taxNumber || null,
        email: email || null,
        phone: phone || null,
        active: active !== false,
      },
    });
    await audit({
      user,
      action: "create",
      entityType: "customer",
      entityId: customer.id,
      after: customer,
      summary: `إنشاء عميل: ${customer.name}`,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
    return { kind: "customer", ...customer };
  }

  // مورد
  if (type && !(type in VENDOR_TYPES)) badRequest("نوع المورد غير صحيح");
  const vendor = await db.vendor.create({
    data: {
      name: name.trim(),
      nameEn: nameEn || null,
      type: type || "vendor",
      taxNumber: taxNumber || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
      bankAccount: bankAccount || null,
      active: active !== false,
    },
  });
  await audit({
    user,
    action: "create",
    entityType: "vendor",
    entityId: vendor.id,
    after: vendor,
    summary: `إنشاء مورد: ${vendor.name}`,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return { kind: "vendor", ...vendor };
});
