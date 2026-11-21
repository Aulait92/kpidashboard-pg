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
import { asAnsprache, type Ansprache } from "@/lib/ansprache";

export const TEST_LEAD_DEFAULT_NAME = "Test Lead";
/** Pflicht-Häkchen bei echten Kunden (Dialog und Fehlermeldung der Action). */
export const TEST_LEAD_CONFIRM_LABEL = "Verstanden, an echten Kunden senden";
/** Rückmeldung bei einem eingehenden Testlead: kein Erstanschreiben, der Admin schreibt zuerst. */
export const TEST_EINGEHEND_TEXT = "Jetzt selbst an die WhatsApp-Nummer des Kunden schreiben: Der Assistent antwortet wie bei einer eingehenden Anfrage.";

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

/**
 * Testkunde (Customer.isTest) oder interner Kunde (plan „internal“): Testleads ohne Bestätigung, Auswahl aller aktiven
 * Produkte. Alle anderen sind echte Kunden: der Lead erscheint bei ihnen, nur mit ausdrücklicher Bestätigung.
 */
export function isTestLeadSandbox(c: { isTest?: boolean | null; plan?: string | null } | null | undefined): boolean {
  return !!c && (!!c.isTest || c.plan === "internal");
}

/**
 * Neue Leads aus eingehenden Chats (WhatsApp „Als Lead übernehmen“, Empfehlungscode, Antwort auf eine Kampagne):
 * bei Testkunden und internen Kunden als Testlead (Ole, 17.11.2026; die Sandbox-Nummer gehört einem Testkunden).
 */
export async function inboundLeadIsTest(customerId: string): Promise<boolean> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { isTest: true, plan: true } });
  return isTestLeadSandbox(c);
}

/** Namen zusammenführen: Reihenfolge bleibt, leere und doppelte (ohne Groß-/Kleinschreibung) fallen weg. */
export function mergeProductNames(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of lists.flat()) {
    const name = n.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * Gebuchte Produkte (Ole, 21.11.2026: „Testlead muss immer das Produkt sein, das der Kunde gebucht hat“): Produkte am
 * Kunden, aktive Pay-per-Lead-Bezüge, Produkte aus dem angenommenen Angebot (Kampagnen, erste Woche, Kundenkonto-Variante)
 * und eigene Leadformulare. Reihenfolge = Vorrang.
 */
export async function gebuchteProdukte(customerId: string): Promise<string[]> {
  const [cps, subs, sources, ob] = await Promise.all([
    prisma.customerProduct.findMany({ where: { customerId }, select: { product: { select: { name: true } } } }),
    prisma.leadSubscription.findMany({ where: { customerId, active: true }, orderBy: { createdAt: "asc" }, select: { productKey: true } }),
    prisma.leadSource.findMany({ where: { customerId, active: true }, select: { productKey: true } }),
    prisma.onboarding.findUnique({ where: { customerId }, select: { offerId: true } }).catch(() => null),
  ]);
  const offer = ob?.offerId
    ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { products: true, pplProductKey: true, pplProdukte: true } }).catch(() => null)
    : null;
  const namen = (raw: unknown) =>
    (Array.isArray(raw) ? raw : [])
      .map((p) => (p && typeof p === "object" && typeof (p as { name?: unknown }).name === "string" ? String((p as { name: string }).name).trim() : ""))
      .filter(Boolean);
  return mergeProductNames(
    cps.map((c) => c.product.name),
    subs.map((s) => s.productKey),
    namen(offer?.pplProdukte),
    offer?.pplProductKey ? [offer.pplProductKey] : [],
    namen(offer?.products),
    sources.map((s) => s.productKey),
  );
}

/**
 * Produkte für die Auswahl beim Testlead. Echte Kunden mit gebuchten Produkten: nur diese (Ole, 21.11.2026), das erste
 * ist der Standard. Ohne gebuchte Produkte: zuletzt genutzte, sonst alle aktiven. Testkunden und interne Kunden
 * (Ole, 17.11.2026) bekommen hinter den gebuchten alle übrigen aktiven Produkte, damit jedes Produkt testbar ist.
 */
