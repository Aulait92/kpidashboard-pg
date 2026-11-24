// Neue Anfrage einer anderen Person mit derselben Nummer (Ole, 19.11.2026, lib/lead-name.ts „andere_person“):
// lead-intake legt einen eigenen Lead an, der bisherige bleibt mit Verlauf und Terminen, wie er ist. Den WhatsApp-Chat
// gibt es je Nummer nur einmal (Conversation customerId+contactPhone), er geht an die neue Anfrage, damit Assistent,
// Fragen und Erstanschreiben für sie laufen: Lead-Zuordnung, Name, Qualifizierung des alten Gesprächs zurückgesetzt,
// Nachfassen des bisherigen Leads beendet (es ginge an dieselbe Nummer). Die Nachrichten bleiben im Chat.
// Ausnahme Termin: Hat der bisherige Lead noch einen gebuchten Termin vor sich, bleibt der Chat bei ihm (Erinnerungen und
// Absage laufen über den Chat), der Vermittler bekommt den Chat als „Braucht Sie“ mit Hinweis auf die neue Anfrage.
// Auch Diagnose q=lead-namen: Leads, deren Name vom Formularnamen bzw. Chatnamen abweicht (nur IDs).

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { anzeigeName } from "@/lib/lead-name";

export type ChatUebergabe = "uebergeben" | "termin" | "kein_chat";

/** Interne Chat-Nachricht der Übergabe: ab hier gehört der Chat zur neuen Anfrage (runOutreach: Erstanschreiben trotz Verlauf). */
export const NEUE_ANFRAGE_KIND = "neue_anfrage";

export async function chatAnNeueAnfrage(o: {
  customerId: string;
  leadId: string;
  altLeadId: string;
  name: string | null;
  altName: string | null;
  phone: string | null;
  productKey: string | null;
  now?: Date;
}): Promise<ChatUebergabe> {
  const now = o.now ?? new Date();
  const neu = o.name ?? "ohne Name";
  const alt = o.altName ?? "ohne Name";
  const conv = o.phone
    ? await prisma.conversation.findUnique({ where: { customerId_contactPhone: { customerId: o.customerId, contactPhone: o.phone } }, select: { id: true, leadId: true, optedOutAt: true } })
    : null;
  const verlauf = async (leadId: string, text: string) => {
    const { logLeadHistory } = await import("@/lib/lead-history");
    await logLeadHistory(leadId, "status", text, { customerId: o.customerId, userId: null }).catch((err) => reportError(err, "lead-name-verlauf", { lead: leadId }));
  };

  // Kein Chat mit der Nummer (bzw. er gehört zu einem dritten Lead): nur Verlauf, das Erstanschreiben läuft wie immer
  if (!conv || (conv.leadId && conv.leadId !== o.altLeadId)) {
    await verlauf(o.altLeadId, `Neue Anfrage mit derselben Nummer bzw. E-Mail als ${neu}: eigener Kontakt angelegt.`);
    await verlauf(o.leadId, `Eigener Kontakt: dieselbe Nummer bzw. E-Mail wie ${alt}, anderer Nachname.`);
    return "kein_chat";
  }

  const termin = await prisma.appointment.count({ where: { leadId: o.altLeadId, status: "booked", startsAt: { gt: now } } });
  if (termin > 0) {
    await prisma.$transaction([
      prisma.conversation.update({
        where: { id: conv.id },
        data: { needsAttention: true, attentionReason: `Neue Anfrage von ${neu} mit dieser Nummer, Termin mit ${alt} steht noch aus`, attentionAt: now },
      }),
      prisma.message.create({
        data: { conversationId: conv.id, direction: "internal", kind: "neue_anfrage_termin", body: JSON.stringify({ leadId: o.leadId, altLeadId: o.altLeadId, name: neu, produkt: o.productKey, at: now.toISOString() }), sentBy: "system" },
      }),
    ]);
    await verlauf(o.altLeadId, `Neue Anfrage mit derselben Nummer als ${neu}: eigener Kontakt angelegt. Der WhatsApp-Chat bleibt hier, weil der Termin noch aussteht.`);
    await verlauf(o.leadId, `Eigener Kontakt: dieselbe Nummer wie ${alt}, anderer Nachname. Der WhatsApp-Chat bleibt bei ${alt}, bis dessen Termin vorbei ist.`);
    return "termin";
  }

  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: conv.id },
      data: {
        leadId: o.leadId,
        contactName: o.name,
        // Gespräch der bisherigen Person gilt nicht für die neue Anfrage: Fragen beginnen von vorn
        qualified: false,
        qualificationSummary: null,
        qualificationData: Prisma.DbNull,
        needsAttention: false,
        attentionReason: null,
        attentionAt: null,
        // Neue Anfrage = Lead-Chat: Assistent an (außer nach „STOPP“, dann schreibt ohnehin niemand)
        ...(conv.optedOutAt ? {} : { botActive: true }),
      },
    }),
    prisma.message.create({
      data: { conversationId: conv.id, direction: "internal", kind: NEUE_ANFRAGE_KIND, body: JSON.stringify({ leadId: o.leadId, altLeadId: o.altLeadId, name: neu, produkt: o.productKey, at: now.toISOString() }), sentBy: "system" },
    }),
  ]);
  const { stopSequences } = await import("@/lib/lead-sequences");
  await stopSequences(o.altLeadId, `WhatsApp-Chat an die neue Anfrage von ${neu} übergeben`, { now }).catch((err) => reportError(err, "lead-name-abfolgen", { lead: o.altLeadId }));
  await verlauf(o.altLeadId, `Neue Anfrage mit derselben Nummer als ${neu}: eigener Kontakt angelegt. Der WhatsApp-Chat gehört jetzt zur neuen Anfrage.`);
  await verlauf(o.leadId, `Eigener Kontakt: dieselbe Nummer wie ${alt}, anderer Nachname. Der WhatsApp-Chat mit dem bisherigen Verlauf gehört jetzt hierher.`);
  return "uebergeben";
}

