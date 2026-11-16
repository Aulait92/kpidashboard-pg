// Testlead (Ole, 16.11.2026): Admin → Kunde → Leads → „Testlead schicken“. Ein Lead mit der eigenen Nummer des
// Admins läuft durch den ECHTEN Ablauf neuer Leads (processNewLead: Zuteilung, Push/Mail an den Vermittler,
// WhatsApp-Erstanschreiben, danach Assistent, Qualifizierung und Termin). Er ist als Test markiert (Lead.isTest):
// Abzeichen „Test“ überall, wo Leads stehen, zählt nirgends (Zahlen, Kosten pro Lead, Monatsbericht, Garantien,
// Kontingente, Umsatz), nie an Meta (CAPI), löschbar.
//
// Nachvollziehen in den Railway-Logs: jede Station schreibt eine Zeile „[testlead <id>] …“ (ohne Nummern und Inhalte).
//
// Gleiche Nummer erneut: der vorige Testlead mit dieser Nummer wird ersetzt und der Chat frisch begonnen (Verlauf
// geleert, das offene 24-Stunden-Fenster bleibt), damit das Erstanschreiben wieder kommt. Gehört die Nummer bei
// diesem Kunden zu einem echten Lead, wird abgebrochen.

import { Prisma } from "@/generated/prisma/client";
import { audit, type AuditActor } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { normalizePhone } from "@/lib/whatsapp/phone";

export const TEST_LEAD_DEFAULT_NAME = "Test Lead";
export const TEST_LEAD_CONFIRM_TEXT = "Der Kunde sieht diesen Lead";

type LogValue = string | number | boolean | null | undefined;

