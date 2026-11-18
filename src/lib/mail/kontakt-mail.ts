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
//
// Eingang (Paket M2, Ole 18.11.2026): Antworten an die Antwortadresse stehen als ContactMail mit richtung „eingang“
// und Status „empfangen“ im Verlauf (lib/mail/eingang.ts). Art „antwort“ zählt für die Stopp-Regeln (hatMailAntwort),
// automatische Antworten und Mails mit nicht bestätigtem Absender stehen nur als Hinweis da.

import { prisma } from "@/lib/prisma";

export const MAIL_ARTEN = {
  terminbestaetigung: "Terminbestätigung",
  terminverschiebung: "Terminverschiebung",
  terminabsage: "Terminabsage",
  terminerinnerung: "Terminerinnerung",
  terminaenderung: "Terminänderung",
  bestandskampagne: "Bestandskampagne",
  kein_whatsapp: "Kein WhatsApp",
  nummer_erfragen: "Richtige Nummer erfragen",
  maklervollmacht: "Maklervollmacht",
  bewertungsbitte: "Bewertungsbitte",
  einwilligung: "Einwilligung",
  angebot: "Angebot",
  angebot_nachfassen: "Angebot nachfassen",
  manuell: "E-Mail",
  // Vorlagen-Mails (Paket M0, lib/mail/vorlagen-mail.ts): Art = Schlüssel der Vorlage, automatisch oder von Hand
  nicht_erreicht: "Nicht erreicht",
  // „angebot“ steht oben (Paket P3, gleiche Bezeichnung)
  nachfassen_angebot: "Nachfassen Angebot",
  nach_abschluss: "Nach dem Abschluss",
  termin_vorbereitung: "Termin: Vorbereitung",
  nicht_erschienen: "Nicht erschienen",
  beratungsdoku: "Gesprächszusammenfassung",
  unterlagen_fehlen: "Unterlagen fehlen noch",
  willkommen: "Willkommen",
  kuendigung: "Kündigung alte Versicherung",
  wie_besprochen: "Wie besprochen",
  tuer_offen: "Kein Interesse: Tür offen",
  // Eingang an die Antwortadresse (Paket M2, lib/mail/eingang.ts)
  antwort: "Antwort per E-Mail",
  antwort_auto: "Automatische Antwort",
  antwort_ungeprueft: "E-Mail, Absender nicht bestätigt",
} as const;
export type MailArt = keyof typeof MAIL_ARTEN;

export const MAIL_STATUS = {
  versendet: "versendet",
  zugestellt: "zugestellt",
  nicht_zustellbar: "nicht zustellbar",
  abgemeldet: "abgemeldet",
  nicht_versendet: "nicht versendet",
  // Eingang (Paket M2)
  empfangen: "empfangen",
} as const;
export type MailStatus = keyof typeof MAIL_STATUS;
/** Zustellstatus ausgehender Mails, die ein Ereignis setzen kann. */
type ZustellStatus = Exclude<MailStatus, "nicht_versendet" | "versendet" | "empfangen">;

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
  /** Automatisch versendet; ohne Angabe: alles außer „manuell“ */
  automatisch?: boolean;
};

/** Versandweg im Verlauf: Postfach, unsere Versanddomain oder „im eigenen Mailprogramm gesendet“ (laut Vermittler). */
export type MailWeg = "resend" | "postfach" | "mailprogramm";

export type MailVersand = {
  to: string;
  subject: string;
  text: string;
  status: Extract<MailStatus, "versendet" | "nicht_zustellbar" | "nicht_versendet">;
  reason?: string | null;
  provider?: MailWeg | null;
  messageId?: string | null;
};

/** Bezeichnung im Verlauf: „Bestandskampagne: Herbst-Check“ (rein). */
export function mailArtLabel(art: string, label?: string | null): string {
  const base = (MAIL_ARTEN as Record<string, string>)[art] ?? "E-Mail";
  return label?.trim() ? `${base}: ${label.trim()}` : base;
}