export async function testLeadProducts(customerId: string): Promise<string[]> {
  const [customer, gebucht, recent] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { isTest: true, plan: true } }),
    gebuchteProdukte(customerId),
    prisma.lead.findMany({
      where: { customerId, source: { not: null }, NOT: { source: { in: ["Empfehlung", "Bestandskunde"] } } },
      distinct: ["source"],
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { source: true },
    }),
  ]);
  const sandbox = isTestLeadSandbox(customer);
  if (gebucht.length && !sandbox) return gebucht;
  const known = mergeProductNames(gebucht, recent.map((l) => l.source ?? ""));
  if (known.length && !sandbox) return known;
  const all = await prisma.product.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true } });
  return mergeProductNames(known, all.map((p) => p.name));
}

/**
 * Produkte des Kunden für Vorschauen („So arbeitet Ihr Assistent“, Ole 18.11.2026): nur gebuchte Produkte, eigene
 * Leadformulare, zuletzt genutzte Produkte und die Produkte aus seinem Angebot. Nie der ganze Katalog (der ist nur für
 * Testleads gedacht und enthält Pay-per-Lead-Produkte anderer Kunden).
 */
export async function kundenProdukte(customerId: string): Promise<string[]> {
  const [cps, sources, recent, ob] = await Promise.all([
    prisma.customerProduct.findMany({ where: { customerId }, select: { product: { select: { name: true } } } }),
    prisma.leadSource.findMany({ where: { customerId, active: true }, select: { productKey: true } }),
    prisma.lead.findMany({
      where: { customerId, isTest: false, source: { not: null }, NOT: { source: { in: ["Empfehlung", "Bestandskunde"] } } },
      distinct: ["source"],
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { source: true },
    }),
    prisma.onboarding.findUnique({ where: { customerId }, select: { offerId: true } }).catch(() => null),
  ]);
  const offer = ob?.offerId ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { products: true } }).catch(() => null) : null;
  const ausAngebot = (Array.isArray(offer?.products) ? (offer!.products as unknown[]) : [])
    .map((p) => (p && typeof p === "object" && typeof (p as { name?: unknown }).name === "string" ? String((p as { name: string }).name).trim() : ""))
    .filter(Boolean);
  return mergeProductNames(
    cps.map((c) => c.product.name),
    sources.map((s) => s.productKey),
    ausAngebot,
    recent.map((l) => l.source ?? ""),
  );
}

/** meta = Leadformular, der Assistent schreibt zuerst; eingehend = der Lead schreibt zuerst per WhatsApp. */
export type TestLeadHerkunft = "meta" | "eingehend";

export type TestLeadInput = {
  customerId: string;
  name?: string | null;
  product: string;
  phone: string;
  confirmed?: boolean;
  herkunft?: TestLeadHerkunft;
  /** Ansprache der Leads; nur bei Testkunden änderbar (Einstellung des Kunden, gilt für alle seine Leads). */
  ansprache?: Ansprache | null;
};

type Answer = { label: string; value: string };

const ORT: Answer[] = [
  { label: "Postleitzahl", value: "80331" },
  { label: "Ort", value: "München" },
];

/**
 * Formularangaben wie bei einem echten Lead des Produkts (Ole, 17.11.2026). Feldnamen wie aus den echten Eingängen:
 * Perspective-Funnel (lib/ppl/perspective.ts) für Tier und PKV, Meta-Leadformular für Privatschutz (wie
 * lib/demo-data.ts). Zahnzusatz ohne Gesundheitsangaben (Art. 9 DSGVO): kein „Fehlende Zähne“.
 */
