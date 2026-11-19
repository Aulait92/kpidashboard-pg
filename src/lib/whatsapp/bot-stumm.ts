// Sicherheitsnetz „Assistent stumm“ (Ole, 19.11.2026, nach dem Produktionsfehler der Policen-Strecke v2: ein Fehler im
// Bot-Turn ließ den Lead ganz ohne Antwort). Bleibt eine eingehende Lead-Nachricht länger als 2 Minuten ohne jede
// ausgehende Nachricht, obwohl der Assistent hätte antworten sollen, dann (genau einmal je Nachricht):
//   a) im offenen 24-Stunden-Fenster eine kurze freie Antwort an den Lead („Danke, ich habe es notiert. Herr Kannapinn
//      meldet sich dazu.“ bzw. Du mit Vorname),
//   b) Aufgabe am Lead (LeadTask, Art bot_stumm:<Nachricht>) und Hinweis „braucht dich“ mit Push an den Vermittler,
//   c) Sentry-Event mit Konversations-ID.
// Danach ist der Assistent in diesem Chat pausiert (wie bei der Übergabe an den Menschen), damit er nicht doppelt
// antwortet; der Vermittler übernimmt.
// Ausnahmen (der Assistent sollte gar nicht antworten): Support-Nummer, Chat ohne Lead, Assistent pausiert bzw. Mensch
// hat übernommen (botActive aus, Hinweis „braucht dich“ schon gesetzt), „Stopp“, gelöschter Lead, Assistent nicht
// eingerichtet bzw. aus, ruhendes Konto, laufendes Telefonat, Nachrichten ohne Antwortbedarf (Reaktionen, Sticker).
// Läuft im Minuten-Cron (api/mail-strecke/cron) und als Rückfall im WhatsApp-Cron (alle 5 Minuten).
// Diagnose: /api/ops/diagnose?q=bot-stumm&tage=7[&aufgaben=1].

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { a, asAnsprache } from "@/lib/ansprache";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";

export const BOT_STUMM_MERKER = "bot_stumm";
/** Ohne Antwort nach so vielen Millisekunden gilt eine Nachricht als unbeantwortet. */
export const BOT_STUMM_GRENZE_MS = 2 * 60 * 1000;
/** Der Cron schaut so weit zurück (ältere Fälle: Diagnose mit &aufgaben=1). */
const RUECKBLICK_MS = 3 * 60 * 60 * 1000;
/** Eingehende Arten ohne Antwortbedarf */
export const OHNE_ANTWORT_ARTEN = ["reaction", "sticker", "unsupported", "system", "errors", "ephemeral"];
/** Interne Merker: ab hier antwortet der Mensch (Übergabe, Stopp) */
const MENSCH_MERKER = ["ki_handover", "handover", "opt_out"];

const aufgabeArt = (messageId: string) => `${BOT_STUMM_MERKER}:${messageId}`;

/** Kurze Antwort an den Lead (keine Gedankenstriche). */
export function stummAntwort(an: "du" | "sie", person: { nom: string }): string {
  return a(an, `Danke, ich hab's notiert. ${person.nom} meldet sich dazu.`, `Danke, ich habe es notiert. ${person.nom} meldet sich dazu.`);
}

export const stummAufgabe = (leadName: string | null) => `Assistent hat nicht geantwortet: bitte ${leadName?.trim() || "dem Kontakt"} selbst antworten`;

type Zeile = { id: string; direction: string; kind: string; sentBy: string | null; createdAt: Date };

/**
 * Rein: unbeantwortete eingehende Nachrichten eines Chats (chronologisch sortiert). Eine eingehende Nachricht zählt,
 * wenn binnen grenzeMs weder eine ausgehende noch eine weitere eingehende Nachricht folgt (dann gilt die spätere) und
 * vorher kein Mensch übernommen hat (Übergabe, Stopp, Antwort des Vermittlers). bisNow: Nachrichten jünger als die
 * Grenze zählen (noch) nicht. spaeterBeantwortet: irgendeine ausgehende Nachricht danach.
 */
