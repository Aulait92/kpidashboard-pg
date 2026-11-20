// Einwilligungen, Abmeldungen und Sperrliste der Bestandskunden (Datenbank). Regeln: lib/bestand/einwilligung.ts.
// Abmeldung wirkt sofort und dauerhaft (UWG, DSGVO Art. 21): Felder am Kunden, Eintrag in der Sperrliste
// (Hash von E-Mail und Telefon, greift auch nach erneutem Import) und Protokoll.

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { optOutHash, doiToken, doiConfirmUrl, hashToken, consentUrl, existingAbmeldeUrl } from "@/lib/bestand/links";
import { campaignMailFooter, imprintFromWebsiteInfo } from "@/lib/bestand/kampagnen-mail";
import { consentAskEligible, consentQuestion, consentRequestByMailAllowed, offerReach, type Channel, type ConsentSettings, type ConsentSubject, type ConsentValue } from "@/lib/bestand/einwilligung";
import { a, anredeZeile, asAnsprache, type Ansprache } from "@/lib/ansprache";
import { kontaktFromExisting, advisorPerson, firmDisplayName } from "@/lib/lead-anrede";

export type Suppression = { email: Map<string, "email" | "all">; phone: Map<string, "email" | "all"> };

/** Einstellungen des Vermittlers für Bestandskampagnen. */
export async function loadConsentSettings(customerId: string) {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      name: true,
      bestandUwgConfirmedAt: true,
      bestandAgentConfirmedAt: true,
      bestandMailImprint: true,
      bestandLegacyConsentReviewedAt: true,
      bestandAddress: true,
      onboarding: { select: { websiteInfo: true } },
    },
  });
  return {
    uwgConfirmed: !!c?.bestandUwgConfirmedAt,
    uwgConfirmedAt: c?.bestandUwgConfirmedAt ?? null,
    agentConfirmedAt: c?.bestandAgentConfirmedAt ?? null,
    imprint: c?.bestandMailImprint ?? null,
    websiteInfo: c?.onboarding?.websiteInfo ?? null,
    legacyReviewedAt: c?.bestandLegacyConsentReviewedAt ?? null,
    name: c?.name ?? "",
    /** Ansprache der Bestandskunden (Du/Sie), entscheidet der Vermittler */
    ansprache: asAnsprache(c?.bestandAddress),
  };
}

/** Ansprache der Bestandskunden dieses Vermittlers (Standard „sie“; getrennt von der Lead-Ansprache). */
export async function loadBestandAnsprache(customerId: string): Promise<Ansprache> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { bestandAddress: true } });
  return asAnsprache(c?.bestandAddress);
}

export async function loadSuppression(customerId: string): Promise<Suppression> {
  const rows = await prisma.bestandOptOut.findMany({ where: { customerId }, select: { kind: true, hash: true, scope: true } });
  const out: Suppression = { email: new Map(), phone: new Map() };
  for (const r of rows) {
    const scope = r.scope === "all" ? "all" : "email";
    const map = r.kind === "phone" ? out.phone : out.email;
    if (map.get(r.hash) !== "all") map.set(r.hash, scope);
  }
  return out;
}

export type SubjectFields = {
  phone: string | null;
  email: string | null;
  optOutAt: Date | null;
  emailOptOutAt: Date | null;
  emailConsent: string | null;
  whatsappConsent: string | null;
  widerspruchHinweis?: string | null;
  waUnavailableAt?: Date | null;
  blockedAt?: Date | null;
};
export const SUBJECT_SELECT = { phone: true, email: true, optOutAt: true, emailOptOutAt: true, emailConsent: true, whatsappConsent: true, widerspruchHinweis: true, waUnavailableAt: true, blockedAt: true } as const;

/** Angaben für die Entscheidung inklusive Sperrliste. */
export function subjectOf(ec: SubjectFields, sup: Suppression): ConsentSubject {
  const e = ec.email ? sup.email.get(optOutHash("email", ec.email)) : undefined;
  const p = ec.phone ? sup.phone.get(optOutHash("phone", ec.phone)) : undefined;
  return { ...ec, suppressed: { email: !!e, all: e === "all" || p === "all" } };
}

