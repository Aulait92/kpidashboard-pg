// Einwilligungen, Abmeldungen und Sperrliste der Bestandskunden (Datenbank). Regeln: lib/bestand/einwilligung.ts.
// Abmeldung wirkt sofort und dauerhaft (UWG, DSGVO Art. 21): Felder am Kunden, Eintrag in der Sperrliste
// (Hash von E-Mail und Telefon, greift auch nach erneutem Import) und Protokoll.

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { optOutHash, doiToken, doiConfirmUrl, hashToken, consentUrl } from "@/lib/bestand/links";
import { consentQuestion, consentRequestByMailAllowed, type Channel, type ConsentSettings, type ConsentSubject, type ConsentValue } from "@/lib/bestand/einwilligung";
import { anredeZeile } from "@/lib/ansprache";
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
  };
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
};
export const SUBJECT_SELECT = { phone: true, email: true, optOutAt: true, emailOptOutAt: true, emailConsent: true, whatsappConsent: true, widerspruchHinweis: true, waUnavailableAt: true } as const;

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
      customer: { select: { name: true, existingCustomersEnabled: true, onboarding: { select: { websiteInfo: true } } } },
    },
  });
  if (!ec || !ec.customer.existingCustomersEnabled) return null;
  const privacy = (ec.customer.onboarding?.websiteInfo as { privacyUrl?: string | null } | null)?.privacyUrl;
  return {
    ...ec,
    advisor: advisorPerson(ec.customer.name, null),
    firm: firmDisplayName(ec.customer.name),
    anrede: anredeZeile("sie", kontaktFromExisting(ec)),
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
    const r = await sendTransactionalMail(page.customerId, {
      to: address,
      subject: `Bitte bestätigen: E-Mails von ${page.advisor}`,
      text: [
        page.anrede,
        "",
        `bitte bestätigen Sie mit einem Klick, dass ${page.advisor} Sie per E-Mail über passende Angebote und Neuigkeiten zu Ihren Verträgen informieren darf:`,
        doiConfirmUrl(token),
        "",
        "Wenn Sie das nicht angefragt haben, ignorieren Sie diese E-Mail einfach. Dann passiert nichts.",
        "",
        "Viele Grüße",
        page.advisor,
      ].join("\n"),
    });
    doiSent = r.ok;
  }
  return { ok: true, doiSent, whatsapp: input.whatsapp };
}

/** Bestätigungslink (Double-Opt-in) geklickt: E-Mail-Einwilligung gilt ab jetzt. */
export async function confirmDoi(token: string, meta: { ip: string | null; userAgent: string | null }, now = new Date()): Promise<{ ok: true; advisor: string; customerId: string } | { ok: false }> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { ok: false };
  const log = await prisma.bestandConsentLog.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!log || !log.existingCustomerId || log.channel !== "email") return { ok: false };
  // Link 30 Tage gültig
  if (now.getTime() - log.createdAt.getTime() > 30 * 86_400_000) return { ok: false };
  const ec = await prisma.existingCustomer.findUnique({ where: { id: log.existingCustomerId }, select: { id: true, customerId: true, email: true, customer: { select: { name: true } } } });
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
  return { ok: true, advisor: advisorPerson(ec.customer.name, null), customerId: ec.customerId };
}

/**
 * Bestätigungs- und Einwilligungsmails: über das verbundene Postfach des Inhabers (Absender klar erkennbar),
 * sonst über unseren Versand im Namen des Vermittlers.
 */
async function sendTransactionalMail(customerId: string, m: { to: string; subject: string; text: string }): Promise<{ ok: boolean }> {
  const conn = await prisma.mailConnection.findFirst({ where: { customerId, status: "ok", user: { teamRole: "owner" } }, select: { userId: true } });
  if (conn) {
    const { sendViaPostfach } = await import("@/lib/mail/postfach");
    const r = await sendViaPostfach(conn.userId, m);
    if (r.ok) return { ok: true };
  }
  const { sendPlainMail } = await import("@/lib/email");
  const r = await sendPlainMail(m);
  return { ok: r.ok };
}

export type ConsentRequestResult = { ok: true; url: string; text: string; mailed: boolean } | { ok: false; error: string };

/**
 * Einwilligung einholen (Bestand, Kontakt): Link und Text zum Kopieren bzw. für den persönlichen Kontakt.
 * Per E-Mail nur, wenn ein anderer Weg zulässig ist (die Bitte ist selbst Werbung).
 */
export async function requestConsent(existingCustomerId: string, customerId: string, opts: { byMail: boolean; actorUserId: string | null; now?: Date }): Promise<ConsentRequestResult> {
  const now = opts.now ?? new Date();
  const ec = await prisma.existingCustomer.findFirst({
    where: { id: existingCustomerId, customerId },
    select: { id: true, firstName: true, lastName: true, salutation: true, ...SUBJECT_SELECT },
  });
  if (!ec) return { ok: false, error: "Kunde nicht gefunden." };
  const [settings, sup, c] = await Promise.all([loadConsentSettings(customerId), loadSuppression(customerId), prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } })]);
  const advisor = advisorPerson(c?.name ?? "", null);
  const url = consentUrl(ec.id);
  const anrede = anredeZeile("sie", kontaktFromExisting(ec));
  const text = `${anrede} darf ich Sie künftig per E-Mail bzw. WhatsApp über passende Angebote und Neuigkeiten zu Ihren Verträgen informieren? Hier können Sie das mit einem Klick festlegen und jederzeit widerrufen: ${url}`;
  if (!opts.byMail) {
    await logConsent({ customerId, existingCustomerId: ec.id, channel: "email", action: "angefragt", source: "vermittler", text: "Link zum Teilen erstellt", actorUserId: opts.actorUserId, at: now });
    return { ok: true, url, text, mailed: false };
  }
  if (!consentRequestByMailAllowed(subjectOf(ec, sup), settings as ConsentSettings)) {
    return { ok: false, error: "Per E-Mail nur, wenn dieser Kunde per E-Mail angeschrieben werden darf. Geben Sie den Link im persönlichen Kontakt weiter." };
  }
  const r = await sendTransactionalMail(customerId, {
    to: ec.email!,
    subject: "Darf ich Sie auf dem Laufenden halten?",
    text: `${anrede}\n\ndarf ich Sie künftig per E-Mail bzw. WhatsApp über passende Angebote und Neuigkeiten zu Ihren Verträgen informieren? Hier können Sie das mit einem Klick festlegen und jederzeit widerrufen:\n${url}\n\nViele Grüße\n${advisor}`,
  });
  if (!r.ok) return { ok: false, error: "Die E-Mail konnte nicht gesendet werden. Bitte das Postfach prüfen." };
  await logConsent({ customerId, existingCustomerId: ec.id, channel: "email", action: "angefragt", source: "vermittler", text: "Einwilligungs-Abfrage per E-Mail gesendet", address: ec.email, actorUserId: opts.actorUserId, at: now });
  return { ok: true, url, text, mailed: true };
}