/**
 * Chat wurde für diese Anfrage übernommen und seitdem nichts geschrieben? Dann bekommt der neue Lead das
 * Erstanschreiben, obwohl der Chat schon Nachrichten der bisherigen Person hat (lib/whatsapp/outreach.ts).
 */
export async function chatFuerNeueAnfrageFrei(conversationId: string, leadId: string): Promise<boolean> {
  const marker = await prisma.message.findFirst({
    where: { conversationId, direction: "internal", kind: NEUE_ANFRAGE_KIND, body: { contains: `"leadId":"${leadId}"` } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!marker) return false;
  const danach = await prisma.message.count({ where: { conversationId, direction: { in: ["inbound", "outbound"] }, createdAt: { gt: marker.createdAt } } });
  return danach === 0;
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** Name aus dem Formular laut Formularangaben (Name, Vor- und Nachname), sonst null. */
function formularName(formData: unknown): string | null {
  if (!Array.isArray(formData)) return null;
  let first = "";
  let last = "";
  for (const x of formData) {
    const { label, value } = (x ?? {}) as { label?: unknown; value?: unknown };
    if (typeof label !== "string" || typeof value !== "string" || !value.trim()) continue;
    const l = label.toLowerCase().replace(/[^a-zäöüß]/g, "");
    if (!first && (l === "vorname" || l === "firstname")) first = value.trim();
    if (!last && (l === "nachname" || l === "lastname")) last = value.trim();
  }
  return [first, last].filter(Boolean).join(" ") || null;
}

/**
 * Diagnose q=lead-namen&tage=7 (nur IDs): Leads der letzten Tage, deren Anzeigename (Chatliste bzw. Chat) nicht der Name
 * am Lead ist (WhatsApp-Profilname hat ihn verdrängt), deren Name nicht zum Formular passt, und erneute Eintragungen mit
 * anderem Namen. Testleads getrennt gezählt.
 */
export async function leadNamenDiagnose(p: URLSearchParams) {
  const tage = Math.min(60, Math.max(1, Math.round(Number(p.get("tage") ?? 7)) || 7));
  const seit = new Date(Date.now() - tage * 86400000);
  const leads = await prisma.lead.findMany({
    // Neu in den letzten Tagen oder erneut eingetragen (dann ist der Lead selbst älter)
    where: { erasedAt: null, OR: [{ createdAt: { gte: seit } }, { reentries: { some: { createdAt: { gte: seit } } } }] },
    select: { id: true, name: true, isTest: true, formData: true, contactEditedAt: true, conversations: { select: { id: true, contactName: true } } },
  });
  const chatAbweichend: string[] = [];
  const chatAbweichendTest: string[] = [];
  const formularAbweichend: string[] = [];
  const nameInNeuerEintragung: string[] = [];
  for (const l of leads) {
    if (l.name?.trim() && l.conversations.some((c) => norm(anzeigeName({ contactName: c.contactName })) !== norm(l.name))) (l.isTest ? chatAbweichendTest : chatAbweichend).push(l.id);
    const f = formularName(l.formData);
    if (f && !l.contactEditedAt && norm(f) !== norm(l.name)) formularAbweichend.push(l.id);
    if (Array.isArray(l.formData) && l.formData.some((a) => (a as { label?: unknown })?.label === "Name in der neuen Eintragung")) nameInNeuerEintragung.push(l.id);
  }
  return {
    tage,
    leads: leads.length,
    chatnameWeichtAb: { anzahl: chatAbweichend.length, ids: chatAbweichend.slice(0, 200) },
    chatnameWeichtAbTestleads: { anzahl: chatAbweichendTest.length, ids: chatAbweichendTest.slice(0, 50) },
    formularnameWeichtAb: { anzahl: formularAbweichend.length, ids: formularAbweichend.slice(0, 200) },
    erneutMitAnderemNamen: { anzahl: nameInNeuerEintragung.length, ids: nameInNeuerEintragung.slice(0, 200) },
  };
}