type LogInput = {
  customerId: string;
  existingCustomerId: string | null;
  channel: Channel;
  action: "angefragt" | "erteilt" | "bestaetigt" | "widerrufen" | "abgemeldet" | "gesetzt";
  source: string;
  text?: string | null;
  address?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  actorUserId?: string | null;
  tokenHash?: string | null;
  confirmedAt?: Date | null;
  /** Policen per WhatsApp (lib/policen): Lead, Version des Wortlauts, WhatsApp-ID der Antwort */
  leadId?: string | null;
  version?: string | null;
  waMessageId?: string | null;
  at?: Date;
};

export function logConsent(l: LogInput) {
  return prisma.bestandConsentLog.create({
    data: {
      customerId: l.customerId,
      existingCustomerId: l.existingCustomerId,
      channel: l.channel,
      action: l.action,
      source: l.source,
      text: l.text ?? null,
      address: l.address ?? null,
      ip: l.ip?.slice(0, 64) ?? null,
      userAgent: l.userAgent?.slice(0, 300) ?? null,
      actorUserId: l.actorUserId ?? null,
      tokenHash: l.tokenHash ?? null,
      confirmedAt: l.confirmedAt ?? null,
      leadId: l.leadId ?? null,
      version: l.version ?? null,
      waMessageId: l.waMessageId ?? null,
      ...(l.at ? { createdAt: l.at } : {}),
    },
  });
}

/**
 * Abmelden: nur E-Mail (Abmeldelink) oder alle Kanäle („Stopp“, Abmeldelink mit „auch WhatsApp“).
 * Wirkt sofort, landet in der Sperrliste und im Protokoll; recipientId = Abmeldung infolge dieser Kampagne.
 */
export async function optOutExisting(
  existingCustomerId: string,
  opts: { scope: "email" | "all"; source: string; recipientId?: string | null; ip?: string | null; userAgent?: string | null; now?: Date },
): Promise<boolean> {
  const now = opts.now ?? new Date();
  const ec = await prisma.existingCustomer.findUnique({ where: { id: existingCustomerId }, select: { id: true, customerId: true, email: true, phone: true, optOutAt: true, emailOptOutAt: true } });
  if (!ec) return false;
  // Schon abgemeldet (z. B. Abmeldeseite erneut aufgerufen): nichts doppelt protokollieren
  if (ec.emailOptOutAt && (opts.scope === "email" || ec.optOutAt)) return true;
  const entries: { kind: "email" | "phone"; hash: string }[] = [
    ...(ec.email ? [{ kind: "email" as const, hash: optOutHash("email", ec.email) }] : []),
    ...(opts.scope === "all" && ec.phone ? [{ kind: "phone" as const, hash: optOutHash("phone", ec.phone) }] : []),
  ];
  await prisma.$transaction([
    prisma.existingCustomer.update({
      where: { id: ec.id },
      data: { emailOptOutAt: ec.emailOptOutAt ?? now, ...(opts.scope === "all" ? { optOutAt: ec.optOutAt ?? now } : {}) },
    }),
    ...entries.map((e) =>
      prisma.bestandOptOut.upsert({
        where: { customerId_kind_hash: { customerId: ec.customerId, kind: e.kind, hash: e.hash } },
        create: { customerId: ec.customerId, kind: e.kind, hash: e.hash, scope: opts.scope },
        update: opts.scope === "all" ? { scope: "all" } : {},
      }),
    ),
    ...(opts.recipientId ? [prisma.campaignRecipient.updateMany({ where: { id: opts.recipientId, optOutAt: null }, data: { optOutAt: now } })] : []),
    // Noch nicht verschickte Kampagnen-Nachrichten sofort stoppen
    prisma.campaignRecipient.updateMany({
      where: { existingCustomerId: ec.id, status: "queued", ...(opts.scope === "all" ? {} : { channel: "email" }) },
      data: { status: "skipped", reason: "abgemeldet" },
    }),
  ]);
  // Kampagnen-Mail, über die abgemeldet wurde: Status „abgemeldet“ im Kontaktverlauf (lib/mail/kontakt-mail.ts)
  if (opts.recipientId) {
    const rec = await prisma.campaignRecipient.findUnique({ where: { id: opts.recipientId }, select: { mailMessageId: true } }).catch(() => null);
    if (rec?.mailMessageId) {
      const { setzeMailStatus } = await import("@/lib/mail/kontakt-mail");
      await setzeMailStatus(rec.mailMessageId, "abgemeldet", { now }).catch(() => 0);
    }
  }
  const channels: Channel[] = opts.scope === "all" ? ["email", "whatsapp"] : ["email"];
  for (const channel of channels) {
    await logConsent({
      customerId: ec.customerId,
      existingCustomerId: ec.id,
      channel,
      action: "abgemeldet",
      source: opts.source,
      address: channel === "email" ? ec.email : ec.phone,
      ip: opts.ip,
      userAgent: opts.userAgent,
      at: now,
    }).catch((err) => reportError(err, "bestand-optout-log"));
  }
  return true;
}

