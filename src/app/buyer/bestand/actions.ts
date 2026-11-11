"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { FIELDS, detectMapping, importRows, isBlockedColumn, parseFile, type Mapping } from "@/lib/bestand/import";
import { createCampaign, OCCASIONS, type Occasion, type Segment } from "@/lib/bestand/campaigns";
import { bestandQuota } from "@/lib/bestand/quota";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { PROVIDER } from "@/lib/legal-texts";
import { sendCustomerMail } from "@/lib/email";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";

const MAX_BYTES = 15 * 1024 * 1024;

async function ownerCtx() {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || !ctx.userId) throw new Error("In der Vorschau nicht möglich.");
  if (ctx.teamRole !== "owner") throw new Error("Nur der Inhaber kann Bestandskunden verwalten.");
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { existingCustomersEnabled: true } });
  if (!c?.existingCustomersEnabled) throw new Error("Das Modul ist für Sie noch nicht freigeschaltet.");
  return ctx;
}

async function readUpload(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) throw new Error("Bitte eine Excel- oder CSV-Datei wählen.");
  if (file.size > MAX_BYTES) throw new Error("Die Datei ist zu groß (max. 15 MB).");
  if (!/\.(xlsx|csv|txt)$/i.test(file.name)) throw new Error("Bitte als .xlsx oder .csv speichern.");
  return parseFile(Buffer.from(await file.arrayBuffer()), file.name);
}

export type AnalyzeState = {
  error?: string;
  headers?: string[];
  mapping?: Mapping;
  preview?: Record<string, string>[];
  total?: number;
  blocked?: string[];
};

export async function analyzeImportAction(_prev: AnalyzeState, fd: FormData): Promise<AnalyzeState> {
  try {
    await ownerCtx();
    const { headers, rows } = await readUpload(fd);
    if (!rows.length) return { error: "In der Datei wurden keine Zeilen gefunden." };
    return {
      headers: headers.filter((h) => !isBlockedColumn(h)),
      blocked: headers.filter(isBlockedColumn),
      mapping: detectMapping(headers),
      preview: rows.slice(0, 5),
      total: rows.length,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Die Datei konnte nicht gelesen werden." };
  }
}

export type ImportState = { error?: string; message?: string };

export async function runImportAction(_prev: ImportState, fd: FormData): Promise<ImportState> {
  try {
    const ctx = await ownerCtx();
    const { rows } = await readUpload(fd);
    const mapping: Mapping = {};
    for (const key of Object.keys(FIELDS) as (keyof typeof FIELDS)[]) {
      const col = String(fd.get(`map_${key}`) ?? "");
      if (col && !isBlockedColumn(col)) mapping[key] = col;
    }
    if (!mapping.firstName && !mapping.lastName && !mapping.fullName) return { error: "Bitte die Spalte mit dem Namen zuordnen." };
    if (!mapping.phone && !mapping.email) return { error: "Bitte mindestens Telefon/Mobil oder E-Mail zuordnen." };
    if (fd.get("consent") !== "on") return { error: "Bitte bestätigen, dass die Einwilligungen vorliegen." };
    const r = await importRows(ctx.customerId, rows, mapping);
    await audit("bestand.import", { entity: "ExistingCustomer", customerId: ctx.customerId, details: { ...r } });
    revalidatePath("/buyer/bestand");
    return {
      message: `${r.customers} Kunden übernommen (${r.created} neu, ${r.updated} aktualisiert), ${r.contracts} Verträge, ${r.withPhone} mit Mobilnummer.${r.skipped ? ` ${r.skipped} Zeilen ohne Namen/Kontakt übersprungen.` : ""}`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Import fehlgeschlagen." };
  }
}

export async function startCampaignAction(fd: FormData): Promise<void> {
  const ctx = await ownerCtx();
  const occasion = String(fd.get("occasion")) as Occasion;
  if (!(occasion in OCCASIONS)) throw new Error("Unbekannter Anlass.");
  const segment = JSON.parse(String(fd.get("segment") ?? "{}")) as Segment;
  const quota = await bestandQuota(ctx.customerId);
  if (quota.remaining <= 0) redirect("/buyer/bestand?kontingent=1");
  const campaign = await createCampaign({
    customerId: ctx.customerId,
    occasion,
    segment,
    topic: String(fd.get("topic") ?? "").trim() || null,
    dailyLimit: Number(fd.get("dailyLimit")) || 150,
    createdById: ctx.userId,
  });
  await audit("bestand.campaign", { entity: "CustomerCampaign", entityId: campaign.id, customerId: ctx.customerId, details: { occasion, segment } });
  revalidatePath("/buyer/bestand");
  redirect("/buyer/bestand?gestartet=1");
}

export async function toggleCampaignAction(fd: FormData): Promise<void> {
  const ctx = await ownerCtx();
  const c = await prisma.customerCampaign.findFirst({ where: { id: String(fd.get("id") ?? ""), customerId: ctx.customerId } });
  if (!c || c.status === "done") return;
  await prisma.customerCampaign.update({ where: { id: c.id }, data: { status: c.status === "running" ? "paused" : "running" } });
  revalidatePath("/buyer/bestand");
}

export type RequestState = { ok?: boolean; error?: string };

/** Modul im Kundenbereich anfragen (kein Self-Checkout): Mail + Push an uns, Eintrag in Admin „Heute“. */
// Wird über useActionState aufgerufen; Formularinhalt und Vorzustand werden nicht gebraucht.
export async function requestBestandModuleAction(): Promise<RequestState> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || !ctx.userId) return { error: "In der Vorschau nicht möglich." };
  if (ctx.teamRole !== "owner") return { error: "Nur der Inhaber kann Module anfragen." };
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true, existingCustomersEnabled: true, bestandRequestedAt: true, vermittlerTyp: true } });
  if (!c) return { error: "Konto nicht gefunden." };
  if (c.existingCustomersEnabled) return { ok: true };
  const preis = c.vermittlerTyp === "makler" ? "inklusive für Makler" : `${PRICE_LIST.bestandModuleMonthly} € netto im Monat`;
  if (!c.bestandRequestedAt) {
    await prisma.customer.update({ where: { id: ctx.customerId }, data: { bestandRequestedAt: new Date() } });
    await audit("bestand.request", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId });
    await sendToAdmins({
      title: `Modul-Anfrage: ${c.name}`,
      body: `Bestandskunden-Modul (${preis}) angefragt`,
      url: `/admin/kunden/${ctx.customerId}/abrechnung`,
      tag: `bestand-request:${ctx.customerId}`,
    }).catch(() => {});
    await sendCustomerMail({
      to: process.env.ADMIN_EMAIL?.trim() || PROVIDER.email,
      subject: `Modul-Anfrage: Bestandskunden-Modul für ${c.name}`,
      greeting: "Hallo,",
      paragraphs: [
        `${c.name} (${ctx.email}) möchte das Bestandskunden-Modul buchen (${preis}).`,
        "Buchen in der Kundenakte unter „Abrechnung“. Dabei wird das Stripe-Abo angepasst.",
      ],
      signature: PROVIDER.brand,
      replyTo: ctx.email ?? null,
    }).catch((err) => reportError(err, "bestand-request-mail"));
  }
  revalidatePath("/buyer/bestand");
  revalidatePath("/buyer/konto");
  return { ok: true };
}