export function unbeantwortete(zeilen: Zeile[], o: { grenzeMs?: number; now: Date }): { id: string; at: Date; spaeterBeantwortet: boolean }[] {
  const grenze = o.grenzeMs ?? BOT_STUMM_GRENZE_MS;
  const out: { id: string; at: Date; spaeterBeantwortet: boolean }[] = [];
  let mensch = false;
  for (let i = 0; i < zeilen.length; i++) {
    const m = zeilen[i];
    if (m.direction === "internal" && MENSCH_MERKER.includes(m.kind)) mensch = true;
    if (m.direction === "outbound" && m.sentBy === "agent") mensch = true;
    if (m.direction !== "inbound" || mensch || OHNE_ANTWORT_ARTEN.includes(m.kind)) continue;
    if (o.now.getTime() - m.createdAt.getTime() <= grenze) continue;
    const bis = m.createdAt.getTime() + grenze;
    let folge = false;
    let spaeter = false;
    for (let j = i + 1; j < zeilen.length; j++) {
      const n = zeilen[j];
      if (n.direction === "outbound") {
        spaeter = true;
        if (n.createdAt.getTime() <= bis) folge = true;
        break;
      }
      if (n.direction === "inbound" && !OHNE_ANTWORT_ARTEN.includes(n.kind) && n.createdAt.getTime() <= bis) {
        folge = true;
        break;
      }
    }
    if (!folge) out.push({ id: m.id, at: m.createdAt, spaeterBeantwortet: spaeter });
  }
  return out;
}

/** Aufgabe am Lead (eine je Nachricht, idempotent über LeadTask leadId+kind). */
export async function stummAufgabeAnlegen(o: { leadId: string; customerId: string; messageId: string; leadName: string | null }, now = new Date()): Promise<"aktiv" | "wartet" | "vorhanden"> {
  const { planeAufgabe } = await import("@/lib/lead-aufgaben");
  return planeAufgabe({ leadId: o.leadId, customerId: o.customerId, kind: aufgabeArt(o.messageId), note: stummAufgabe(o.leadName), dueAt: now }, now);
}

type Ergebnis = { geprueft: number; gemeldet: number; geantwortet: number };