/** Nach dem Import: Abmeldungen der Sperrliste auf (neu angelegte) Kunden mit gleicher Adresse übertragen. */
export async function applySuppression(customerId: string, ids: string[], now = new Date()): Promise<number> {
  if (!ids.length) return 0;
  const sup = await loadSuppression(customerId);
  if (!sup.email.size && !sup.phone.size) return 0;
  const rows = await prisma.existingCustomer.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, phone: true, optOutAt: true, emailOptOutAt: true } });
  let n = 0;
  for (const r of rows) {
    const s = subjectOf({ ...r, emailConsent: null, whatsappConsent: null }, sup);
    const data: { optOutAt?: Date; emailOptOutAt?: Date } = {};
    if (s.suppressed?.all && !r.optOutAt) data.optOutAt = now;
    if ((s.suppressed?.email || s.suppressed?.all) && !r.emailOptOutAt) data.emailOptOutAt = now;
    if (Object.keys(data).length) {
      await prisma.existingCustomer.update({ where: { id: r.id }, data });
      n++;
    }
  }
  return n;
}

/** Einwilligung je Kanal setzen (Vermittler, Formular, Import), mit Protokoll. */
export async function setConsent(
  existingCustomerId: string,
  channel: Channel,
  value: ConsentValue,
  opts: { source: string; at?: Date | null; actorUserId?: string | null; text?: string | null; ip?: string | null; userAgent?: string | null; customerId?: string },
): Promise<void> {
  const ec = await prisma.existingCustomer.findUnique({ where: { id: existingCustomerId }, select: { id: true, customerId: true, email: true, phone: true } });
  if (!ec || (opts.customerId && ec.customerId !== opts.customerId)) throw new Error("Kunde nicht gefunden.");
  const at = value ? (opts.at ?? new Date()) : null;
  const data =
    channel === "email"
      ? { emailConsent: value, emailConsentAt: at, emailConsentSource: value ? opts.source : null }
      : { whatsappConsent: value, whatsappConsentAt: at, whatsappConsentSource: value ? opts.source : null };
  await prisma.existingCustomer.update({ where: { id: ec.id }, data });
  await logConsent({
    customerId: ec.customerId,
    existingCustomerId: ec.id,
    channel,
    action: value === "ja" ? "erteilt" : value === "nein" ? "widerrufen" : "gesetzt",
    source: opts.source,
    text: opts.text ?? (value ? null : "auf unbekannt gesetzt"),
    address: channel === "email" ? ec.email : ec.phone,
    ip: opts.ip,
    userAgent: opts.userAgent,
    actorUserId: opts.actorUserId,
  });
}

/** Nachweis zum Widerspruchshinweis je Kunde setzen (Vermittler), mit Protokoll. */
export async function setHinweis(
  existingCustomerId: string,
  value: ConsentValue,
  opts: { at?: Date | null; text?: string | null; actorUserId?: string | null; customerId?: string },
): Promise<void> {
  const ec = await prisma.existingCustomer.findUnique({ where: { id: existingCustomerId }, select: { id: true, customerId: true, email: true } });
  if (!ec || (opts.customerId && ec.customerId !== opts.customerId)) throw new Error("Kunde nicht gefunden.");
  await prisma.existingCustomer.update({
    where: { id: ec.id },
    data: value
      ? { widerspruchHinweis: value, widerspruchHinweisAt: opts.at ?? new Date(), widerspruchHinweisSource: "vermittler", widerspruchHinweisText: opts.text ?? null }
      : { widerspruchHinweis: null, widerspruchHinweisAt: null, widerspruchHinweisSource: null, widerspruchHinweisText: null },
  });
  await logConsent({
    customerId: ec.customerId,
    existingCustomerId: ec.id,
    channel: "email",
    action: "gesetzt",
    source: "widerspruchshinweis",
    text: value === "ja" ? `Hinweis auf das Widerspruchsrecht bei Erhebung der Adresse: ja. Wortlaut bzw. Quelle: „${opts.text ?? ""}“` : value === "nein" ? "Hinweis auf das Widerspruchsrecht bei Erhebung der Adresse: nein" : "Nachweis zum Widerspruchshinweis auf unbekannt gesetzt",
    address: ec.email,
    actorUserId: opts.actorUserId,
  });
}

