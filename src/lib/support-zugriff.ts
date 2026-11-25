// Dateien im Admin-Chat und Support-Zugriff (Ole, 25.11.2026). Zwei Stufen:
//   1. Metadaten immer: Name, Art, Größe, Absender, Zeit (lib/chat-dateien.ts dateiInfo), Gesundheitsbezug und
//      Policen-Ablage nur als „Unterlage (geschützt)“.
//   2. Inhalt nur per Support-Zugriff: Pflicht-Grund (mindestens 10 Zeichen), Eintrag im unveränderbaren Protokoll
//      (SupportZugriff, Trigger nur anhängen), Mitteilung an den Vermittler (E-Mail mit dem genauen Wortlaut, Push
//      neutral), dann ein signierter Link für 15 Minuten nur für diesen Admin (lib/support-zugriff-link.ts).
// Gesperrt bleibt alles mit Gesundheitsbezug bzw. aus der Policen-Ablage: dort nur Break-Glass (Rechtsprüfung,
// docs/recht/policen-whatsapp-gesundheitsdaten.md, „Zugriffskontrolle“). Keine Dateinamen oder Inhalte im Log (A7).

import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";
import { dateiInfo, istDateiNachricht, pruefeGrund, ZUGRIFF_MINUTEN, supportZugriffText, type DateiInfo, type DateiKontext, type DateiNachricht } from "@/lib/chat-dateien";
import { zugriffPfad, zugriffToken } from "@/lib/support-zugriff-link";
import { isSupportCustomer } from "@/lib/whatsapp/support-inbox";

/** Größte Datei, die der Support-Zugriff ausliefert. */
export const ZUGRIFF_MAX_BYTES = 25 * 1024 * 1024;
export const SUPPORT_ZUGRIFFE_PFAD = "/buyer/einstellungen/support-zugriffe";

const vorname = (s: string | null | undefined) => (s ?? "").trim().split(/\s+/)[0] || null;

/** Anzeigename aus dem Login: displayName, sonst aus der E-Mail („ole.kannapinn@…“ → „Ole Kannapinn“). */
export function nameAusLogin(u: { displayName?: string | null; email: string }): string {
  const d = u.displayName?.trim();
  if (d) return d;
  const lokal = u.email.split("@")[0] ?? "";
  const teile = lokal.split(/[._-]+/).filter((t) => /[a-zäöüß]/i.test(t));
  return teile.length ? teile.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(" ") : "Der Support";
}

type ChatFuerDateien = {
  id: string;
  customerId: string;
  leadId: string | null;
  contactName: string | null;
  lead?: { source: string | null; name?: string | null } | null;
};

/** Kontext für dateiInfo: Policen-Ablage, Lead-Sparte, Namen. Lädt nur, wenn der Verlauf Dateien enthält. */
export async function dateiKontext(chat: ChatFuerDateien, messages: Array<{ id: string; sentByUserId?: string | null }>, now = new Date()): Promise<DateiKontext> {
  const supportChat = isSupportCustomer(chat.customerId);
  const ids = messages.map((m) => m.id);
  const userIds = [...new Set(messages.map((m) => m.sentByUserId).filter((x): x is string => !!x))];
  const [ablage, nutzer, lead, vermittler] = await Promise.all([
    chat.leadId
      ? prisma.leadDocument.findMany({ where: { leadId: chat.leadId, messageId: { in: ids } }, select: { messageId: true, mimeType: true, size: true } })
      : Promise.resolve([]),
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, email: true } }) : Promise.resolve([]),
    chat.lead === undefined && chat.leadId ? prisma.lead.findUnique({ where: { id: chat.leadId }, select: { source: true, name: true } }) : Promise.resolve(chat.lead ?? null),
    supportChat ? Promise.resolve(null) : vermittlerName(chat.customerId, chat.leadId),
  ]);
  return {
    leadChat: !!chat.leadId,
    leadSource: lead?.source ?? null,
    leadName: lead?.name ?? chat.contactName,
    ablage: new Map(ablage.filter((d) => d.messageId).map((d) => [d.messageId!, { mimeType: d.mimeType, size: d.size }])),
    supportChat,
    vermittlerName: vermittler,
    nutzerNamen: new Map(nutzer.map((u) => [u.id, nameAusLogin(u)])),
    now,
  };
}