/** Kurzzeile für den Lead-Verlauf (ohne Text; der steht in ContactMail). Eingang: „E-Mail erhalten von …“. */
export function mailVerlaufText(m: { art: string; label?: string | null; automatic: boolean; to: string; subject: string; status: string; provider?: string | null; richtung?: string | null }): string {
  if (m.richtung === "eingang") {
    const zusatz = m.art === "antwort" ? "" : ` (${mailArtLabel(m.art, m.label)})`;
    return `E-Mail erhalten${zusatz} von ${m.to}: ${m.subject}`;
  }
  const head = m.status === "nicht_versendet" ? "E-Mail nicht versendet" : "E-Mail";
  const vorlage = m.art !== "manuell" ? mailArtLabel(m.art, m.label) : "";
  const zusatz = [m.automatic ? "automatisch" : "", vorlage, m.provider === "mailprogramm" ? "im eigenen Mailprogramm gesendet" : ""].filter(Boolean).join(", ");
  return `${head}${zusatz ? ` (${zusatz})` : ""} an ${m.to}: ${m.subject}`;
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
    const automatic = p.automatisch ?? p.art !== "manuell";
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
          text: mailVerlaufText({ art: p.art, label: p.label, automatic, to: v.to, subject: v.subject, status: v.status, provider: v.provider }).slice(0, 4000),
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
const RANG: Record<Exclude<MailStatus, "nicht_versendet" | "empfangen">, number> = { versendet: 0, zugestellt: 1, nicht_zustellbar: 2, abgemeldet: 3 };

/** Neuer Status (rein): null = bleibt. „nicht versendet“ und „empfangen“ bleiben immer. */
export function naechsterStatus(current: string, next: ZustellStatus): MailStatus | null {
  if (!(current in RANG)) return null;
  return RANG[next] > RANG[current as keyof typeof RANG] ? next : null;
}

/** Zustellstatus zu einer Message-ID setzen (Resend-Webhook, Bounce, Abmeldung). Gibt die Zahl der Einträge zurück. */
export async function setzeMailStatus(
  providerMessageId: string,
  status: ZustellStatus,
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
  /** Versandweg; „mailprogramm“ = laut Vermittler im eigenen Mailprogramm gesendet */
  provider: string | null;
  /** ausgang (Standard) oder eingang (Antwort an die Antwortadresse; `to` ist dann der Absender) */
  richtung: "ausgang" | "eingang";
  /** Anhänge eines Eingangs; link null = aus Sicherheitsgründen nicht übernommen */
  anhaenge: { name: string; groesse: number; link: string | null }[];
};

type MailZeile = {
  id: string;
  kind: string;
  label: string | null;
  automatic: boolean;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  reason: string | null;
  createdAt: Date;
  provider?: string | null;
  richtung?: string | null;
  leadId?: string | null;
  eingang?: { id: string; anhaenge: unknown } | null;
};

/** Anhänge eines Eingangs für die Anzeige (rein): Download über die App, gesperrte ohne Link. */
export function eingangAnhaenge(leadId: string | null | undefined, eingang: { id: string; anhaenge: unknown } | null | undefined): KontaktMailEintrag["anhaenge"] {
  if (!eingang || !Array.isArray(eingang.anhaenge)) return [];
  return (eingang.anhaenge as { id?: unknown; name?: unknown; groesse?: unknown; erlaubt?: unknown }[])
    .filter((a) => a && typeof a.id === "string")
    .map((a) => ({
      name: typeof a.name === "string" && a.name.trim() ? a.name : "Anhang",
      groesse: typeof a.groesse === "number" ? a.groesse : 0,
      link: a.erlaubt === true && leadId ? `/api/buyer/leads/${leadId}/mail-anhang/${eingang.id}/${a.id as string}` : null,
    }));
}

const toEintrag = (m: MailZeile): KontaktMailEintrag => ({
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
  provider: m.provider ?? null,
  richtung: m.richtung === "eingang" ? "eingang" : "ausgang",
  anhaenge: eingangAnhaenge(m.leadId, m.eingang),
});

/** Mails zu Verlaufseinträgen (für loadLeadHistory). */
export async function mailsById(ids: string[]): Promise<Map<string, KontaktMailEintrag>> {
  if (!ids.length) return new Map();
  const rows = await prisma.contactMail.findMany({ where: { id: { in: ids } }, include: { eingang: { select: { id: true, anhaenge: true } } } });
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

/** Hat der Lead seit `seit` per E-Mail geantwortet (Antwortadresse, nur echte Antworten)? Stopp-Regeln (Regel 5). */
export async function hatMailAntwort(leadId: string, seit: Date): Promise<boolean> {
  const n = await prisma.contactMail.count({ where: { leadId, richtung: "eingang", kind: "antwort", createdAt: { gt: seit } } });
  return n > 0;
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
    where: { OR: or, automatic: true, richtung: "ausgang", status: { not: "nicht_versendet" }, createdAt: { gte: new Date(now.getTime() - (opts.days ?? 14) * 86_400_000), lte: now } },
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
