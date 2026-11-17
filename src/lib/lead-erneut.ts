// Erneut eingetragen (Ole, 16.11.2026): Trägt sich dieselbe Person beim selben Kunden noch einmal ein (gleiche
// Telefonnummer, normalisiert, oder gleiche E-Mail, kleingeschrieben; gelöschte, Storno- und Pay-per-Lead-Leads
// ausgenommen; ohne Frist), entsteht kein zweiter Lead:
// - Neue Formularantworten werden angehängt (vorhandene Angaben und Korrekturen bleiben), dazu „Erneut eingetragen“.
// - Wiedervorlage heute „Hat sich erneut eingetragen“ (Anrufliste auf Heute, oben), Push an den Zuständigen.
// - Verloren (Kein Interesse, Disqualifiziert): zurück auf „Neuer Lead“, der Verlustgrund steht im Verlauf.
//   Abschluss: Phase bleibt, Wiedervorlage „Weiteres Produkt anbieten?“ (Cross-Selling). Offen: Phase bleibt.
// - WhatsApp: Gab es schon ein Gespräch mit der Nummer, geht keine zweite Begrüßung raus (nur ein Hinweis im Chat).
//   Gab es nie eins, gilt das normale Erstanschreiben (sofort, mit dem Produkt der neuen Eintragung).
// - Zahlen: kein neuer Lead-Datensatz, also kein zweiter Lead in Kennzahlen und keine zweite Lead-Gebühr (Revenue).
//
// Sicherheit: lead-intake ruft das nur über tryReentry auf. Jeder Fehler vor dem Speichern führt zum normalen Weg
// (neuer Lead); nach dem Speichern scheitern Folgeschritte (Verlauf, Push, WhatsApp) einzeln, ohne den Eingang.

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { isLostStatus, lostReasonLabel, lostReasonOf } from "@/lib/lead-lost";
import { POLICY_TODO } from "@/lib/lead-followup";
import { CROSS_SELL_TODO, POLICE_TODO } from "@/lib/vertraege-shared";
import { adData, type LeadAd } from "@/lib/anzeige";

/** Text der Wiedervorlage bzw. Grund auf der Anrufliste. */
export const ERNEUT_TODO = "Hat sich erneut eingetragen";
/** Wiedervorlage aus einer erneuten Eintragung? (Anrufliste: nach oben) */
export const isErneutNote = (note: string | null | undefined) => !!note && note.toLowerCase().includes("erneut eingetragen");

const CLOSED_STATUS = "Abschluss";

export type ReentryInput = {
  customerId: string;
  productKey: string;
  externalId: string | null;
  formId: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  answers: { label: string; value: string }[];
  waConsent: string | null;
  consentData: unknown;
  /** Anzeige dieser Einsendung (lib/anzeige.ts); der Lead behält seine erste Anzeige */
  ad?: Partial<LeadAd> | null;
};

export type ReentryResult = { status: "reentry" | "duplicate"; leadId: string };

const MATCH_SELECT = {
  id: true,
  customerId: true,
  name: true,
  phone: true,
  email: true,
  status: true,
  formData: true,
  contactEditedAt: true,
  waConsent: true,
  airtableId: true,
  followUpAt: true,
  followUpNote: true,
  policyDoneAt: true,
  lostReason: true,
  lostNote: true,
  disqualifyReason: true,
} satisfies Prisma.LeadSelect;

type MatchLead = Prisma.LeadGetPayload<{ select: typeof MATCH_SELECT }>;

/** Bestehender Lead derselben Person beim selben Kunden (neuester zuerst), sonst null. */
export async function findReentryLead(customerId: string, phone: string | null, email: string | null): Promise<MatchLead | null> {
  const or: Prisma.LeadWhereInput[] = [];
  if (phone) or.push({ phone });
  if (email) or.push({ email: { equals: email.toLowerCase(), mode: "insensitive" } });
  if (or.length === 0) return null;
  return prisma.lead.findFirst({
    where: {
      customerId,
      erasedAt: null,
      // Pay-per-Lead hat eigene Dublettenregeln (lib/ppl), Storno-Leads bleiben abgeschlossen
      subscriptionId: null,
      orderId: null,
      OR: or,
      AND: [{ OR: [{ status: null }, { NOT: { status: { startsWith: "storno", mode: "insensitive" } } }] }],
    },
    orderBy: { createdAt: "desc" },
    select: MATCH_SELECT,
  });
}

type Answer = { label: string; value: string };
const isAnswer = (x: unknown): x is Answer =>
  !!x && typeof x === "object" && typeof (x as Answer).label === "string" && typeof (x as Answer).value === "string";
const key = (a: Answer) => `${a.label.trim().toLowerCase()}|${a.value.trim().toLowerCase()}`;

const berlinDate = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const berlinDay = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(d);

/**
 * Formularantworten zusammenführen: Bisherige bleiben vorn (Name, Anrede usw. nehmen den ersten Treffer), danach
 * „Erneut eingetragen“ mit Datum und Produkt, neue bzw. geänderte Antworten und abweichende Kontaktdaten.
 */