/** Name des Vermittlers für Nachrichten aus der WhatsApp-App: zuständiger Berater, sonst Inhaber, sonst Firmenname. */
async function vermittlerName(customerId: string, leadId: string | null): Promise<string | null> {
  const lead = leadId ? await prisma.lead.findUnique({ where: { id: leadId }, select: { assignedUserId: true } }) : null;
  const berater = lead?.assignedUserId ? await prisma.user.findUnique({ where: { id: lead.assignedUserId }, select: { displayName: true } }) : null;
  if (berater?.displayName?.trim()) return berater.displayName.trim();
  const inhaber = await prisma.user.findFirst({ where: { customerId, role: "BUYER", teamRole: "owner", displayName: { not: null } }, orderBy: { createdAt: "asc" }, select: { displayName: true } });
  if (inhaber?.displayName?.trim()) return inhaber.displayName.trim();
  return (await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } }))?.name ?? null;
}

/** Dateien eines Verlaufs für die Admin-Ansicht (Nachrichten-ID → Anzeige). */
export async function dateienImVerlauf<M extends DateiNachricht & { sentByUserId?: string | null }>(chat: ChatFuerDateien, messages: M[], now = new Date()): Promise<Map<string, DateiInfo>> {
  const mitDatei = messages.filter((m) => istDateiNachricht(m.kind));
  if (!mitDatei.length) return new Map();
  const k = await dateiKontext(chat, mitDatei, now);
  const out = new Map<string, DateiInfo>();
  for (const m of mitDatei) {
    const d = dateiInfo(m, k);
    if (d) out.set(m.id, d);
  }
  return out;
}

// ─── Support-Zugriff ───────────────────────────────────────────────────

export type SupportZugriffErgebnis = { ok: true; url: string; zugriffId: string } | { ok: false; fehler: string };

type Mitteilen = (o: { customerId: string; userIds: string[]; mitteilung: string; leadVorname: string }) => Promise<void>;

/**
 * Support-Zugriff auslösen (nur Admins; der Aufrufer prüft die Rolle). Reihenfolge: Grund prüfen → Datei und Schutz
 * prüfen → Protokoll (unveränderbar) → Mitteilung → Link. Ohne Protokoll kein Link.
 */