export function testLeadAnswers(product: string): Answer[] {
  const p = product.toLowerCase();
  const tier = /katze|kater|\bhund|pferd|\btkv\b|tierkranken|tier-?op/.test(p) && !/futter|halter|privatschutz/.test(p);
  if (tier && /hund/.test(p)) {
    return [
      { label: "Tierart", value: "Hund" },
      { label: "Anzahl Tiere", value: "1" },
      { label: "Tiername", value: "Balu" },
      { label: "Geschlecht (Tier)", value: "männlich" },
      { label: "Rasse (Tier)", value: "Labrador Retriever" },
      { label: "Geburtsmonat (Tier)", value: "Juni" },
      { label: "Geburtsjahr (Tier)", value: "2021" },
      { label: "Kastriert (Tier)", value: "Nein" },
      { label: "Haltung (Tier)", value: "Im Haus mit Garten" },
      ...ORT,
    ];
  }
  if (tier && /pferd/.test(p)) {
    return [
      { label: "Tierart", value: "Pferd" },
      { label: "Anzahl Tiere", value: "1" },
      { label: "Tiername", value: "Luna" },
      { label: "Geschlecht (Tier)", value: "Stute" },
      { label: "Rasse (Tier)", value: "Haflinger" },
      { label: "Geburtsjahr (Tier)", value: "2016" },
      ...ORT,
    ];
  }
  if (tier) {
    return [
      { label: "Tierart", value: "Katze" },
      { label: "Anzahl Tiere", value: "1" },
      { label: "Tiername", value: "Minka" },
      { label: "Geschlecht (Tier)", value: "weiblich" },
      { label: "Rasse (Tier)", value: "Europäisch Kurzhaar" },
      { label: "Geburtsmonat (Tier)", value: "März" },
      { label: "Geburtsjahr (Tier)", value: "2022" },
      { label: "Kastriert (Tier)", value: "Ja" },
      { label: "Haltung (Tier)", value: "Wohnungskatze" },
      ...ORT,
    ];
  }
  if (/zahn/.test(p)) return [{ label: "Interesse (Zahnzusatz)", value: "Ja" }, ...ORT];
  if (/privatschutz|haftpflicht|hausrat|rechtsschutz|wohngeb(ä|a)ude|unfall/.test(p)) {
    return [
      { label: "Lebenssituation", value: "Familie mit Kindern" },
      { label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat" },
      ...ORT,
    ];
  }
  if (/\bpkv\b|kranken|wechsel|tarifoptim|neugesch/.test(p)) {
    return [
      { label: "Geburtsdatum", value: "14.05.1978" },
      ...ORT,
      { label: "Situation", value: "Angestellt" },
      { label: "Gesetzlich oder privat?", value: "Privat" },
      { label: "Aktuelle Versicherung", value: "Debeka" },
      { label: "Wie lange in PKV?", value: "Mehr als 10 Jahre" },
      { label: "Monatlicher Beitrag", value: "780" },
    ];
  }
  return [...ORT];
}

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
  if (status === "no_pdf") return "Erstinformation als PDF gerade nicht verfügbar: Das Erstanschreiben wird automatisch erneut versucht.";
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
 * Testlead anlegen und durch den echten Ablauf schicken (processNewLead). Bei echten Kunden (weder Testkunde noch intern)
 * nur mit Bestätigung (Häkchen „Verstanden, an echten Kunden senden“). Setzt den Einrichtungsschritt „Testlead durchgespielt“.
 */
export async function createTestLead(input: TestLeadInput, actor: AuditActor, now = new Date()): Promise<CreateTestLeadResult> {
  const checked = checkTestLeadInput(input);
  if (!checked.ok) return checked;
  const { name, product, phone } = checked;
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true, isTest: true, plan: true, dormantSince: true, leadAddress: true } });
  if (!customer) return { ok: false, error: "Kunde nicht gefunden." };
  if (customer.dormantSince) return { ok: false, error: "Das Konto ruht (Vertrag beendet): keine Leads." };
  if (!isTestLeadSandbox(customer) && input.confirmed !== true) {
    return { ok: false, error: `Echter Kunde: Bitte „${TEST_LEAD_CONFIRM_LABEL}“ anhaken.`, needsConfirm: true };
  }

  // Nummer gehört zu einem echten Lead dieses Kunden: bei echten Kunden nicht anfassen. Bei Testkunden und internen
  // Kunden (Ole, 17.11.2026) wird er als Test markiert und unten wie ein voriger Testlead ersetzt.
  const real = await prisma.lead.findMany({ where: { customerId: customer.id, phone, isTest: false }, select: { id: true, name: true } });
  if (real.length && !isTestLeadSandbox(customer)) {
    return { ok: false, error: "Diese Nummer gehört bei diesem Kunden zu einem echten Lead. Bitte eine andere Nummer nehmen." };
  }
  for (const r of real) {
    await prisma.lead.update({ where: { id: r.id }, data: { isTest: true } });
    console.log(testLeadLine(r.id, "marked test", { customer: customer.id }));
    await audit("lead.test_mark", { entity: "Lead", entityId: r.id, customerId: customer.id, details: { name: r.name, grund: "Testlead an dieselbe Nummer" }, actor });
  }

  // Frischer Durchlauf: Chat zurücksetzen (Fenster bleibt), vorige Testleads mit dieser Nummer ersetzen
  const conv = await prisma.conversation.findUnique({ where: { customerId_contactPhone: { customerId: customer.id, contactPhone: phone } }, select: { id: true } });
  if (conv) await resetConversation(conv.id, customer.id);
  const previous = await prisma.lead.findMany({ where: { customerId: customer.id, phone, isTest: true }, select: { id: true } });
  for (const p of previous) await deleteTestLead(p.id, { customerId: customer.id, actor });

  // Ansprache: Einstellung des Kunden. Nur bei Testkunden hier umstellbar (gilt dann für alle seine Leads).
  const ansprache = input.ansprache && customer.isTest ? asAnsprache(input.ansprache) : asAnsprache(customer.leadAddress);
  if (ansprache !== asAnsprache(customer.leadAddress)) await prisma.customer.update({ where: { id: customer.id }, data: { leadAddress: ansprache } });
  const eingehend = input.herkunft === "eingehend";

  const lead = await prisma.lead.create({
    data: {
      customerId: customer.id,
      isTest: true,
      name,
      phone,
      // E-Mail des Admins: Terminbestätigungen landen bei ihm (wie bei einem echten Lead mit E-Mail im Formular)
      email: actor.email?.trim().toLowerCase() || null,
      source: product,
      status: "Neuer Lead",
      // Formularangaben wie bei einem echten Lead dieses Produkts
      formData: testLeadAnswers(product),
      // Wie ein Lead aus dem Meta-Formular, ohne Meta-Lead-ID (geht so ohnehin nie an Meta)
      adChannel: "Meta",
      // Eingehend: kein Erstanschreiben (wie „Lead hat schon selbst geschrieben“), der Admin schreibt selbst zuerst
      ...(eingehend ? { outreachAt: now, outreachStatus: "skipped_contact" } : {}),
      waConsent: "ja",
      consentData: { at: now.toISOString(), formId: null, textVersion: null, text: "Testlead aus dem Admin an die eigene Nummer", responses: [] },
      createdAt: now,
    },
    select: { id: true },
  });
  console.log(testLeadLine(lead.id, "intake", { customer: customer.id, testCustomer: customer.isTest, product, herkunft: eingehend ? "eingehend" : "meta", ansprache, replaced: previous.length, chatReset: !!conv }));

  // Einrichtung: Schritt „Testlead durchgespielt“
  await prisma.onboarding.updateMany({ where: { customerId: customer.id, testLeadAt: null }, data: { testLeadAt: now } }).catch((e) => reportError(e, "testlead-onboarding"));
  await audit("lead.test_create", { entity: "Lead", entityId: lead.id, customerId: customer.id, details: { name, product, testCustomer: customer.isTest, herkunft: eingehend ? "eingehend" : "meta", ansprache }, actor });

  // Der echte Ablauf neuer Leads (lib/lead-intake.ts)
  const { processNewLead } = await import("@/lib/lead-intake");
  await processNewLead(lead.id).catch((err) => reportError(err, "testlead-process", { lead: lead.id }));

  const [after, agent] = await Promise.all([
    prisma.lead.findUnique({ where: { id: lead.id }, select: { outreachStatus: true } }),
    prisma.agentConfig.findUnique({ where: { customerId: customer.id }, select: { active: true, outreachEnabled: true, outreachDelayMin: true } }),
  ]);
  if (eingehend) return { ok: true, leadId: lead.id, outreach: TEST_EINGEHEND_TEXT };
  return { ok: true, leadId: lead.id, outreach: outreachText(after?.outreachStatus ?? null, agent?.outreachDelayMin ?? null, !!agent?.active && !!agent.outreachEnabled) };
}