// ─── Einwilligungs-Abfrage (öffentliche Seite, Double-Opt-in bei E-Mail) ──────────

export async function loadConsentPage(existingCustomerId: string) {
  const ec = await prisma.existingCustomer.findUnique({
    where: { id: existingCustomerId },
    select: {
      id: true,
      customerId: true,
      firstName: true,
      lastName: true,
      salutation: true,
      email: true,
      phone: true,
      optOutAt: true,
      emailConsent: true,
      whatsappConsent: true,
      customer: { select: { name: true, existingCustomersEnabled: true, bestandAddress: true, onboarding: { select: { websiteInfo: true } } } },
    },
  });
  if (!ec || !ec.customer.existingCustomersEnabled) return null;
  const privacy = (ec.customer.onboarding?.websiteInfo as { privacyUrl?: string | null } | null)?.privacyUrl;
  const ansprache = asAnsprache(ec.customer.bestandAddress);
  return {
    ...ec,
    ansprache,
    advisor: advisorPerson(ec.customer.name, null),
    firm: firmDisplayName(ec.customer.name),
    anrede: anredeZeile(ansprache, kontaktFromExisting(ec)),
    privacyUrl: privacy && /^https?:\/\//.test(privacy) ? privacy : (process.env.BOOKING_PRIVACY_URL ?? "https://performancegrowth.de/datenschutz"),
  };
}

export type ConsentSubmit = { email: boolean; whatsapp: boolean; emailAddress: string | null; phone: string | null; ip: string | null; userAgent: string | null };

/**
 * Formular abgeschickt: WhatsApp sofort (mit Protokoll), E-Mail erst nach Klick auf den Bestätigungslink
 * (Double-Opt-in). Gibt zurück, ob eine Bestätigungsmail rausging.
 */
export async function submitConsentForm(existingCustomerId: string, input: ConsentSubmit, now = new Date()): Promise<{ ok: true; doiSent: boolean; whatsapp: boolean } | { ok: false; error: string }> {
  const page = await loadConsentPage(existingCustomerId);
  if (!page) return { ok: false, error: "unavailable" };
  if (!input.email && !input.whatsapp) return { ok: false, error: "none" };
  if (page.optOutAt && !input.whatsapp && !input.email) return { ok: false, error: "none" };
  let doiSent = false;
  if (input.whatsapp) {
    const phone = input.phone ?? page.phone;
    if (!phone) return { ok: false, error: "phone" };
    const text = consentQuestion(page.advisor, ["whatsapp"]);
    if (phone !== page.phone) await prisma.existingCustomer.update({ where: { id: page.id }, data: { phone } });
    // Neue ausdrückliche Einwilligung hebt eine frühere Sperre für WhatsApp auf (Kunde hat es selbst gewählt)
    await prisma.existingCustomer.update({ where: { id: page.id }, data: { whatsappConsent: "ja", whatsappConsentAt: now, whatsappConsentSource: "formular", optOutAt: null } });
    await prisma.bestandOptOut.deleteMany({ where: { customerId: page.customerId, kind: "phone", hash: optOutHash("phone", phone) } });
    await logConsent({ customerId: page.customerId, existingCustomerId: page.id, channel: "whatsapp", action: "erteilt", source: "formular", text, address: phone, ip: input.ip, userAgent: input.userAgent, at: now });
  }
  if (input.email) {
    const address = (input.emailAddress ?? page.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { ok: false, error: "email" };
    const { token, hash } = doiToken();
    const text = consentQuestion(page.advisor, ["email"]);
    await logConsent({ customerId: page.customerId, existingCustomerId: page.id, channel: "email", action: "erteilt", source: "formular", text, address, ip: input.ip, userAgent: input.userAgent, tokenHash: hash, at: now });
    const an = page.ansprache;
    const r = await sendTransactionalMail(page.customerId, {
      to: address,
      subject: `Bitte bestätigen: E-Mails von ${page.advisor}`,
      text: (signatur) =>
        [
          page.anrede,
          "",
          a(
            an,
            `bitte bestätige mit einem Klick, dass ${page.advisor} dich per E-Mail über passende Angebote und Neuigkeiten zu deinen Verträgen informieren darf:`,
            `bitte bestätigen Sie mit einem Klick, dass ${page.advisor} Sie per E-Mail über passende Angebote und Neuigkeiten zu Ihren Verträgen informieren darf:`,
          ),
          doiConfirmUrl(token),
          "",
          a(an, "Wenn du das nicht angefragt hast, ignoriere diese E-Mail einfach. Dann passiert nichts.", "Wenn Sie das nicht angefragt haben, ignorieren Sie diese E-Mail einfach. Dann passiert nichts."),
          "",
          signatur,
        ].join("\n"),
    }, page.id, "Bestätigungslink");
    doiSent = r.ok;
  }
  return { ok: true, doiSent, whatsapp: input.whatsapp };
}

/** Bestätigungslink (Double-Opt-in) geklickt: E-Mail-Einwilligung gilt ab jetzt. */
export async function confirmDoi(
  token: string,
  meta: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<{ ok: true; advisor: string; customerId: string; ansprache: Ansprache } | { ok: false }> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { ok: false };
  const log = await prisma.bestandConsentLog.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!log || !log.existingCustomerId || log.channel !== "email") return { ok: false };
  // Link 30 Tage gültig
  if (now.getTime() - log.createdAt.getTime() > 30 * 86_400_000) return { ok: false };
  const ec = await prisma.existingCustomer.findUnique({ where: { id: log.existingCustomerId }, select: { id: true, customerId: true, email: true, customer: { select: { name: true, bestandAddress: true } } } });
  if (!ec) return { ok: false };
  if (!log.confirmedAt) {
    await prisma.bestandConsentLog.update({ where: { id: log.id }, data: { confirmedAt: now } });
    await prisma.existingCustomer.update({
      where: { id: ec.id },
      data: { email: log.address ?? ec.email, emailConsent: "ja", emailConsentAt: now, emailConsentSource: "formular", emailOptOutAt: null },
    });
    if (log.address) await prisma.bestandOptOut.deleteMany({ where: { customerId: ec.customerId, kind: "email", hash: optOutHash("email", log.address) } });
    await logConsent({ customerId: ec.customerId, existingCustomerId: ec.id, channel: "email", action: "bestaetigt", source: "formular", text: log.text, address: log.address, ip: meta.ip, userAgent: meta.userAgent, at: now });
  }
  return { ok: true, advisor: advisorPerson(ec.customer.name, null), customerId: ec.customerId, ansprache: asAnsprache(ec.customer.bestandAddress) };
}

