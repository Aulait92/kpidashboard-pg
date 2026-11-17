// Ausgehende E-Mails im Kontaktverlauf (Ole, 15.11.2026): Jede E-Mail an einen Lead oder Bestandskunden steht im
// Verlauf des Kontakts (Lead-Verlauf bzw. Verlauf im Bestand), damit der Vermittler vor dem Anruf sieht, was der
// Kunde schon bekommen hat, und der WhatsApp-Assistent nichts doppelt schickt.
//
// Protokolliert wird im Versandweg selbst: sendViaPostfach (Postfach des Vermittlers) und sendeKontaktMailResend
// (neutraler Absender) nehmen ein MailProtokoll entgegen. Neue automatische Mails an Kontakte laufen über einen der
// beiden Wege und stehen damit von selbst im Verlauf.
//
// Status: versendet → zugestellt (Resend-Webhook) bzw. nicht zustellbar (Bounce) oder abgemeldet (Abmeldelink,
// „Stopp“). Fehlgeschlagene Versuche stehen als „nicht versendet“ mit Grund im Verlauf.
// Protokollieren darf nie den Versand scheitern lassen.

import { prisma } from "@/lib/prisma";

export const MAIL_ARTEN = {
  terminbestaetigung: "Terminbestätigung",
  terminverschiebung: "Terminverschiebung",
  terminabsage: "Terminabsage",
  terminerinnerung: "Terminerinnerung",
  terminaenderung: "Terminänderung",
  bestandskampagne: "Bestandskampagne",
  kein_whatsapp: "Kein WhatsApp",
  bewertungsbitte: "Bewertungsbitte",
  einwilligung: "Einwilligung",
  angebot: "Angebot",
  angebot_nachfassen: "Angebot nachfassen",
  manuell: "E-Mail",
} as const;
export type MailArt = keyof typeof MAIL_ARTEN;

export const MAIL_STATUS = {
  versendet: "versendet",
  zugestellt: "zugestellt",
  nicht_zustellbar: "nicht zustellbar",
  abgemeldet: "abgemeldet",
  nicht_versendet: "nicht versendet",
} as const;
export type MailStatus = keyof typeof MAIL_STATUS;

/** Wem die Mail im Verlauf zugeordnet wird und was für eine Mail es ist. */
export type MailProtokoll = {
  customerId: string;
  leadId?: string | null;
  existingCustomerId?: string | null;
  art: MailArt;
  /** Zusatz, z. B. Name der Kampagne */
  label?: string | null;
  /** Login, der die Mail selbst geschrieben hat (manuell); bei automatischen Mails null */
  userId?: string | null;
};

export type MailVersand = {
  to: string;
  subject: string;
  text: string;
  status: Extract<MailStatus, "versendet" | "nicht_zustellbar" | "nicht_versendet">;
  reason?: string | null;
  provider?: "resend" | "postfach" | null;
  messageId?: string | null;
};

/** Bezeichnung im Verlauf: „Bestandskampagne: Herbst-Check“ (rein). */
export function mailArtLabel(art: string, label?: string | null): string {
  const base = (MAIL_ARTEN as Record<string, string>)[art] ?? "E-Mail";
  return label?.trim() ? `${base}: ${label.trim()}` : base;
}

/** Kurzzeile für den Lead-Verlauf (ohne Text; der steht in ContactMail). */
export function mailVerlaufText(m: { art: string; label?: string | null; automatic: boolean; to: string; subject: string; status: string }): string {
  const head = m.status === "nicht_versendet" ? "E-Mail nicht versendet" : "E-Mail";
  const art = m.automatic ? ` (automatisch, ${mailArtLabel(m.art, m.label)})` : "";
  return `${head}${art} an ${m.to}: ${m.subject}`;
}

/**
 * Versand protokollieren. Mit Lead: Eintrag im Lead-Verlauf (kind „email“, verweist auf die Mail). Ein
 * Bestandskunde mit verknüpftem Lead landet auch im Lead-Verlauf. Gibt die ID der Mail zurück (oder null).
 * Ein wiederholter Fehlversuch derselben Mail (24 h) aktualisiert den vorhandenen Eintrag statt einen neuen anzulegen.
 */