/** Im Cron: unbeantwortete Lead-Nachrichten finden und abfangen (siehe oben). */
export async function runBotStumm(now = new Date()): Promise<Ergebnis> {
  const erg: Ergebnis = { geprueft: 0, gemeldet: 0, geantwortet: 0 };
  // Kandidaten: jüngste eingehende Nachricht je Chat, älter als die Grenze, Lead-Chat mit aktivem Assistenten
  const eingang = await prisma.message.findMany({
    where: {
      direction: "inbound",
      kind: { notIn: OHNE_ANTWORT_ARTEN },
      createdAt: { gte: new Date(now.getTime() - RUECKBLICK_MS), lte: new Date(now.getTime() - BOT_STUMM_GRENZE_MS) },
      conversation: {
        customerId: { not: SUPPORT_CUSTOMER_ID },
        leadId: { not: null },
        botActive: true,
        needsAttention: false,
        optedOutAt: null,
        lead: { erasedAt: null },
        customer: { dormantSince: null },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, conversationId: true, createdAt: true },
  });
  const jeChat = new Map<string, { id: string; createdAt: Date }>();
  for (const m of eingang) if (!jeChat.has(m.conversationId)) jeChat.set(m.conversationId, m);

  for (const [conversationId, m] of jeChat) {
    erg.geprueft++;
    try {
      const r = await abfangen(conversationId, m, now);
      if (r) erg.gemeldet++;
      if (r === "mit_antwort") erg.geantwortet++;
    } catch (e) {
      reportError(e, "bot-stumm", { conversation: conversationId });
    }
  }
  return erg;
}

async function abfangen(conversationId: string, m: { id: string; createdAt: Date }, now: Date): Promise<"mit_antwort" | "ohne_antwort" | false> {
  // Jüngere eingehende Nachricht innerhalb der Grenze: dann wird diese geprüft (nächster Lauf)
  const juenger = await prisma.message.count({ where: { conversationId, direction: "inbound", createdAt: { gt: m.createdAt } } });
  if (juenger) return false;
  const antwort = await prisma.message.count({ where: { conversationId, direction: "outbound", createdAt: { gt: m.createdAt } } });
  if (antwort) return false;
  const schon = await prisma.message.count({ where: { conversationId, direction: "internal", kind: BOT_STUMM_MERKER, body: { contains: m.id } } });
  if (schon) return false;
  const mensch = await prisma.message.count({ where: { conversationId, direction: "internal", kind: { in: MENSCH_MERKER }, createdAt: { gt: new Date(m.createdAt.getTime() - 60 * 60 * 1000) } } });
  if (mensch) return false;

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, customerId: true, contactPhone: true, contactName: true, leadId: true, windowExpiresAt: true, lead: { select: { id: true, name: true, isTest: true } } },
  });
  if (!conv?.leadId || !conv.lead) return false;
  const agent = await prisma.agentConfig.findUnique({ where: { customerId: conv.customerId }, select: { active: true } });
  if (!agent?.active) return false;
  const { anrufPausiert } = await import("@/lib/telefonat-server");
  if (await anrufPausiert(conv.leadId, now)) return false;

  // Genau einmal: Assistent pausieren (nur wenn noch aktiv; ein paralleler Lauf bekommt count 0) und Merker setzen
  const pause = await prisma.conversation.updateMany({ where: { id: conversationId, botActive: true }, data: { botActive: false } });
  if (!pause.count) return false;
  await prisma.message.create({ data: { conversationId, direction: "internal", kind: BOT_STUMM_MERKER, body: JSON.stringify({ messageId: m.id, at: m.createdAt.toISOString() }), sentBy: "system" } });

  // c) Sentry
  reportError(new Error("Assistent hat nicht geantwortet"), "bot-stumm", { conversation: conversationId, message: m.id, test: conv.lead.isTest });

  // a) kurze Antwort an den Lead (nur im offenen Fenster, freie Nachricht)
  let geantwortet = false;
  if (conv.windowExpiresAt && conv.windowExpiresAt.getTime() > now.getTime()) {
    try {
      const customer = await prisma.customer.findUnique({ where: { id: conv.customerId }, select: { name: true, leadAddress: true } });
      const an = asAnsprache(customer?.leadAddress);
      const { ansprechpartner } = await import("@/lib/lead-anrede");
      const { vermittlerName } = await import("@/lib/vermittler-nennung");
      const { advisorDisplayName } = await import("@/lib/advisor-name");
      const who = await ansprechpartner({ customerId: conv.customerId, leadId: conv.leadId, phone: conv.contactPhone, name: conv.contactName });
      const fallback = who.advisor || advisorDisplayName(customer?.name) || (an === "du" ? "dein Berater" : "Ihr Berater");
      const person = vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback });
      const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
      await sendWhatsAppMessage({ customerId: conv.customerId, to: conv.contactPhone, body: stummAntwort(an, person), sentBy: "bot" });
      geantwortet = true;
    } catch (e) {
      reportError(e, "bot-stumm-antwort", { conversation: conversationId });
    }
  }

  // b) Aufgabe und Push an den Vermittler
  const text = stummAufgabe(conv.lead.name ?? conv.contactName);
  await stummAufgabeAnlegen({ leadId: conv.leadId, customerId: conv.customerId, messageId: m.id, leadName: conv.lead.name ?? conv.contactName }, now).catch((e) =>
    reportError(e, "bot-stumm-aufgabe", { conversation: conversationId }),
  );
  const { flagAttention } = await import("@/lib/whatsapp/attention");
  await flagAttention(conversationId, text).catch((e) => reportError(e, "bot-stumm-push", { conversation: conversationId }));
  return geantwortet ? "mit_antwort" : "ohne_antwort";
}