/**
 * Bestätigungs- und Einwilligungsmails über den Lead-Mail-Baustein (lib/mail/lead-versand.ts): verbundenes Postfach
 * eines Inhabers (Absender klar erkennbar), sonst unsere Versanddomain mit „Name | Agentur“, Antwort an den
 * Vermittler und Signatur aus den Anbieterangaben. `text` bekommt die Signatur des jeweiligen Wegs.
 */
async function sendTransactionalMail(
  customerId: string,
  m: { to: string; subject: string; text: (signatur: string) => string },
  existingCustomerId: string,
  label: string,
): Promise<{ ok: boolean }> {
  const { leadVersandKontext, sendeLeadMail } = await import("@/lib/mail/lead-versand");
  const k = await leadVersandKontext(customerId);
  // Steht im Verlauf des Bestandskunden (automatisch, Art „Einwilligung“, lib/mail/kontakt-mail.ts)
  const r = await sendeLeadMail(k, {
    to: m.to,
    inhalt: (sig) => ({ subject: m.subject, text: m.text(sig.text) }),
    protokoll: { customerId, existingCustomerId, art: "einwilligung", label },
  });
  return { ok: r.sent };
}

/**
 * Bitte um Einwilligung (Text vor dem persönlichen Link), je Ansprache. Paket 3 (20.11.2026): kürzer, Nutzen zuerst.
 * Bestandteile bleiben: Kanäle (E-Mail, WhatsApp), Inhalt (passende Angebote und Neuigkeiten zu den Verträgen),
 * selbst festlegen, jederzeit widerrufbar. Der protokollierte Wortlaut der Einwilligung ist consentQuestion.
 */
export function consentRequestText(an: Ansprache): string {
  return a(
    an,
    "darf ich mich per E-Mail oder WhatsApp melden, wenn es zu deinen Verträgen passende Angebote oder Neuigkeiten gibt? Mit einem Klick legst du es fest und kannst es jederzeit widerrufen:",
    "darf ich mich per E-Mail oder WhatsApp melden, wenn es zu Ihren Verträgen passende Angebote oder Neuigkeiten gibt? Mit einem Klick legen Sie es fest und können es jederzeit widerrufen:",
  );
}