export function mergeFormData(old: unknown, inc: Pick<ReentryInput, "answers" | "productKey">, extras: Answer[], now: Date): Answer[] {
  const base = Array.isArray(old) ? old.filter(isAnswer) : [];
  const have = new Set(base.map(key));
  const add = [...inc.answers, ...extras].filter((a) => a.value.trim() && !have.has(key(a)));
  return [...base, { label: "Erneut eingetragen", value: `${berlinDate(now)}, ${inc.productKey}` }, ...add];
}

/** WhatsApp-Erstanschreiben möglich (Assistent an, Erstanschreiben an, Nummer verbunden)? */
async function outreachReady(customerId: string): Promise<boolean> {
  const [agent, account] = await Promise.all([
    prisma.agentConfig.findUnique({ where: { customerId }, select: { active: true, outreachEnabled: true } }),
    prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true } }),
  ]);
  return !!agent?.active && !!agent.outreachEnabled && account?.status === "connected";
}

const isUniqueError = (err: unknown) =>
  (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") || (err instanceof Error && /Unique constraint|P2002/.test(err.message));

/**
 * Erneute Eintragung erkennen und verarbeiten. null = keine Dublette oder Fehler vor dem Speichern: dann legt
 * lead-intake wie bisher einen neuen Lead an (Fehler werden gemeldet, nie geworfen).
 */
export async function tryReentry(inc: ReentryInput, now = new Date()): Promise<ReentryResult | null> {
  let lead: MatchLead | null;
  try {
    lead = await findReentryLead(inc.customerId, inc.phone, inc.email);
  } catch (err) {
    reportError(err, "lead-erneut-suche", { customer: inc.customerId });
    return null;
  }
  if (!lead) return null;

  let saved: Awaited<ReturnType<typeof saveReentry>>;
  try {
    saved = await saveReentry(lead, inc, now);
  } catch (err) {
    // Gleichzeitige Doppel-Zustellung (Meta + Zapier) derselben Einsendung → Dublette
    if (inc.externalId && isUniqueError(err)) {
      const dup = await prisma.leadReentry.findUnique({ where: { externalId: inc.externalId }, select: { leadId: true } }).catch(() => null);
      if (dup) return { status: "duplicate", leadId: dup.leadId };
    }
    reportError(err, "lead-erneut-speichern", { lead: lead.id });
    return null;
  }
  await afterReentry(lead, inc, saved, now).catch((err) => reportError(err, "lead-erneut-folgen", { lead: lead.id }));
  return { status: "reentry", leadId: lead.id };
}

/** Speichern in einer Transaktion: Einsendung (Meta-Lead-ID eindeutig) und Lead (Antworten, Phase, Wiedervorlage). */
async function saveReentry(lead: MatchLead, inc: ReentryInput, now: Date) {
  const keepContact = !!lead.contactEditedAt;
  const extras: Answer[] = [];
  const fill: Prisma.LeadUpdateInput = {};
  // Fehlende Kontaktdaten ergänzen (nicht nach einer Korrektur im Kontakt), abweichende als weitere Angabe
  if (inc.name && !lead.name && !keepContact) fill.name = inc.name;
  else if (inc.name && lead.name && inc.name.trim().toLowerCase() !== lead.name.trim().toLowerCase()) extras.push({ label: "Name in der neuen Eintragung", value: inc.name });
  if (inc.phone && !lead.phone && !keepContact) fill.phone = inc.phone;
  else if (inc.phone && inc.phone !== lead.phone) extras.push({ label: "Weitere Telefonnummer", value: `+${inc.phone}` });
  if (inc.email && !lead.email && !keepContact) fill.email = inc.email;
  else if (inc.email && inc.email !== lead.email?.toLowerCase()) extras.push({ label: "Weitere E-Mail", value: inc.email });
  const phone = (fill.phone as string | undefined) ?? lead.phone;

  // WhatsApp: gibt es schon ein Gespräch (mit dieser Nummer oder am Lead)?
  const phones = [...new Set([lead.phone, inc.phone].filter((p): p is string => !!p))];
  const convs = await prisma.conversation.findMany({
    where: { customerId: lead.customerId, OR: [{ leadId: lead.id }, ...phones.map((p) => ({ contactPhone: p }))] },
    select: { id: true, _count: { select: { messages: true } } },
  });
  const chats = convs.filter((c) => c._count.messages > 0).map((c) => c.id);
  const outreach = chats.length === 0 && !!phone && (await outreachReady(lead.customerId));

  const lost = isLostStatus(lead.status);
  const won = (lead.status ?? "").trim() === CLOSED_STATUS;
  // Abschluss mit offener Aufgabe zum Vertrag (Police fertig machen, Police da?) → Wiedervorlage bleibt
  const keepTodo = won && !!lead.followUpAt && (lead.followUpNote === POLICY_TODO || lead.followUpNote === POLICE_TODO);
  const note = won ? `${CROSS_SELL_TODO} ${ERNEUT_TODO} (${inc.productKey}).` : `${ERNEUT_TODO} (${inc.productKey})`;
  // Vorherige eigene Wiedervorlage (nicht aus einer früheren Eintragung) im Verlauf festhalten
  const replaced = !keepTodo && lead.followUpAt && lead.followUpNote && !isErneutNote(lead.followUpNote) ? { at: lead.followUpAt, note: lead.followUpNote } : null;

  const data: Prisma.LeadUpdateInput = {
    ...fill,
    formData: mergeFormData(lead.formData, inc, extras, now) as unknown as Prisma.InputJsonValue,
    // Einwilligung zu WhatsApp nur ergänzen, nie zurücknehmen (Widerruf geht per „STOPP“)
    ...(inc.waConsent === "ja" && lead.waConsent !== "ja" ? { waConsent: "ja" } : {}),
    callbackSnoozedUntil: null,
    ...(keepTodo ? {} : { followUpAt: now, followUpNote: note }),
    ...(lost ? { status: "Neuer Lead", closedAt: null, lostReason: null, lostNote: null, lostAt: null, lostEarly: false, disqualifyReason: null } : {}),
    // Nie ein Gespräch: normales Erstanschreiben (runOutreach nimmt nur Leads ohne outreachAt)
    ...(outreach ? { outreachAt: null, outreachStatus: null } : {}),
  };
  await prisma.$transaction([
    prisma.leadReentry.create({
      data: {
        leadId: lead.id,
        customerId: lead.customerId,
        externalId: inc.externalId,
        formId: inc.formId,
        productKey: inc.productKey,
        consentData: (inc.consentData ?? Prisma.DbNull) as Prisma.InputJsonValue,
        ...adData(inc.ad),
      },
    }),
    prisma.lead.update({ where: { id: lead.id }, data }),
  ]);
  return { lost, won, keepTodo, replaced, chats, outreach };
}

/** Folgeschritte nach dem Speichern: jeder für sich, Fehler werden gemeldet. */
async function afterReentry(lead: MatchLead, inc: ReentryInput, s: Awaited<ReturnType<typeof saveReentry>>, now: Date) {
  const step = async (where: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      reportError(err, `lead-erneut-${where}`, { lead: lead.id });
    }
  };

  // Verlauf
  const parts = [`${ERNEUT_TODO} (${inc.productKey}).`];
  if (s.lost) {
    const grund = lostReasonLabel(lostReasonOf(lead)) ?? lead.status;
    parts.push(`Zurück auf „Neuer Lead“, vorher verloren: ${grund}${lead.lostNote ? ` (${lead.lostNote})` : ""}.`);
  }
  if (s.won) parts.push(s.keepTodo ? "Phase bleibt Abschluss." : "Phase bleibt Abschluss, Wiedervorlage heute: weiteres Produkt anbieten?");
  else parts.push("Wiedervorlage heute.");
  if (s.replaced) parts.push(`Vorherige Wiedervorlage ${berlinDay(s.replaced.at)}: „${s.replaced.note}“.`);
  await step("verlauf", async () => {
    const { logLeadHistory } = await import("@/lib/lead-history");
    await logLeadHistory(lead.id, "status", parts.join(" "), { customerId: lead.customerId, userId: null });
  });

  // Airtable-Leads: Phase dort mitziehen (sonst setzt der Abgleich sie zurück)
  if (s.lost && lead.airtableId) {
    await step("airtable", async () => {
      const { updateLeadEditableFields } = await import("@/lib/airtable-write");
      await updateLeadEditableFields({ airtableId: lead.airtableId!, bearbeitungsstatus: "Neuer Lead" });
    });
  }

  // Bestehendes Gespräch: keine zweite Begrüßung, nur ein Hinweis im Chat
  for (const conversationId of s.chats) {
    await step("chat", () =>
      prisma.message.create({
        data: { conversationId, direction: "internal", kind: "erneut_eingetragen", body: JSON.stringify({ produkt: inc.productKey, at: now.toISOString() }), sentBy: "system" },
      }),
    );
  }

  // Push an den Zuständigen (bzw. alle Nutzer des Kunden), wie bei neuen Leads
  await step("push", async () => {
    const { notifyLeadPush } = await import("@/lib/team");
    await notifyLeadPush(lead.id, {
      title: `🔁 Erneut eingetragen: ${lead.name ?? inc.name ?? "ohne Name"}`,
      body: s.keepTodo ? `${inc.productKey}. Mehr im Verlauf des Kontakts.` : `${inc.productKey}. Steht heute oben auf Ihrer Anrufliste.`,
      tag: `lead-erneut:${lead.id}`,
      url: "/buyer",
    });
  });

  // Nie ein Gespräch: normales Erstanschreiben mit dem Produkt der neuen Eintragung
  if (s.outreach) {
    await step("outreach", async () => {
      const { runOutreach } = await import("@/lib/whatsapp/outreach");
      await runOutreach(lead.customerId, { leadIds: [lead.id], source: inc.productKey });
    });
  }
}
