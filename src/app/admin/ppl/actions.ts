"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { encryptSecret } from "@/lib/encryption";
import { deliver } from "@/lib/ppl/engine";
import { decideStorno } from "@/lib/ppl/storno";
import { placeOrder } from "@/lib/ppl/orders";
import { weekRange } from "@/lib/ppl/periods";

async function requireAdmin() {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") throw new Error("Nur Admins.");
  return s;
}

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/[,\n;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(",", ".");
  return s === "" ? null : Number(s);
};
const int = (v: FormDataEntryValue | null) => {
  const n = num(v);
  return n == null || !Number.isFinite(n) ? null : Math.round(n);
};

export type BezugState = { error?: string; ok?: boolean };

export async function saveSubscriptionAction(_prev: BezugState, fd: FormData): Promise<BezugState> {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const customerId = String(fd.get("customerId") ?? "");
  const productKey = String(fd.get("productKey") ?? "").trim();
  const price = num(fd.get("price"));
  if (!customerId || !productKey) return { error: "Kunde und Produkt angeben." };
  if (price == null || !Number.isFinite(price) || price < 0) return { error: "Preis je Lead angeben." };
  const delivery = String(fd.get("delivery") ?? "app");
  const secret = String(fd.get("webhookSecret") ?? "").trim();
  const data = {
    customerId,
    productKey,
    label: String(fd.get("label") ?? "").trim() || null,
    active: fd.get("active") === "on",
    status: fd.get("status") === "test" ? "test" : "live",
    testQuantity: int(fd.get("testQuantity")),
    testDays: int(fd.get("testDays")),
    period: ["week", "month", "once"].includes(String(fd.get("period"))) ? String(fd.get("period")) : "week",
    goal: int(fd.get("goal")),
    startDate: fd.get("startDate") ? new Date(`${fd.get("startDate")}T00:00:00`) : null,
    price,
    plzRanges: String(fd.get("plzRanges") ?? "").trim() || null,
    acceptWeak: fd.get("acceptWeak") === "on",
    weakThreshold: int(fd.get("weakThreshold")),
    acceptCivilServants: fd.get("acceptCivilServants") === "on",
    onlyWeak: fd.get("onlyWeak") === "on",
    scoreFloor: int(fd.get("scoreFloor")),
    insurerInclude: list(fd.get("insurerInclude")),
    insurerExclude: list(fd.get("insurerExclude")),
    excludeRules: String(fd.get("excludeRules") ?? "").trim() || null,
    stornoDays: int(fd.get("stornoDays")),
    stornoReasons: list(fd.get("stornoReasons")),
    delivery: ["app", "email", "webhook"].includes(delivery) ? delivery : "app",
    deliveryEmail: String(fd.get("deliveryEmail") ?? "").trim() || null,
    emailSubject: String(fd.get("emailSubject") ?? "").trim() || null,
    emailTemplate: String(fd.get("emailTemplate") ?? "").replace(/\r\n/g, "\n").trim() || null,
    webhookUrl: String(fd.get("webhookUrl") ?? "").trim() || null,
    webhookFormat: fd.get("webhookFormat") === "convexa" ? "convexa" : "standard",
    ...(secret ? { webhookSecretEnc: encryptSecret(secret) } : {}),
  };
  if (data.delivery === "email" && !data.deliveryEmail) return { error: "Für Lieferung per E-Mail eine Adresse angeben." };
  if (data.delivery === "webhook" && !/^https:\/\//.test(data.webhookUrl ?? "")) return { error: "Für Webhook eine https-Adresse angeben." };
  const saved = id ? await prisma.leadSubscription.update({ where: { id }, data }) : await prisma.leadSubscription.create({ data });
  await audit("ppl.subscription", { entity: "LeadSubscription", entityId: saved.id, customerId, details: { productKey, active: data.active, price } });
  revalidatePath("/admin/ppl", "layout");
  redirect(`/admin/ppl?gespeichert=${saved.id}`);
}

export async function manualOrderAction(fd: FormData): Promise<void> {
  const s = await requireAdmin();
  await placeOrder({
    subscriptionId: String(fd.get("subscriptionId") ?? ""),
    weekOffset: fd.get("week") === "1" ? 1 : 0,
    quantity: Number(fd.get("quantity")),
    autoRenew: false,
    markPaid: true,
    actor: { id: s.userId, email: s.email, role: s.role },
  });
  revalidatePath("/admin/ppl", "layout");
}

export async function assignParkedAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const pool = await prisma.poolLead.findUnique({ where: { id: String(fd.get("poolLeadId") ?? "") } });
  const sub = await prisma.leadSubscription.findUnique({ where: { id: String(fd.get("subscriptionId") ?? "") } });
  if (!pool || pool.status !== "parked" || !sub) return;
  const order =
    sub.period === "week"
      ? await prisma.leadOrder.findUnique({ where: { subscriptionId_periodStart: { subscriptionId: sub.id, periodStart: weekRange().start } } })
      : null;
  await deliver(pool.id, sub, order?.id ?? null);
  revalidatePath("/admin/ppl", "layout");
}

export async function discardParkedAction(fd: FormData): Promise<void> {
  await requireAdmin();
  await prisma.poolLead.updateMany({ where: { id: String(fd.get("poolLeadId") ?? ""), status: "parked" }, data: { status: "invalid", reason: "verworfen (Admin)" } });
  revalidatePath("/admin/ppl", "layout");
}

export async function decideStornoAction(fd: FormData): Promise<void> {
  await requireAdmin();
  await decideStorno(String(fd.get("leadId") ?? ""), fd.get("decision") === "approve");
  revalidatePath("/admin/ppl", "layout");
}

export type ImportState = { error?: string; message?: string };

export async function runImportAction(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const s = await requireAdmin();
  try {
    const { importDuplicateHistory, importSubscriptions } = await import("@/lib/ppl/import-airtable");
    const rows = await importSubscriptions({ dryRun: false });
    const history = fd.get("history") === "on" ? await importDuplicateHistory() : 0;
    await audit("ppl.subscription", { entity: "LeadSubscription", actor: { id: s.userId, email: s.email, role: s.role }, details: { import: rows.length, history } });
    revalidatePath("/admin/ppl", "layout");
    const done = rows.filter((r) => r.action !== "übersprungen").length;
    return { message: `${done} Bezüge übernommen${history ? `, ${history} Leads für den Dubletten-Abgleich` : ""}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Import fehlgeschlagen." };
  }
}