export type ConsentRequestResult = { ok: true; url: string; text: string; mailed: boolean } | { ok: false; error: string };

/**
 * Fuß der Bitte um Einwilligung per E-Mail: Sie ist selbst Werbung, also Absender, Widerspruchshinweis mit Abmeldelink
 * und Pflichtangaben (Impressum) wie in jeder Kampagnen-Mail (Recht, 20.11.2026).
 */
export function consentRequestFooter(an: Ansprache, firm: string, unsubscribeUrl: string, imprint: string | null = null): string {
  return campaignMailFooter({ firm, unsubscribeUrl, imprint, ansprache: an });
}

/**
 * Einwilligung einholen (Bestand, Kontakt): Link und Text zum Kopieren bzw. für den persönlichen Kontakt.
 * Per E-Mail nur, wenn ein anderer Weg zulässig ist (die Bitte ist selbst Werbung).
 */
export async function requestConsent(
  existingCustomerId: string,
  customerId: string,
  opts: { byMail: boolean; actorUserId: string | null; now?: Date; source?: string },
): Promise<ConsentRequestResult> {
  const now = opts.now ?? new Date();
  const ec = await prisma.existingCustomer.findFirst({
    where: { id: existingCustomerId, customerId },
    select: { id: true, firstName: true, lastName: true, salutation: true, ...SUBJECT_SELECT },
  });
  if (!ec) return { ok: false, error: "Kunde nicht gefunden." };
  const [settings, sup] = await Promise.all([loadConsentSettings(customerId), loadSuppression(customerId)]);
  const url = consentUrl(ec.id);
  const an = settings.ansprache;
  const anrede = anredeZeile(an, kontaktFromExisting(ec));
  const frage = consentRequestText(an);
  const text = `${anrede} ${frage} ${url}`;
  if (!opts.byMail) {
    await logConsent({ customerId, existingCustomerId: ec.id, channel: "email", action: "angefragt", source: "vermittler", text: "Link zum Teilen erstellt", actorUserId: opts.actorUserId, at: now });
    return { ok: true, url, text, mailed: false };
  }
  if (!consentRequestByMailAllowed(subjectOf(ec, sup), settings as ConsentSettings)) {
    return { ok: false, error: "Per E-Mail nur, wenn dieser Kunde per E-Mail angeschrieben werden darf. Geben Sie den Link im persönlichen Kontakt weiter." };
  }
  const imprint = settings.imprint ?? imprintFromWebsiteInfo(settings.websiteInfo);
  // Ohne Pflichtangaben keine Bitte per E-Mail (wie beim Kampagnenversand)
  if (!imprint?.trim()) return { ok: false, error: "Per E-Mail erst, wenn Ihre Pflichtangaben (Impressum) hinterlegt sind. Den Link können Sie trotzdem kopieren." };
  const footer = consentRequestFooter(an, firmDisplayName(settings.name), existingAbmeldeUrl(ec.id), imprint);
  const r = await sendTransactionalMail(customerId, {
    to: ec.email!,
    subject: a(an, "Darf ich dich auf dem Laufenden halten?", "Darf ich Sie auf dem Laufenden halten?"),
    text: (signatur) => `${anrede}\n\n${frage}\n${url}\n\n${signatur}\n\n\n${footer}`,
  }, ec.id, "Anfrage");
  if (!r.ok) return { ok: false, error: "Die E-Mail konnte nicht gesendet werden. Bitte das Postfach prüfen." };
  await logConsent({ customerId, existingCustomerId: ec.id, channel: "email", action: "angefragt", source: opts.source ?? "vermittler", text: "Einwilligungs-Abfrage per E-Mail gesendet", address: ec.email, actorUserId: opts.actorUserId, at: now });
  return { ok: true, url, text, mailed: true };
}

// ── Paket 3: Sammelanfrage, WhatsApp im offenen Fenster, Kennzahl ───────────────────────────────────────────

/** Warteschlange der Sammelanfrage im Protokoll: geplant → gesendet bzw. übersprungen (kein Nachweis, nur Zustand). */
export const ASK_PLANNED = "sammel_geplant";
export const ASK_DONE = "sammel_gesendet";
export const ASK_SKIPPED = "sammel_uebersprungen";
/** Höchstens so viele Bitten je Vermittler und Tag (schont Postfach und Ruf, zusätzlich zu mail-drossel). */
export const CONSENT_ASK_DAILY = 40;