export async function starteSupportZugriff(
  o: { admin: { userId: string; email: string }; messageId: string; grund: unknown; now?: Date },
  deps: { mitteilen?: Mitteilen } = {},
): Promise<SupportZugriffErgebnis> {
  const now = o.now ?? new Date();
  const g = pruefeGrund(o.grund);
  if (!g.ok) return { ok: false, fehler: g.fehler };
  const grund = ohneGedankenstriche(g.grund);
  const m = await prisma.message.findUnique({
    where: { id: String(o.messageId ?? "") },
    select: {
      id: true,
      direction: true,
      kind: true,
      body: true,
      sentBy: true,
      sentByUserId: true,
      createdAt: true,
      mediaId: true,
      mediaName: true,
      mediaMime: true,
      mediaSize: true,
      mediaLink: true,
      conversation: { select: { id: true, customerId: true, leadId: true, contactName: true, lead: { select: { source: true, name: true, assignedUserId: true } } } },
    },
  });
  if (!m) return { ok: false, fehler: "Datei nicht gefunden." };
  const chat = m.conversation;
  const k = await dateiKontext({ ...chat, lead: chat.lead ? { source: chat.lead.source, name: chat.lead.name } : null }, [m], now);
  const info = dateiInfo(m, k);
  if (!info) return { ok: false, fehler: "Diese Nachricht enthält keine Datei." };
  if (info.zugriff === "gesperrt") return { ok: false, fehler: "Gesperrt: Unterlagen mit Gesundheitsbezug bzw. aus der Policen-Ablage nur über Break-Glass." };
  if (info.zugriff === "support") return { ok: false, fehler: "Chats der Support-Nummer brauchen keinen Support-Zugriff." };
  if (info.zugriff !== "moeglich") return { ok: false, fehler: "Der Inhalt dieser Datei liegt nicht bei uns." };

  const admin = await prisma.user.findUnique({ where: { id: o.admin.userId }, select: { role: true, displayName: true, email: true } });
  if (!admin || admin.role !== "ADMIN") return { ok: false, fehler: "Nicht erlaubt." };
  const adminName = nameAusLogin(admin);
  const leadVorname = vorname(chat.lead?.name) ?? vorname(chat.contactName) ?? "Ihrem Kontakt";
  const dateiName = info.name ?? info.titel;
  const mitteilung = ohneGedankenstriche(supportZugriffText({ adminName, at: now, dateiName, leadVorname, grund }));

  const z = await prisma.supportZugriff.create({
    data: { customerId: chat.customerId, conversationId: chat.id, messageId: m.id, leadId: chat.leadId, adminUserId: o.admin.userId, adminName, grund, dateiName, mitteilung, createdAt: now },
    select: { id: true },
  });
  // Änderungsprotokoll ohne Dateinamen (der steht nur im Support-Protokoll)
  await audit("support.zugriff", { entity: "Message", entityId: m.id, customerId: chat.customerId, details: { zugriffId: z.id }, actor: { id: o.admin.userId, email: o.admin.email, role: "ADMIN" } });

  // Empfänger: Inhaber und zuständiger Berater
  const inhaber = await prisma.user.findMany({ where: { customerId: chat.customerId, role: "BUYER", teamRole: "owner" }, select: { id: true } });
  const userIds = [...new Set([...inhaber.map((u) => u.id), ...(chat.lead?.assignedUserId ? [chat.lead.assignedUserId] : [])])];
  await (deps.mitteilen ?? standardMitteilen)({ customerId: chat.customerId, userIds, mitteilung, leadVorname }).catch(() =>
    console.error("[support-zugriff] mitteilung fehlgeschlagen"),
  );

  return { ok: true, zugriffId: z.id, url: zugriffPfad(zugriffToken(z.id, o.admin.userId, now)) };
}

/** Push (neutral, ohne Dateinamen) und E-Mail mit dem genauen Wortlaut an Inhaber und zuständigen Berater. */
const standardMitteilen: Mitteilen = async ({ customerId, userIds, mitteilung, leadVorname }) => {
  const nutzer = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds }, customerId }, select: { id: true, email: true, displayName: true } })
    : [];
  const { sendToUser } = await import("@/lib/push");
  const { sendCustomerMail, getAppUrl } = await import("@/lib/email");
  let link: string | null = null;
  try {
    link = `${getAppUrl()}${SUPPORT_ZUGRIFFE_PFAD}`;
  } catch {
    link = null;
  }
  for (const u of nutzer) {
    await sendToUser(u.id, {
      title: "Support hat ein Dokument geöffnet",
      body: `Im Chat mit ${leadVorname}. Grund und Zeitpunkt stehen im Protokoll.`,
      url: SUPPORT_ZUGRIFFE_PFAD,
      tag: `support-zugriff:${customerId}`,
    }).catch(() => null);
    const hallo = vorname(u.displayName);
    await sendCustomerMail({
      to: u.email,
      subject: "Support-Zugriff auf ein Dokument",
      greeting: hallo ? `Hallo ${hallo},` : "Guten Tag,",
      paragraphs: [mitteilung, "Jeden Zugriff unseres Supports sehen Sie in der App unter Einstellungen → Support-Zugriffe."],
      ...(link ? { button: { label: "Protokoll ansehen", url: link } } : {}),
    }).catch(() => null);
  }
};