/** Eine Logzeile für einen Testlead. Nur IDs, Stati und Zähler, nie Telefonnummern oder Nachrichteninhalte. */
export function testLeadLine(leadId: string, step: string, info: Record<string, LogValue> = {}): string {
  const parts = Object.entries(info)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${String(v).replace(/\s+/g, "_").slice(0, 80)}`);
  return `[testlead ${leadId}] ${step}${parts.length ? ` ${parts.join(" ")}` : ""}`;
}

/** Loggt, wenn der Lead ein Testlead ist (isTest schon bekannt). */
export function logTestLead(lead: { id: string; isTest?: boolean | null } | null | undefined, step: string, info?: Record<string, LogValue>): void {
  if (lead?.isTest) console.log(testLeadLine(lead.id, step, info));
}

/** Loggt, wenn der Lead ein Testlead ist (fragt isTest nach). Fehler werden verschluckt. */
export async function logIfTestLead(leadId: string | null | undefined, step: string, info?: Record<string, LogValue>): Promise<void> {
  if (!leadId) return;
  try {
    const l = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, isTest: true } });
    logTestLead(l, step, info);
  } catch {
    /* nur Log */
  }
}

/** Produkte für die Auswahl: gebuchte Produkte des Kunden, Leadformulare und zuletzt genutzte Produkte. */
export async function testLeadProducts(customerId: string): Promise<string[]> {
  const [cps, sources, recent] = await Promise.all([
    prisma.customerProduct.findMany({ where: { customerId }, select: { product: { select: { name: true } } } }),
    prisma.leadSource.findMany({ where: { customerId, active: true }, select: { productKey: true } }),
    prisma.lead.findMany({
      where: { customerId, source: { not: null }, NOT: { source: { in: ["Empfehlung", "Bestandskunde"] } } },
      distinct: ["source"],
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { source: true },
    }),
  ]);
  const names = [...cps.map((c) => c.product.name), ...sources.map((s) => s.productKey), ...recent.map((l) => l.source ?? "")];
  const out = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (out.length) return out;
  const all = await prisma.product.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true } });
  return all.map((p) => p.name);
}

export type TestLeadInput = { customerId: string; name?: string | null; product: string; phone: string; confirmed?: boolean };

export type CreateTestLeadResult =
  | { ok: true; leadId: string; outreach: string }
  | { ok: false; error: string; needsConfirm?: boolean };

/** Eingaben prüfen (rein). */
export function checkTestLeadInput(input: TestLeadInput): { ok: true; name: string; product: string; phone: string } | { ok: false; error: string } {
  const phone = normalizePhone(input.phone ?? "");
  if (!phone) return { ok: false, error: "Bitte eine gültige Handynummer eingeben, z. B. 0151 12345678." };
  const product = (input.product ?? "").trim();
  if (!product) return { ok: false, error: "Bitte ein Produkt wählen." };
  const name = (input.name ?? "").trim().slice(0, 80) || TEST_LEAD_DEFAULT_NAME;
  return { ok: true, name, product, phone };
}

/** Stand des Erstanschreibens in Worten (für die Rückmeldung im Admin). */
export function outreachText(status: string | null, delayMin: number | null, active: boolean): string {
  if (!active) return "WhatsApp-Assistent ist bei diesem Kunden aus: kein Erstanschreiben.";
  if (!status) return delayMin ? `Erstanschreiben folgt nach der Wartezeit (${delayMin} Min.).` : "Erstanschreiben läuft.";
  if (status === "sent" || status === "sent_booked") return "WhatsApp-Erstanschreiben ist raus.";
  if (status === "no_template") return "Keine freigegebene Vorlage: Bitte zuerst selbst an die WhatsApp-Nummer des Kunden schreiben (öffnet das 24-Stunden-Fenster) und erneut schicken.";
  if (status === "skipped_optout") return "Diese Nummer hat „STOPP“ geschrieben: kein WhatsApp.";
  if (status.startsWith("failed")) return `WhatsApp nicht zugestellt: ${status.slice(8, 160)}`;
  return `Erstanschreiben: ${status}`;
}

/**
 * Chat zur Nummer für einen frischen Durchlauf vorbereiten: Termine aus dem Chat absagen (Kalender) und lösen,
 * Verlauf löschen, Assistent an, Qualifizierung und Hinweise zurück. Das 24-Stunden-Fenster bleibt erhalten.
 */
async function resetConversation(conversationId: string, customerId: string): Promise<void> {
  const appts = await prisma.appointment.findMany({ where: { conversationId, status: "booked" }, select: { id: true } });
  if (appts.length) {
    const { cancelAppointment } = await import("@/lib/calendar");
    for (const a of appts) await cancelAppointment(a.id, customerId, "team", false).catch((e) => reportError(e, "testlead-reset-termin", { appointment: a.id }));
  }
  await prisma.appointment.updateMany({ where: { conversationId }, data: { conversationId: null } });
  await prisma.message.deleteMany({ where: { conversationId } });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      leadId: null,
      botActive: true,
      qualified: false,
      qualificationSummary: null,
      qualificationData: Prisma.DbNull,
      needsAttention: false,
      attentionReason: null,
      attentionAt: null,
      status: "open",
      optedOutAt: null,
      assignedUserId: null,
      contactName: null,
      contactEmail: null,
    },
  });
}

/** Testlead löschen: Termine absagen (Kalender), Chats und Lead entfernen. Nur Leads mit isTest. */
export async function deleteTestLead(leadId: string, opts: { customerId?: string; actor?: AuditActor } = {}): Promise<{ ok: true; customerId: string } | { ok: false; error: string }> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, customerId: true, isTest: true, name: true } });
  if (!lead || (opts.customerId && lead.customerId !== opts.customerId)) return { ok: false, error: "Lead nicht gefunden." };
  if (!lead.isTest) return { ok: false, error: "Nur Testleads lassen sich löschen." };
  const appts = await prisma.appointment.findMany({ where: { leadId, status: "booked" }, select: { id: true } });
  if (appts.length) {
    const { cancelAppointment } = await import("@/lib/calendar");
    for (const a of appts) await cancelAppointment(a.id, lead.customerId, "team", false).catch((e) => reportError(e, "testlead-delete-termin", { appointment: a.id }));
  }
  await prisma.$transaction([
    prisma.appointment.deleteMany({ where: { leadId } }),
    prisma.conversation.deleteMany({ where: { leadId } }),
    prisma.capiEvent.deleteMany({ where: { leadId } }),
    prisma.lead.delete({ where: { id: leadId } }),
  ]);
  console.log(testLeadLine(leadId, "deleted"));
  await audit("lead.test_delete", { entity: "Lead", entityId: leadId, customerId: lead.customerId, details: { name: lead.name }, ...(opts.actor ? { actor: opts.actor } : {}) });
  return { ok: true, customerId: lead.customerId };
}

/**
 * Testlead anlegen und durch den echten Ablauf schicken (processNewLead). Bei echten Kunden (nicht Testkunde) nur mit
 * Bestätigung „Der Kunde sieht diesen Lead“. Setzt den Einrichtungsschritt „Testlead durchgespielt“.
 */
export async function createTestLead(input: TestLeadInput, actor: AuditActor, now = new Date()): Promise<CreateTestLeadResult> {
  const checked = checkTestLeadInput(input);
  if (!checked.ok) return checked;
  const { name, product, phone } = checked;
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true, isTest: true, dormantSince: true } });
  if (!customer) return { ok: false, error: "Kunde nicht gefunden." };
  if (customer.dormantSince) return { ok: false, error: "Das Konto ruht (Vertrag beendet): keine Leads." };
  if (!customer.isTest && !input.confirmed) return { ok: false, error: `${TEST_LEAD_CONFIRM_TEXT}.`, needsConfirm: true };

  // Nummer gehört zu einem echten Lead dieses Kunden: nicht anfassen
  const real = await prisma.lead.count({ where: { customerId: customer.id, phone, isTest: false } });
  if (real) return { ok: false, error: "Diese Nummer gehört bei diesem Kunden zu einem echten Lead. Bitte eine andere Nummer nehmen." };

  // Frischer Durchlauf: Chat zurücksetzen (Fenster bleibt), vorige Testleads mit dieser Nummer ersetzen
  const conv = await prisma.conversation.findUnique({ where: { customerId_contactPhone: { customerId: customer.id, contactPhone: phone } }, select: { id: true } });
  if (conv) await resetConversation(conv.id, customer.id);
  const previous = await prisma.lead.findMany({ where: { customerId: customer.id, phone, isTest: true }, select: { id: true } });
  for (const p of previous) await deleteTestLead(p.id, { customerId: customer.id, actor });

  const lead = await prisma.lead.create({
    data: {
      customerId: customer.id,
      isTest: true,
      name,
      phone,
      source: product,
      status: "Neuer Lead",
      // Wie ein Lead aus dem Meta-Formular, ohne Meta-Lead-ID (geht so ohnehin nie an Meta)
      adChannel: "Meta",
      waConsent: "ja",
      consentData: { at: now.toISOString(), formId: null, textVersion: null, text: "Testlead aus dem Admin an die eigene Nummer", responses: [] },
      createdAt: now,
    },
    select: { id: true },
  });
  console.log(testLeadLine(lead.id, "intake", { customer: customer.id, testCustomer: customer.isTest, product, replaced: previous.length, chatReset: !!conv }));

  // Einrichtung: Schritt „Testlead durchgespielt“
  await prisma.onboarding.updateMany({ where: { customerId: customer.id, testLeadAt: null }, data: { testLeadAt: now } }).catch((e) => reportError(e, "testlead-onboarding"));
  await audit("lead.test_create", { entity: "Lead", entityId: lead.id, customerId: customer.id, details: { name, product, testCustomer: customer.isTest }, actor });

  // Der echte Ablauf neuer Leads (lib/lead-intake.ts)
  const { processNewLead } = await import("@/lib/lead-intake");
  await processNewLead(lead.id).catch((err) => reportError(err, "testlead-process", { lead: lead.id }));

  const [after, agent] = await Promise.all([
    prisma.lead.findUnique({ where: { id: lead.id }, select: { outreachStatus: true } }),
    prisma.agentConfig.findUnique({ where: { customerId: customer.id }, select: { active: true, outreachEnabled: true, outreachDelayMin: true } }),
  ]);
  return { ok: true, leadId: lead.id, outreach: outreachText(after?.outreachStatus ?? null, agent?.outreachDelayMin ?? null, !!agent?.active && !!agent.outreachEnabled) };
}