/** Zuletzt per E-Mail um Einwilligung gebeten (oder zur Sammelanfrage eingeplant), je Bestandskunde. */
export async function lastAskedMap(customerId: string): Promise<Map<string, Date>> {
  const rows = await prisma.bestandConsentLog.groupBy({
    by: ["existingCustomerId"],
    where: { customerId, action: "angefragt", existingCustomerId: { not: null }, OR: [{ address: { not: null } }, { source: ASK_PLANNED }] },
    _max: { createdAt: true },
  });
  return new Map(rows.filter((r) => r.existingCustomerId && r._max.createdAt).map((r) => [r.existingCustomerId!, r._max.createdAt!]));
}

/** Kennzahl „Für Angebote erreichbar“ und Stand der Sammelanfrage für Cockpit und Einwilligungsseite. */
export async function loadOfferReach(customerId: string, now = new Date()) {
  const [rows, settings, sup, asked, planned, confirmed] = await Promise.all([
    prisma.existingCustomer.findMany({ where: { customerId }, select: { id: true, ...SUBJECT_SELECT } }),
    loadConsentSettings(customerId),
    loadSuppression(customerId),
    lastAskedMap(customerId),
    prisma.bestandConsentLog.count({ where: { customerId, source: ASK_PLANNED } }),
    prisma.bestandConsentLog.count({ where: { customerId, action: { in: ["bestaetigt", "erteilt"] }, source: "formular", createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } } }),
  ]);
  const reach = offerReach(rows.map((r) => ({ subject: subjectOf(r, sup), lastAskedAt: asked.get(r.id) ?? null })), settings, now);
  return { ...reach, planned, confirmed30: confirmed, uwgConfirmed: settings.uwgConfirmed };
}

/**
 * Sammelanfrage einplanen: nur Kunden, die consentAskEligible bestehen (Werbeerlaubnis per E-Mail, nicht abgemeldet
 * oder gesperrt, noch ohne Einwilligung, 30 Tage nicht gefragt). Der Versand läuft gedrosselt im Cron
 * (runConsentRequests), jede Mail mit Double-Opt-in über die Einwilligungsseite. Gibt die Zahl zurück.
 */
export async function planConsentRequests(customerId: string, opts: { actorUserId: string | null; now?: Date }): Promise<number> {
  const now = opts.now ?? new Date();
  const [rows, settings, sup, asked] = await Promise.all([
    prisma.existingCustomer.findMany({ where: { customerId }, select: { id: true, ...SUBJECT_SELECT } }),
    loadConsentSettings(customerId),
    loadSuppression(customerId),
    lastAskedMap(customerId),
  ]);
  // Ohne Pflichtangaben (Impressum) geht keine Bitte per E-Mail raus, also auch nichts einplanen
  if (!(settings.imprint ?? imprintFromWebsiteInfo(settings.websiteInfo))?.trim()) return 0;
  const ids = rows.filter((r) => consentAskEligible(subjectOf(r, sup), settings, asked.get(r.id) ?? null, now)).map((r) => r.id);
  if (!ids.length) return 0;
  await prisma.bestandConsentLog.createMany({
    data: ids.map((id) => ({ customerId, existingCustomerId: id, channel: "email", action: "angefragt", source: ASK_PLANNED, text: "Sammelanfrage eingeplant", actorUserId: opts.actorUserId, createdAt: now })),
  });
  return ids.length;
}

/**
 * Cron: eingeplante Bitten gedrosselt versenden (werktags 8 bis 18 Uhr wie mail-drossel.inMailWindow, je Lauf
 * höchstens MAX_PER_RUN je Vermittler, am Tag höchstens CONSENT_ASK_DAILY). Vor jeder Mail neu prüfen.
 */