/**
 * Diagnose (q=bot-stumm): eingehende Lead-Nachrichten der letzten `tage` Tage ohne Antwort binnen 2 Minuten (Ausnahmen
 * wie oben, soweit im Verlauf erkennbar), getrennt nach Testleads und echten Leads, nur IDs und Zeit. aufgaben = true:
 * für echte Leads, die bis heute unbeantwortet sind, je eine Aufgabe beim Vermittler (idempotent).
 */
export async function botStummDiagnose(o: { tage: number; aufgaben: boolean; now?: Date }) {
  const now = o.now ?? new Date();
  const seit = new Date(now.getTime() - o.tage * 24 * 60 * 60 * 1000);
  const convs = await prisma.conversation.findMany({
    where: {
      customerId: { not: SUPPORT_CUSTOMER_ID },
      leadId: { not: null },
      lead: { erasedAt: null },
      messages: { some: { direction: "inbound", createdAt: { gte: seit } } },
    },
    select: { id: true, customerId: true, leadId: true, optedOutAt: true, contactName: true, lead: { select: { isTest: true, name: true } }, customer: { select: { agentConfig: { select: { active: true } } } } },
    take: 3000,
  });
  type Fall = { leadId: string; kundeId: string; at: Date; messageId: string; bisHeuteOffen: boolean };
  const test: Fall[] = [];
  const echt: Fall[] = [];
  const aufgabenErg = { angelegt: 0, vorhanden: 0 };
  for (const c of convs) {
    if (!c.leadId || c.customer.agentConfig?.active === false) continue;
    const zeilen = await prisma.message.findMany({
      where: { conversationId: c.id, createdAt: { gte: new Date(seit.getTime() - 24 * 60 * 60 * 1000) }, OR: [{ direction: { in: ["inbound", "outbound"] } }, { direction: "internal", kind: { in: MENSCH_MERKER } }] },
      orderBy: { createdAt: "asc" },
      select: { id: true, direction: true, kind: true, sentBy: true, createdAt: true },
      take: 2000,
    });
    for (const u of unbeantwortete(zeilen, { now })) {
      if (u.at < seit || (c.optedOutAt && c.optedOutAt <= u.at)) continue;
      const fall: Fall = { leadId: c.leadId, kundeId: c.customerId, at: u.at, messageId: u.id, bisHeuteOffen: !u.spaeterBeantwortet };
      (c.lead?.isTest ? test : echt).push(fall);
      if (o.aufgaben && !c.lead?.isTest && fall.bisHeuteOffen) {
        const r = await stummAufgabeAnlegen({ leadId: c.leadId, customerId: c.customerId, messageId: u.id, leadName: c.lead?.name ?? c.contactName }, now);
        if (r === "vorhanden") aufgabenErg.vorhanden++;
        else aufgabenErg.angelegt++;
      }
    }
  }
  if (o.aufgaben) {
    const { audit } = await import("@/lib/audit");
    await audit("ops.bot_stumm_aufgaben", { details: { tage: o.tage, ...aufgabenErg } }).catch(() => undefined);
  }
  const liste = (f: Fall[]) => f.sort((x, y) => y.at.getTime() - x.at.getTime()).map((x) => ({ leadId: x.leadId, kundeId: x.kundeId, at: x.at, bisHeuteOffen: x.bisHeuteOffen }));
  return {
    tage: o.tage,
    grenzeMinuten: BOT_STUMM_GRENZE_MS / 60000,
    echt: { anzahl: echt.length, bisHeuteOffen: echt.filter((x) => x.bisHeuteOffen).length, liste: liste(echt) },
    test: { anzahl: test.length, bisHeuteOffen: test.filter((x) => x.bisHeuteOffen).length, liste: liste(test) },
    ...(o.aufgaben ? { aufgaben: aufgabenErg } : {}),
  };
}
