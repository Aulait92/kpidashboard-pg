// Dateien im Chat für Vermittler (Ole, 25.11.2026): Im Kundenbereich „Nachrichten“ stand bei Dateien nur „[document]“.
// Jetzt dieselbe Dateikarte wie im Admin (Name, Art, Größe, Zeit), Regeln in lib/chat-dateien.ts dateiFuerVermittler.
// Öffnen: eigener Abruf (api/buyer/chats/datei/<id>) nur für Logins, die den Chat sehen (conversationScope: Inhaber alles,
// Berater die Chats seiner Leads), nie in der Admin-Vorschau bzw. App-Demo, kein Support-Protokoll (es sind die Daten des
// Vermittlers). Gesundheitsbezug wie die Policen-Ablage: nur mit Zwei-Faktor-Login, jeder Abruf im Änderungsprotokoll
// (ohne Dateinamen). Unterlagen der Policen-Ablage öffnet der Vermittler im Kontakt, nicht hier.

import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { conversationScope, type TeamCtx } from "@/lib/team";
import { zweiFaktorAktiv } from "@/lib/totp-account";
import { dateiFuerVermittler, istDateiNachricht, type DateiKontext, type DateiNachricht, type VermittlerDatei } from "@/lib/chat-dateien";

type Chat = { id: string; leadId: string | null; lead?: { source: string | null } | null };

async function kontextFuer(chat: Chat, ids: string[], now: Date, vorschau: boolean): Promise<DateiKontext & { leadId: string | null; vorschau: boolean }> {
  const [ablage, lead] = await Promise.all([
    chat.leadId && ids.length
      ? prisma.leadDocument.findMany({ where: { leadId: chat.leadId, messageId: { in: ids }, status: "gespeichert" }, select: { messageId: true, mimeType: true, size: true, fileName: true } })
      : Promise.resolve([]),
    chat.lead === undefined && chat.leadId ? prisma.lead.findUnique({ where: { id: chat.leadId }, select: { source: true } }) : Promise.resolve(chat.lead ?? null),
  ]);
  return {
    leadChat: !!chat.leadId,
    leadSource: lead?.source ?? null,
    ablage: new Map(ablage.filter((d) => d.messageId).map((d) => [d.messageId!, { mimeType: d.mimeType, size: d.size, fileName: d.fileName }])),
    leadId: chat.leadId,
    vorschau,
    now,
  };
}

/** Dateien eines Verlaufs für die Ansicht im Kundenbereich (Nachrichten-ID → Karte). Lädt nur, wenn Dateien drin sind. */
export async function vermittlerDateienImVerlauf(chat: Chat, messages: DateiNachricht[], o: { vorschau: boolean; now?: Date }): Promise<Map<string, VermittlerDatei>> {
  const mitDatei = messages.filter((m) => istDateiNachricht(m.kind));
  if (!mitDatei.length) return new Map();
  const k = await kontextFuer(chat, mitDatei.map((m) => m.id), o.now ?? new Date(), o.vorschau);
  const out = new Map<string, VermittlerDatei>();
  for (const m of mitDatei) {
    const d = dateiFuerVermittler(m, k);
    if (d) out.set(m.id, d);
  }
  return out;
}

export type VermittlerAbruf =
  | { ok: true; name: string; mime: string; data: Buffer }
  | { ok: false; grund: "nicht_gefunden" | "zwei_faktor" | "nicht_abrufbar"; conversationId?: string };

/**
 * Datei für den Vermittler laden. Prüft: Login darf den Chat sehen (conversationScope), keine Vorschau, Datei hat
 * abrufbaren Inhalt und ist keine Unterlage der Policen-Ablage, Gesundheitsbezug nur mit Zwei-Faktor-Login.
 */
export async function ladeVermittlerDatei(
  ctx: TeamCtx & { preview: boolean; demo?: boolean; email?: string | null },
  messageId: string,
  deps: { laden?: typeof import("@/lib/support-zugriff").ladeDateiInhalt; now?: Date } = {},
): Promise<VermittlerAbruf> {
  if (ctx.preview || ctx.demo || !ctx.userId) return { ok: false, grund: "nicht_gefunden" };
  const m = await prisma.message.findFirst({
    where: { id: String(messageId ?? ""), conversation: conversationScope(ctx) },
    select: {
      id: true,
      direction: true,
      kind: true,
      body: true,
      sentBy: true,
      createdAt: true,
      mediaId: true,
      mediaName: true,
      mediaMime: true,
      mediaSize: true,
      mediaLink: true,
      conversation: { select: { id: true, customerId: true, leadId: true, lead: { select: { source: true } } } },
    },
  });
  if (!m || m.conversation.customerId !== ctx.customerId) return { ok: false, grund: "nicht_gefunden" };
  const chat = m.conversation;
  const k = await kontextFuer({ id: chat.id, leadId: chat.leadId, lead: chat.lead }, [m.id], deps.now ?? new Date(), false);
  const d = dateiFuerVermittler(m, k);
  if (!d) return { ok: false, grund: "nicht_gefunden" };
  if (!d.oeffnen) return { ok: false, grund: "nicht_abrufbar", conversationId: chat.id };
  if (d.oeffnen === "zwei_faktor" && !(await zweiFaktorAktiv(ctx.userId))) return { ok: false, grund: "zwei_faktor", conversationId: chat.id };
  const laden = deps.laden ?? (await import("@/lib/support-zugriff")).ladeDateiInhalt;
  const inhalt = await laden(ctx.customerId, m, "chat-datei");
  if (!inhalt) return { ok: false, grund: "nicht_abrufbar", conversationId: chat.id };
  // Gesundheitsbezug: jeder Abruf im Änderungsprotokoll (wie policen.abruf), ohne Dateinamen
  if (d.geschuetzt) {
    await audit("chat.datei_abruf", {
      entity: "Message",
      entityId: m.id,
      customerId: ctx.customerId,
      details: { conversationId: chat.id },
      actor: { id: ctx.userId, email: ctx.email ?? null, role: "BUYER" },
    }).catch(() => null);
  }
  return { ok: true, ...inhalt };
}