export async function runConsentRequests(now = new Date()): Promise<{ sent: number; skipped: number }> {
  const { inMailWindow, MAX_PER_RUN } = await import("@/lib/bestand/mail-drossel");
  const out = { sent: 0, skipped: 0 };
  if (!inMailWindow(now)) return out;
  const owners = await prisma.bestandConsentLog.findMany({ where: { source: ASK_PLANNED }, distinct: ["customerId"], select: { customerId: true } });
  const dayStart = new Date(now.getTime() - 12 * 3600_000);
  for (const { customerId } of owners) {
    const cust = await prisma.customer.findUnique({ where: { id: customerId }, select: { existingCustomersEnabled: true, dormantSince: true } });
    if (!cust?.existingCustomersEnabled || cust.dormantSince) continue;
    const today = await prisma.bestandConsentLog.count({ where: { customerId, source: "sammel", createdAt: { gte: dayStart } } });
    const take = Math.min(MAX_PER_RUN, CONSENT_ASK_DAILY - today);
    if (take <= 0) continue;
    const due = await prisma.bestandConsentLog.findMany({ where: { customerId, source: ASK_PLANNED }, orderBy: { createdAt: "asc" }, take });
    const [settings, sup] = await Promise.all([loadConsentSettings(customerId), loadSuppression(customerId)]);
    for (const row of due) {
      const ec = row.existingCustomerId ? await prisma.existingCustomer.findUnique({ where: { id: row.existingCustomerId }, select: { id: true, ...SUBJECT_SELECT } }) : null;
      // Inzwischen eingewilligt, abgemeldet, gesperrt oder keine Werbeerlaubnis mehr: überspringen
      const ok = !!ec && consentAskEligible(subjectOf(ec, sup), settings, null, now);
      const r = ok ? await requestConsent(ec!.id, customerId, { byMail: true, actorUserId: row.actorUserId, now, source: "sammel" }).catch(() => null) : null;
      const sent = !!r?.ok && r.mailed;
      await prisma.bestandConsentLog.update({ where: { id: row.id }, data: { source: sent ? ASK_DONE : ASK_SKIPPED, text: sent ? "Sammelanfrage gesendet" : "Sammelanfrage übersprungen" } });
      if (sent) out.sent++;
      else out.skipped++;
    }
  }
  return out;
}

/**
 * Einwilligungslink per WhatsApp: nur im vom Kunden geöffneten 24-h-Fenster (er hat selbst geschrieben), nicht nach
 * „Stopp“, Abmeldung, Sperre oder WhatsApp-Einwilligung „nein“. Von Hand ausgelöst, wird protokolliert.
 */
export async function sendConsentWhatsApp(existingCustomerId: string, customerId: string, opts: { actorUserId: string | null; now?: Date }): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = opts.now ?? new Date();
  const ec = await prisma.existingCustomer.findFirst({ where: { id: existingCustomerId, customerId }, select: { id: true, firstName: true, lastName: true, salutation: true, ...SUBJECT_SELECT } });
  if (!ec?.phone) return { ok: false, error: "Keine Mobilnummer hinterlegt." };
  const [settings, sup] = await Promise.all([loadConsentSettings(customerId), loadSuppression(customerId)]);
  const s = subjectOf(ec, sup);
  if (s.blockedAt || s.optOutAt || s.suppressed?.all || ec.whatsappConsent === "nein") return { ok: false, error: "Dieser Kunde möchte keine Nachrichten per WhatsApp." };
  // Die Bitte ist selbst Werbung: dasselbe Tor wie per E-Mail (Recht, Auflage „jeder neue WhatsApp-Knopf“)
  if (!consentRequestByMailAllowed(s, settings as ConsentSettings)) return { ok: false, error: "Per WhatsApp nur, wenn dieser Kunde Werbung von Ihnen bekommen darf. Geben Sie den Link im persönlichen Kontakt weiter." };
  if (!(await waWindowOpenFor(customerId, [ec.phone], now)).has(ec.phone)) return { ok: false, error: "Per WhatsApp nur, wenn der Kunde Ihnen in den letzten 24 Stunden geschrieben hat." };
  const an = settings.ansprache;
  const body = `${anredeZeile(an, kontaktFromExisting(ec))} ${consentRequestText(an)} ${consentUrl(ec.id)}`;
  const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
  await sendWhatsAppMessage({ customerId, to: ec.phone, body, sentBy: "agent", sentByUserId: opts.actorUserId });
  await logConsent({ customerId, existingCustomerId: ec.id, channel: "whatsapp", action: "angefragt", source: "vermittler", text: "Einwilligungs-Abfrage per WhatsApp gesendet (offenes Fenster)", address: ec.phone, actorUserId: opts.actorUserId, at: now });
  return { ok: true };
}

/** Nummern mit offenem 24-h-Fenster (der Kunde hat zuletzt selbst geschrieben). */
export async function waWindowOpenFor(customerId: string, phones: string[], now = new Date()): Promise<Set<string>> {
  if (!phones.length) return new Set();
  const convs = await prisma.conversation.findMany({ where: { customerId, contactPhone: { in: phones }, windowExpiresAt: { gt: now }, optedOutAt: null }, select: { contactPhone: true } });
  return new Set(convs.map((c) => c.contactPhone));
}