export async function protokolliereMail(p: MailProtokoll, v: MailVersand, now = new Date()): Promise<string | null> {
  try {
    let leadId = p.leadId ?? null;
    if (!leadId && p.existingCustomerId) {
      leadId = (await prisma.existingCustomer.findUnique({ where: { id: p.existingCustomerId }, select: { leadId: true } }))?.leadId ?? null;
    }
    if (!leadId && !p.existingCustomerId) return null;
    const automatic = p.art !== "manuell";
    const reason = v.reason?.trim().slice(0, 300) || null;
    if (v.status === "nicht_versendet") {
      const prev = await prisma.contactMail.findFirst({
        where: {
          ...(leadId ? { leadId } : { existingCustomerId: p.existingCustomerId }),
          kind: p.art,
          subject: v.subject,
          status: "nicht_versendet",
          createdAt: { gte: new Date(now.getTime() - 86_400_000) },
        },
        select: { id: true },
      });
      if (prev) {
        await prisma.contactMail.update({ where: { id: prev.id }, data: { reason, statusAt: now } });
        return prev.id;
      }
    }
    const mail = await prisma.contactMail.create({
      data: {
        customerId: p.customerId,
        leadId,
        existingCustomerId: p.existingCustomerId ?? null,
        kind: p.art,
        label: p.label?.trim() || null,
        automatic,
        recipient: v.to.trim().slice(0, 320),
        subject: v.subject.slice(0, 500),
        body: v.text.slice(0, 20_000),
        status: v.status,
        reason,
        statusAt: now,
        provider: v.provider ?? null,
        providerMessageId: v.messageId ?? null,
        userId: p.userId ?? null,
        createdAt: now,
      },
      select: { id: true },
    });
    if (leadId) {
      await prisma.leadHistory.create({
        data: {
          leadId,
          customerId: p.customerId,
          kind: "email",
          text: mailVerlaufText({ art: p.art, label: p.label, automatic, to: v.to, subject: v.subject, status: v.status }).slice(0, 4000),
          userId: p.userId ?? null,
          mailId: mail.id,
          createdAt: now,
        },
      });
    }
    return mail.id;
  } catch (err) {
    console.error("[kontakt-mail]", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Rangfolge: ein späteres Ereignis überschreibt nur einen schwächeren Status (Webhooks kommen ungeordnet). */
const RANG: Record<Exclude<MailStatus, "nicht_versendet">, number> = { versendet: 0, zugestellt: 1, nicht_zustellbar: 2, abgemeldet: 3 };

/** Neuer Status (rein): null = bleibt. „nicht versendet“ bleibt immer. */
export function naechsterStatus(current: string, next: Exclude<MailStatus, "nicht_versendet" | "versendet">): MailStatus | null {
  if (!(current in RANG)) return null;
  return RANG[next] > RANG[current as keyof typeof RANG] ? next : null;
}

/** Zustellstatus zu einer Message-ID setzen (Resend-Webhook, Bounce, Abmeldung). Gibt die Zahl der Einträge zurück. */
export async function setzeMailStatus(
  providerMessageId: string,
  status: Exclude<MailStatus, "nicht_versendet" | "versendet">,
  opts: { reason?: string | null; now?: Date } = {},
): Promise<number> {
  if (!providerMessageId) return 0;
  const weaker = (Object.keys(RANG) as (keyof typeof RANG)[]).filter((s) => RANG[s] < RANG[status]);
  const r = await prisma.contactMail.updateMany({
    where: { providerMessageId, status: { in: weaker } },
    data: { status, statusAt: opts.now ?? new Date(), ...(opts.reason ? { reason: opts.reason.slice(0, 300) } : {}) },
  });
  return r.count;
}

type ResendArgs = Parameters<ReturnType<typeof import("@/lib/mail-guard").mailClient>["emails"]["send"]>[0];

/**
 * Mail an einen Kontakt über Resend (neutraler Absender) senden und protokollieren. Wirft nicht.
 * Ergebnis: gesendet mit Message-ID oder Fehlergrund.
 */
export async function sendeKontaktMailResend(
  apiKey: string,
  args: ResendArgs,
  protokoll: MailProtokoll,
): Promise<{ ok: true; id: string | null } | { ok: false; error: string; blocked?: boolean }> {
  const { mailClient, wasBlocked } = await import("@/lib/mail-guard");
  const to = [args.to].flat().join(", ");
  const text = typeof args.text === "string" ? args.text : "";
  let res: { ok: true; id: string | null } | { ok: false; error: string; blocked?: boolean };
  try {
    const sent = await mailClient(apiKey).emails.send(args);
    if (wasBlocked(sent)) res = { ok: false, error: "Testumgebung: Adresse nicht freigegeben", blocked: true };
    else if (sent.error) res = { ok: false, error: sent.error.message ?? "send_failed" };
    else res = { ok: true, id: sent.data?.id ?? null };
  } catch (err) {
    res = { ok: false, error: err instanceof Error ? err.message : "send_failed" };
  }
  await protokolliereMail(protokoll, {
    to,
    subject: args.subject ?? "",
    text,
    provider: "resend",
    ...(res.ok ? { status: "versendet", messageId: res.id } : { status: "nicht_versendet", reason: res.error }),
  });
  return res;
}

export type KontaktMailEintrag = {
  id: string;
  art: string;
  artLabel: string;
  automatic: boolean;
  to: string;
  subject: string;
  body: string;
  status: MailStatus;
  statusLabel: string;
  reason: string | null;
  at: string;
};

const toEintrag = (m: { id: string; kind: string; label: string | null; automatic: boolean; recipient: string; subject: string; body: string; status: string; reason: string | null; createdAt: Date }): KontaktMailEintrag => ({
  id: m.id,
  art: m.kind,
  artLabel: mailArtLabel(m.kind, m.label),
  automatic: m.automatic,
  to: m.recipient,
  subject: m.subject,
  body: m.body,
  status: (m.status in MAIL_STATUS ? m.status : "versendet") as MailStatus,
  statusLabel: (MAIL_STATUS as Record<string, string>)[m.status] ?? m.status,
  reason: m.reason,
  at: m.createdAt.toISOString(),
});

/** Mails zu Verlaufseinträgen (für loadLeadHistory). */
export async function mailsById(ids: string[]): Promise<Map<string, KontaktMailEintrag>> {
  if (!ids.length) return new Map();
  const rows = await prisma.contactMail.findMany({ where: { id: { in: ids } } });
  return new Map(rows.map((r) => [r.id, toEintrag(r)]));
}

/** Verlauf eines Bestandskunden (E-Mails, neueste zuerst). */
export async function bestandMailVerlauf(customerId: string, existingCustomerId: string, take = 50): Promise<KontaktMailEintrag[]> {
  const rows = await prisma.contactMail.findMany({ where: { customerId, existingCustomerId }, orderBy: { createdAt: "desc" }, take });
  return rows.map(toEintrag);
}

/** Bestandskunden (aus der Liste) mit mindestens einer E-Mail im Verlauf. */
export async function bestandMitMails(customerId: string, existingCustomerIds: string[]): Promise<Set<string>> {
  if (!existingCustomerIds.length) return new Set();
  const rows = await prisma.contactMail.groupBy({ by: ["existingCustomerId"], where: { customerId, existingCustomerId: { in: existingCustomerIds } } });
  return new Set(rows.map((r) => r.existingCustomerId).filter((x): x is string => !!x));
}

/**
 * Letzte automatische Mails an den Kontakt (für den WhatsApp-Assistenten): Art, Datum, Betreff.
 * Standard: höchstens 3 aus den letzten 14 Tagen, nur tatsächlich versendete.
 */
export async function letzteAutomatischeMails(
  q: { leadId?: string | null; existingCustomerId?: string | null },
  opts: { now?: Date; days?: number; take?: number } = {},
): Promise<{ art: string; at: Date; subject: string }[]> {
  const or = [...(q.leadId ? [{ leadId: q.leadId }] : []), ...(q.existingCustomerId ? [{ existingCustomerId: q.existingCustomerId }] : [])];
  if (!or.length) return [];
  const now = opts.now ?? new Date();
  const rows = await prisma.contactMail.findMany({
    where: { OR: or, automatic: true, status: { not: "nicht_versendet" }, createdAt: { gte: new Date(now.getTime() - (opts.days ?? 14) * 86_400_000), lte: now } },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 3,
    select: { kind: true, label: true, subject: true, createdAt: true },
  });
  return rows.map((r) => ({ art: mailArtLabel(r.kind, r.label), at: r.createdAt, subject: r.subject }));
}

/**
 * Ereignis aus dem Resend-Webhook (app/api/resend/webhook): zugestellt, unzustellbar, als Spam gemeldet. Gibt
 * zurück, wie viele Einträge sich geändert haben. Andere Ereignisse werden ignoriert.
 */
export async function verarbeiteResendEreignis(event: { type?: string; created_at?: string; data?: { email_id?: string; bounce?: { message?: string } } }): Promise<number> {
  const id = event.data?.email_id;
  if (!id) return 0;
  const at = event.created_at ? new Date(event.created_at) : new Date();
  const now = Number.isNaN(at.getTime()) ? new Date() : at;
  switch (event.type) {
    case "email.delivered":
      return setzeMailStatus(id, "zugestellt", { now });
    case "email.bounced":
      return setzeMailStatus(id, "nicht_zustellbar", { now, reason: event.data?.bounce?.message ?? null });
    case "email.complained":
      // Als Spam gemeldet: wie eine Abmeldung behandeln
      return setzeMailStatus(id, "abgemeldet", { now, reason: "Als Spam gemeldet" });
    default:
      return 0;
  }
}