/** Inhalt für den Abruf über den signierten Link (Prüfung des Tokens macht die Route). null = nicht abrufbar. */
export async function ladeZugriffInhalt(zugriffId: string, now = new Date()): Promise<{ name: string; mime: string; data: Buffer } | null> {
  const z = await prisma.supportZugriff.findUnique({ where: { id: zugriffId }, select: { messageId: true, customerId: true, createdAt: true } });
  if (!z || now.getTime() - z.createdAt.getTime() > ZUGRIFF_MINUTEN * 60 * 1000) return null;
  const m = await prisma.message.findUnique({
    where: { id: z.messageId },
    select: { mediaId: true, mediaLink: true, mediaMime: true, mediaName: true, conversation: { select: { customerId: true } } },
  });
  if (!m || m.conversation.customerId !== z.customerId) return null;
  return ladeDateiInhalt(z.customerId, m, "support-zugriff");
}

/**
 * Inhalt einer Chat-Datei: eigene Adresse (Erstinformation) bzw. Medien-ID über das WhatsApp-Konto des Kunden.
 * Gemeinsam für den Support-Zugriff und den Abruf durch den Vermittler (lib/chat-dateien-vermittler.ts). null = nicht abrufbar.
 */
export async function ladeDateiInhalt(
  customerId: string,
  m: { mediaId: string | null; mediaLink: string | null; mediaMime: string | null; mediaName: string | null },
  log = "chat-datei",
): Promise<{ name: string; mime: string; data: Buffer } | null> {
  const name = m.mediaName ?? "Dokument";
  if (m.mediaLink) {
    const data = await ladeEigenenLink(m.mediaLink);
    return data ? { name, mime: m.mediaMime ?? "application/pdf", data } : null;
  }
  if (!m.mediaId) return null;
  const konto = await prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { apiKeyEnc: true } });
  if (!konto?.apiKeyEnc) return null;
  const { decryptSecret } = await import("@/lib/encryption");
  const { ladeMedia } = await import("@/lib/policen/media");
  const dl = await ladeMedia(decryptSecret(konto.apiKeyEnc), m.mediaId, ZUGRIFF_MAX_BYTES);
  if (!dl.ok) {
    // Ohne Detail (kann die Medien-Adresse enthalten, A7)
    console.error(`[${log}] laden`, dl.grund);
    return null;
  }
  return { name, mime: m.mediaMime ?? dl.mime ?? "application/octet-stream", data: dl.data };
}

/** Nur eigene Adressen (Erstinformation), kein Abruf fremder Server. */
async function ladeEigenenLink(link: string): Promise<Buffer | null> {
  try {
    const { getAppUrl } = await import("@/lib/email");
    const app = new URL(getAppUrl());
    const u = new URL(link);
    if (u.origin !== app.origin) return null;
    const res = await fetch(u, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const data = Buffer.from(await res.arrayBuffer());
    return data.length && data.length <= ZUGRIFF_MAX_BYTES ? data : null;
  } catch {
    return null;
  }
}

// ─── Protokoll für den Vermittler ──────────────────────────────────────

export type ZugriffEintrag = { id: string; createdAt: Date; mitteilung: string };

/** Protokoll eines Kunden, neueste zuerst. Berater sehen nur Zugriffe auf Chats ihrer Leads. */
export async function supportZugriffeFuer(ctx: { customerId: string; userId: string | null; teamRole: "owner" | "advisor" }, take = 100): Promise<ZugriffEintrag[]> {
  let leadFilter: { leadId: { in: string[] } } | null = null;
  if (ctx.teamRole === "advisor") {
    if (!ctx.userId) return [];
    const leads = await prisma.lead.findMany({ where: { customerId: ctx.customerId, assignedUserId: ctx.userId }, select: { id: true } });
    leadFilter = { leadId: { in: leads.map((l) => l.id) } };
  }
  return prisma.supportZugriff.findMany({
    where: { customerId: ctx.customerId, ...(leadFilter ?? {}) },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, createdAt: true, mitteilung: true },
  });
}
