// Onboarding ab Vertragsannahme: Kundenkonto + Login anlegen, Willkommens-
// Mail schicken, Aufgaben für den Vertrieb erzeugen und eine Checkliste
// führen, die Admin und Kunde sehen.
//
// Start: automatisch, sobald die Zahlung eingerichtet ist (Stripe-Webhook)
// bzw. direkt bei Annahme, wenn keine Online-Zahlung aktiv ist. Zusätzlich
// per Knopf am Vertriebskontakt (z. B. für Bestandskunden).

import { gesundheitFreigegeben, gesundheitNotAus, policenNotAus } from "@/lib/policen/regeln";
import { ablageBereit } from "@/lib/policen/ablage";

/** Schritt „Kranken, BU und Leben“ möglich: Policen-Ablage eingerichtet, keine Notschalter. */
export const policenGesundheitMoeglich = () => ablageBereit() && !policenNotAus() && !gesundheitNotAus();
import { erstinfoVollstaendig, type ErstinfoWeb } from "@/lib/erstinformation-shared";
import { ERSTINFO_STATT_WEBSITE, erstinfoStattWebsite } from "@/lib/impressum-ersatz";
import { leseMailAblauf } from "@/lib/mail/ablauf";
import crypto from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { loadCustomerProvision } from "@/lib/provision-server";
import { hashPassword, issuePasswordResetToken } from "@/lib/auth";
import { buildResetUrl, getAppUrl, sendCustomerMail, sendOnboardingWelcomeEmail } from "@/lib/email";
import { customerGreeting, logOfferActivity, offerAdminHref, setContactCustomerStage } from "@/lib/offer-links";
import { billingEnabled } from "@/lib/billing";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import { offerProducts } from "@/components/offer-document";
import { selfConnectEnabled } from "@/lib/whatsapp/dialog360-partner";
import { validLoginEmail } from "@/lib/login-email";
import { videoLinkNoetig } from "@/lib/video-raum";
import { ersterAbrechnungstag } from "@/lib/abrechnungstag";
import { mitKampagnen, mitSoftware, normalizePackage, PACKAGE_LABEL, prepayFreeMonthsFor, rhythmusFuer } from "@/lib/offer-pricing";

const DAY = 24 * 60 * 60 * 1000;
const INVITE_TTL_MS = 7 * DAY;

/** checkoutEmail: E-Mail aus dem Stripe-Checkout (customer_details.email), Rückfall, falls im Angebot keine steht. */
type StartOpts = { customerId?: string | null; sendWelcome?: boolean; checkoutEmail?: string | null };
export type StartResult = { ok: true; onboardingId: string; customerId: string; created: boolean } | { ok: false; error: string };

/** Kundenname ist eindeutig → bei Gleichstand Ort bzw. Zähler anhängen. */
async function uniqueCustomerName(base: string, city: string | null): Promise<string> {
  const candidates = [base, city ? `${base} (${city})` : null].filter(Boolean) as string[];
  for (const c of candidates) {
    if (!(await prisma.customer.findUnique({ where: { name: c }, select: { id: true } }))) return c;
  }
  for (let i = 2; i < 50; i++) {
    const c = `${base} (${i})`;
    if (!(await prisma.customer.findUnique({ where: { name: c }, select: { id: true } }))) return c;
  }
  return `${base} (${crypto.randomBytes(3).toString("hex")})`;
}

/**
 * Bestehendes Kundenkonto ohne Verknüpfung am Vertriebskontakt (Fall Anid 17.11.2026: Kontakte aus dem Cold-CRM-Import
 * haben keine customerId mehr): Kundenkonto, dessen Login die E-Mail des Angebots bzw. des Kontakts hat. Nur eindeutig
 * (genau ein Konto, nicht archiviert, kein Testkunde); sonst null und es entsteht wie bisher ein neues Konto.
 */
async function bestehendesKonto(
  offer: { email: string | null; isTest: boolean },
  contact: { email: string | null } | null,
): Promise<string | null> {
  if (offer.isTest) return null;
  const mails = [...new Set([offer.email, contact?.email].map((e) => (e ?? "").trim().toLowerCase()).filter((e) => e.includes("@") && !e.endsWith(".invalid")))];
  if (!mails.length) return null;
  const users = await prisma.user
    .findMany({ where: { email: { in: mails, mode: "insensitive" }, customerId: { not: null }, customer: { archived: false, isTest: false } }, select: { customerId: true } })
    .catch(() => []);
  const ids = [...new Set(users.map((u) => u.customerId).filter((x): x is string => !!x))];
  return ids.length === 1 ? ids[0] : null;
}

/** Fälligkeit einer Aufgabe: X Tage vor Start, aber nie in der Vergangenheit. */
function dueBefore(start: Date | null, daysBefore: number, minDaysFromNow: number): Date {
  const min = new Date(Date.now() + minDaysFromNow * DAY);
  if (!start) return min;
  const d = new Date(start.getTime() - daysBefore * DAY);
  const due = d < min ? min : d;
  due.setUTCHours(8, 0, 0, 0); // 9 bzw. 10 Uhr deutscher Zeit
  return due;
}

/**
 * Kalenderschritt erledigt: Zeitenquelle da und, ohne Google/Microsoft, ein Video-Link hinterlegt. Mit dem Ausweg
 * „Mein Versicherer erlaubt das nicht“ (uebersprungen) entfällt die Zeitenquelle, der Video-Link bleibt Pflicht
 * (Go-live-Prüfung 22.11.2026: sonst haben Videotermine keinen Raum). (rein)
 */
export function kalenderSchrittFertig(
  c: {
    calendarConnection?: { status: string; provider: string } | null;
    agentConfig?: { availabilityIcsUrlEnc: string | null; allianzCalendarEnc: string | null; videoRoomUrl: string | null } | null;
  },
  uebersprungen = false,
  einladungAngekommen = true,
): boolean {
  const verbunden = c.calendarConnection?.status === "connected";
  const zeiten = uebersprungen || verbunden || !!c.agentConfig?.availabilityIcsUrlEnc || !!c.agentConfig?.allianzCalendarEnc;
  if (einladungsTestNoetig(c.calendarConnection) && !einladungAngekommen) return false;
  return zeiten && (!videoLinkNoetig(c.calendarConnection) || !!c.agentConfig?.videoRoomUrl?.trim());
}

/** stepSkips-Eintrag „Test-Einladung angekommen“ (Kalenderschritt mit App-Kalender, 22.11.2026). */
export const EINLADUNG_TEST_KEY = "calendarEinladung";

/**
 * App-Kalender (auch Allianz): Termine kommen als Einladung per Mail, oft an eine Konzernadresse, deren Filter sie
 * blockieren kann. Dann gilt der Kalenderschritt erst nach bestätigter Test-Einladung als erledigt. (rein)
 */
export function einladungsTestNoetig(conn: { status: string; provider: string } | null | undefined): boolean {
  return conn?.status === "connected" && conn.provider === "app";
}

export async function startOnboarding(offerId: string, opts: StartOpts = {}): Promise<StartResult> {
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (offer.status !== "accepted") return { ok: false, error: "Das Angebot ist noch nicht angenommen." };

  const existing = await prisma.onboarding.findUnique({ where: { offerId: offer.id } });
  if (existing) return { ok: true, onboardingId: existing.id, customerId: existing.customerId, created: false };

  const contact = offer.salesContactId
    ? await prisma.salesContact.findUnique({ where: { id: offer.salesContactId } })
    : null;
  const pkg = normalizePackage(offer.package);

  // 1) Kundenkonto: vorgegeben, schon am Kontakt verknüpft oder neu.
  let customerId = opts.customerId || contact?.customerId || (await bestehendesKonto(offer, contact)) || null;
  if (customerId) {
    const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!c) return { ok: false, error: "Kundenkonto nicht gefunden." };
    // Bestandskunde wechselt das Paket (z. B. Nur Betreuung → Betreuung + Software, Fall Anid 13.11.):
    // kein zweites Onboarding, sondern Paket, Preis und Oberfläche am bestehenden Konto umstellen.
    const prior = await prisma.onboarding.findUnique({ where: { customerId }, select: { id: true } });
    if (prior) return upgradeExistingCustomer(offer, customerId, prior.id, contact?.id ?? null);
  }
  const stripeFree =
    offer.stripeCustomerId &&
    !(await prisma.customer.findUnique({ where: { stripeCustomerId: offer.stripeCustomerId }, select: { id: true } }));

  const customer = customerId
    ? await prisma.customer.update({
        where: { id: customerId },
        data: {
          plan: pkg,
          // Mehrfachvertreter (Erstinformation) bleibt bei einem Vertreter-Angebot erhalten
          vermittlerTyp:
            offer.vermittlerTyp === "makler" || offer.vermittlerTyp === "mehrfachvertreter"
              ? offer.vermittlerTyp
              : (await prisma.customer.findUnique({ where: { id: customerId }, select: { vermittlerTyp: true } }))?.vermittlerTyp === "mehrfachvertreter"
                ? "mehrfachvertreter"
                : "vertreter",
          ...(mitSoftware(pkg) ? { newUi: true } : {}),
          retainerMonthly: offer.monthlyFee,
          retainerStart: offer.startDate,
          // Du/Sie gegenüber dem Vermittler wie im angenommenen Angebot (lib/vermittler-ansprache.ts)
          vermittlerDu: offer.mailDu,
          ...billingTermsOf(offer),
          ...(stripeFree ? { stripeCustomerId: offer.stripeCustomerId } : {}),
        },
      })
    : await prisma.customer.create({
        data: {
          name: await uniqueCustomerName((offer.company || offer.contactName).trim(), offer.city),
          plan: pkg,
          // Testangebot → Testkunde (zählt nicht in Admin-Zahlen und Abrechnung, später löschbar)
          isTest: offer.isTest,
          // Vertreter oder Makler aus dem Angebot übernehmen (Provisionen, Rechner, Budget-Empfehlung)
          vermittlerTyp: offer.vermittlerTyp === "makler" || offer.vermittlerTyp === "mehrfachvertreter" ? offer.vermittlerTyp : "vertreter",
          // Neue Kunden mit Software starten direkt in der neuen Oberfläche (Ole, 11.11.).
          newUi: mitSoftware(pkg),
          retainerMonthly: offer.monthlyFee,
          retainerStart: offer.startDate,
          // Du/Sie gegenüber dem Vermittler wie im angenommenen Angebot (lib/vermittler-ansprache.ts)
          vermittlerDu: offer.mailDu,
          ...billingTermsOf(offer),
          ...(stripeFree ? { stripeCustomerId: offer.stripeCustomerId } : {}),
        },
      });
  customerId = customer.id;

  if (contact && contact.customerId !== customer.id) {
    await prisma.salesContact
      .update({ where: { id: contact.id }, data: { customerId: customer.id } })
      .catch((err) => reportError(err, "onboarding-link-contact")); // anderer Kontakt hält das Konto schon
  }

  const onboarding = await prisma.onboarding.create({
    data: {
      customerId: customer.id,
      offerId: offer.id,
      salesContactId: contact?.id ?? null,
      package: pkg,
      startDate: offer.startDate,
    },
  });

  // 2) Login für den Kunden (Passwort setzt er selbst über den Einladungslink).
  // Reihenfolge: Angebot, Vertriebskontakt, Stripe-Checkout (Rückfall, falls das Angebot ohne E-Mail war).
  const clean = (v: string | null | undefined) => {
    const e = validLoginEmail(v);
    // Platzhalter wie linkedin-…@ohne-email.invalid (Kontakte ohne E-Mail) taugen nicht für einen Login.
    return e && !e.endsWith(".invalid") ? e : null;
  };
  const email = clean(offer.email) || clean(contact?.email) || clean(opts.checkoutEmail) || null;
  if (email && !clean(offer.email)) {
    await prisma.offer.update({ where: { id: offer.id }, data: { email } }).catch((err) => reportError(err, "onboarding-offer-email"));
  }
  let setPasswordUrl: string | null = null;
  let loginReady = false;
  if (email) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, customerId: true } });
    loginReady = !user || (user.role === "BUYER" && (!user.customerId || user.customerId === customer.id));
    if (!user) {
      await prisma.user.create({
        data: {
          email,
          // Unbenutzbares Zufallspasswort – der Kunde legt sein eigenes fest.
          passwordHash: await hashPassword(crypto.randomBytes(24).toString("base64url")),
          role: "BUYER",
          customerId: customer.id,
        },
      });
      const token = await issuePasswordResetToken(email, INVITE_TTL_MS);
      if (token) setPasswordUrl = buildResetUrl(token.rawToken);
    } else if (user.role === "BUYER" && !user.customerId) {
      await prisma.user.update({ where: { id: user.id }, data: { customerId: customer.id } });
    }
  }

  // Erste Woche aus dem Angebot (Pay-per-Lead + Software, Ole 20.11.2026): Bezug und wartende Bestellung anlegen
  const ersteWoche = !mitKampagnen(pkg)
    ? await import("@/lib/ppl/erste-woche")
        .then((m) => m.ersteWocheAnlegen(offer.id, customer.id))
        .catch((err) => {
          reportError(err, "onboarding-erste-woche", { offer: offer.number });
          return null;
        })
    : null;

  // 3) Aufgaben für den Vertrieb (am Kontakt, erscheinen unter Heute → Aufgaben).
  if (contact && !mitKampagnen(pkg)) {
    // Pay-per-Lead + Software: keine Kampagne, kein Leadformular, kein Werbekonto. Mit erster Woche ist der Bezug
    // schon angelegt; unser Teil ist die Registerprüfung (danach Abbuchung und Lieferung). Ohne erste Woche wie bisher.
    const start = offer.startDate;
    const { bezugAdminPfad } = await import("@/lib/ppl/erste-woche");
    await prisma.salesTask
      .createMany({
        data: [
          ersteWoche
            ? {
                title: `Onboarding: Registernummer prüfen (Vermittlerregister), dann startet die erste Woche`,
                note: `${getAppUrl()}${bezugAdminPfad(ersteWoche.subscriptionId)}`,
                dueAt: dueBefore(null, 0, 1),
              }
            : { title: "Onboarding: Pay-per-Lead-Bezug einrichten (Produkt, Preis, Gebiet, Lieferung in den Kundenbereich)", dueAt: dueBefore(start, 5, 1) },
          { title: "Onboarding: Go-live: WhatsApp und Vorlage prüfen, live schalten", dueAt: dueBefore(start, 0, 2) },
        ].map((t) => ({ ...t, contactId: contact.id, type: "SONSTIGES" as const })),
      })
      .catch((err) => reportError(err, "onboarding-tasks"));
  } else if (contact) {
    const start = offer.startDate;
    const tasks = [
      { title: "Onboarding: Pflichtangaben (Impressum) der Agentur-Website prüfen", dueAt: dueBefore(null, 0, 1) },
      { title: "Onboarding: Kampagne und Leadformular anlegen", dueAt: dueBefore(start, 5, 2) },
      { title: "Onboarding: Testlead durchspielen", dueAt: dueBefore(start, 2, 3) },
      { title: "Onboarding: Go-live: Kampagne aktivieren", dueAt: dueBefore(start, 0, 4) },
    ];
    // Kampagnen-Automatik: Agenten-Team legt je Produkt die Kampagne pausiert an (sobald Meta-Zugriff
    // usw. da ist) – dann entfällt die Aufgabe „Kampagne und Leadformular anlegen“.
    const launched = await launchOfferCampaigns(customer.id, offer.products).catch((err) => {
      reportError(err, "onboarding-kampagne");
      return false;
    });
    const open = launched ? tasks.filter((t) => !t.title.startsWith("Onboarding: Kampagne und Leadformular")) : tasks;
    await prisma.salesTask
      .createMany({ data: open.map((t) => ({ ...t, contactId: contact.id, type: "SONSTIGES" as const })) })
      .catch((err) => reportError(err, "onboarding-tasks"));
  }

  // 4) Willkommens-Mail.
  if (opts.sendWelcome !== false && email) {
    await sendWelcome(onboarding.id, { setPasswordUrl });
  }

  // Module aus dem Angebot (Bestand, Empfehlungen): Vorlagen gleich einreichen, falls die Nummer schon verbunden ist
  if (offer.bestandMonthly != null || offer.empfehlungMonthly != null) {
    const { submitTemplatesAfterModule } = await import("@/lib/whatsapp/template-submit");
    await submitTemplatesAfterModule(customer.id);
  }
  await setContactCustomerStage(offer, "ONBOARDING");
  await logOfferActivity(offer, `Onboarding gestartet (${PACKAGE_LABEL[pkg]})`, `Kundenkonto: ${customer.name}`);
  if (!loginReady) {
    // Kein Login möglich (keine E-Mail, oder die Adresse gehört schon einem anderen Konto):
    // Admin muss es von Hand anlegen, sonst kommt der Kunde nach der Zahlung nicht hinein.
    const why = email ? `${email} gehört schon zu einem anderen Login` : "Keine E-Mail-Adresse im Angebot, am Kontakt und im Checkout";
    if (contact) {
      await prisma.salesTask
        .create({ data: { contactId: contact.id, type: "SONSTIGES", title: `Kein Login angelegt: ${customer.name}. ${why}, bitte Login anlegen und einladen`, dueAt: dueBefore(null, 0, 0) } })
        .catch((err) => reportError(err, "onboarding-login-task"));
    }
    await logOfferActivity(offer, "Kein Login angelegt", why);
    await sendToAdmins({
      title: `⚠️ Kein Login angelegt: ${customer.name}`,
      body: `${why}. Bitte Login anlegen und einladen.`,
      url: offerAdminHref(offer),
      tag: `onboarding:${onboarding.id}`,
    }).catch((err) => reportError(err, "onboarding-push"));
  } else {
    await sendToAdmins({
      title: `🚀 Onboarding gestartet: ${customer.name}`,
      body: offer.startDate ? `Start ${offer.startDate.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}` : offer.number,
      url: offerAdminHref(offer),
      tag: `onboarding:${onboarding.id}`,
    }).catch((err) => reportError(err, "onboarding-push"));
  }

  return { ok: true, onboardingId: onboarding.id, customerId: customer.id, created: true };
}

/** Je Angebotsprodukt mit Budget einen Kampagnen-Lauf vormerken/starten. false = Automatik aus. */
async function launchOfferCampaigns(customerId: string, products: unknown): Promise<boolean> {
  const { loadAutomationSettings } = await import("@/lib/kampagnen/settings");
  if (!(await loadAutomationSettings()).autoLaunch) return false;
  const { requestCampaignLaunch } = await import("@/lib/kampagnen/launch");
  const list = (Array.isArray(products) ? products : []) as { name?: unknown; dailyBudget?: unknown }[];
  for (const p of list) {
    if (typeof p?.name !== "string" || !(Number(p.dailyBudget) > 0)) continue;
    await requestCampaignLaunch({ customerId, product: p.name, source: "angebot" });
  }
  return true;
}

/** Paketwechsel eines Bestandskunden mit vorhandenem Onboarding (kein neues Onboarding, keine Einladung). */
async function upgradeExistingCustomer(
  offer: NonNullable<Awaited<ReturnType<typeof prisma.offer.findUnique>>>,
  customerId: string,
  onboardingId: string,
  contactId: string | null,
): Promise<StartResult> {
  const pkg = normalizePackage(offer.package);
  const stripeFree =
    offer.stripeCustomerId &&
    !(await prisma.customer.findUnique({ where: { stripeCustomerId: offer.stripeCustomerId }, select: { id: true } }));
  const customer = await prisma.customer.update({
    where: { id: customerId },
    data: {
      plan: pkg,
      ...(mitSoftware(pkg) ? { newUi: true } : {}),
      retainerMonthly: offer.monthlyFee,
      ...(offer.startDate ? { retainerStart: offer.startDate } : {}),
      // Neues angenommenes Angebot: Du/Sie wie darin (lib/vermittler-ansprache.ts)
      vermittlerDu: offer.mailDu,
      ...billingTermsOf(offer),
      ...(stripeFree ? { stripeCustomerId: offer.stripeCustomerId } : {}),
    },
  });
  await prisma.onboarding.update({ where: { id: onboardingId }, data: { offerId: offer.id, package: pkg, ...(offer.startDate ? { startDate: offer.startDate } : {}) } });
  // Erste Woche aus dem Angebot (Pay-per-Lead + Software): Bezug und wartende Bestellung anlegen
  if (pkg === "ppl_software") {
    await import("@/lib/ppl/erste-woche")
      .then((m) => m.ersteWocheAnlegen(offer.id, customerId))
      .catch((err) => reportError(err, "upgrade-erste-woche", { offer: offer.number }));
  }
  if (contactId) {
    await prisma.salesTask
      .create({
        data: {
          contactId,
          type: "SONSTIGES",
          title: `Paketwechsel ${customer.name}: ${
            pkg === "software"
              ? "Software einrichten (WhatsApp, Kalender, App, Team)"
              : pkg === "ppl_software"
                ? "Pay-per-Lead + Software: Software einrichten, Kampagnen beenden, Pay-per-Lead-Bezug prüfen"
                : "auf Nur Betreuung umstellen"
          }`,
          dueAt: dueBefore(null, 0, 0),
        },
      })
      .catch((err) => reportError(err, "upgrade-task"));
  }
  await logOfferActivity(offer, `Paketwechsel angenommen (${PACKAGE_LABEL[pkg]})`, `Kundenkonto: ${customer.name}`);
  await sendToAdmins({
    title: `⬆️ Paketwechsel: ${customer.name}`,
    body: pkg === "service" ? "Jetzt Nur Betreuung" : `Jetzt ${PACKAGE_LABEL[pkg]}, Einrichtung starten`,
    url: offerAdminHref(offer),
    tag: `upgrade:${customerId}`,
  }).catch((err) => reportError(err, "upgrade-push"));
  return { ok: true, onboardingId, customerId, created: false };
}

/** Willkommens-Mail (erneut) senden. Ohne Link wird ein frischer Einladungslink erzeugt, solange der Kunde noch nie eingeloggt war. */
export async function sendWelcome(onboardingId: string, opts: { setPasswordUrl?: string | null } = {}) {
  const ob = await prisma.onboarding.findUnique({
    where: { id: onboardingId },
    include: { customer: { include: { users: { where: { role: "BUYER" }, select: { email: true, lastLoginAt: true } } } } },
  });
  if (!ob) return { ok: false as const, error: "Onboarding nicht gefunden." };
  const offer = ob.offerId ? await prisma.offer.findUnique({ where: { id: ob.offerId } }) : null;
  const user = ob.customer.users[0];
  const to = user?.email ?? offer?.email;
  if (!to) return { ok: false as const, error: "Keine E-Mail-Adresse für den Kunden hinterlegt." };

  let setPasswordUrl = opts.setPasswordUrl ?? null;
  if (!setPasswordUrl && user && !user.lastLoginAt) {
    const token = await issuePasswordResetToken(user.email, INVITE_TTL_MS);
    if (token) setPasswordUrl = buildResetUrl(token.rawToken);
  }
  const res = await sendOnboardingWelcomeEmail({
    to,
    greeting: await customerGreeting({ salesContactId: ob.salesContactId, contactName: offer?.contactName ?? null }),
    packageType: normalizePackage(ob.package),
    startDate: ob.startDate,
    products: offer ? offerProducts(offer.products).map((p) => p.name) : [],
    setPasswordUrl,
    loginUrl: `${getAppUrl()}/login`,
    setupUrl: `${getAppUrl()}/buyer/einrichtung`,
    whatsappSelfConnect: ob.package !== "service" && selfConnectEnabled(),
    replyTo: process.env.OFFER_REPLY_TO ?? null,
  });
  if (res.ok) {
    await prisma.onboarding.update({ where: { id: ob.id }, data: { welcomeSentAt: new Date() } });
    if (offer) await logOfferActivity(offer, `Willkommens-Mail an ${to} gesendet`);
  } else {
    reportError(new Error(res.error), "onboarding-welcome", { onboarding: ob.id });
  }
  return res;
}

// ─── Checkliste ────────────────────────────────────────────────────────

export type ChecklistItem = {
  key: string;
  label: string;
  /** Wer ist dran: der Kunde, du (Vertrieb/Media-Buying) oder automatisch. */
  owner: "kunde" | "du" | "auto";
  done: boolean;
  at: Date | null;
  /** Kann im Admin von Hand abgehakt werden. */
  manual?: keyof typeof MANUAL_FIELDS;
  /** Kurzer Zusatz im Admin, z. B. „Erstinformation statt Website“ */
  note?: string;
};

export const MANUAL_FIELDS = {
  metaAccess: "metaAccessAt",
  website: "websiteCheckedAt",
  campaign: "campaignReadyAt",
  testLead: "testLeadAt",
  consent: "consentConfirmedAt",
} as const;

/** Kundendaten für Checkliste und Fortschritt (eine Quelle für Einrichtung, Startseite und Admin). */
export const ONBOARDING_CUSTOMER_INCLUDE = {
  users: { where: { role: "BUYER" }, select: { email: true, lastLoginAt: true, mailConnection: { select: { id: true } } } },
  calendarConnection: { select: { status: true, provider: true } },
  agentConfig: { select: { availabilityIcsUrlEnc: true, allianzCalendarEnc: true, videoRoomUrl: true } },
  whatsAppAccount: { select: { status: true } },
  messageTemplates: { where: { purpose: "outreach", status: "approved" }, select: { id: true }, take: 1 },
  reviewSettings: { select: { googleReviewUrl: true } },
  erstinformation: {
    select: {
      statusAt: true,
      bestaetigtAt: true,
      registerNummer: true,
      url: true,
      fileName: true,
      name: true,
      firma: true,
      anschrift: true,
      telefon: true,
      email: true,
      versicherer: true,
      erlaubnis: true,
      beratung: true,
      beteiligungen: true,
      verguetung: true,
      zuwendungen: true,
      ihk: true,
    },
  },
  _count: { select: { existingCustomers: true } },
} satisfies Prisma.CustomerInclude;

export async function loadOnboarding(where: { customerId: string } | { id: string }) {
  return prisma.onboarding.findUnique({
    where,
    include: {
      customer: { include: ONBOARDING_CUSTOMER_INCLUDE },
    },
  });
}

export type OnboardingFull = NonNullable<Awaited<ReturnType<typeof loadOnboarding>>>;

export function onboardingChecklist(ob: OnboardingFull, offer: { paymentStatus: string; paidAt: Date | null; isTest?: boolean } | null): ChecklistItem[] {
  const software = mitSoftware(ob.package);
  // Pay-per-Lead + Software: ohne Meta-Zugriff, Leadformular-Einwilligung, Impressum der Kampagne, Kampagne und Testlead
  const kampagnen = mitKampagnen(ob.package);
  const skip = (k: string) => stepSkipOf(ob.stepSkips, k);
  const firstLogin = ob.customer.users.map((u) => u.lastLoginAt).filter(Boolean).sort()[0] ?? null;
  const erstinfoOk = erstinfoVollstaendig(ob.customer.erstinformation, (ob.websiteInfo ?? null) as ErstinfoWeb, ob.customer);
  // Ohne Website (z. B. Allianz-Vertreter): vollständige Erstinformation ersetzt das Impressum (lib/impressum-ersatz.ts)
  const ohneWebsite = !ob.websiteCheckedAt && erstinfoStattWebsite(ob.websiteInfo as { error?: string } | null, erstinfoOk);
  const items: ChecklistItem[] = [];
  // Nur mit Online-Zahlung (Stripe) – sonst läuft die Zahlung außerhalb der App.
  if (offer && billingEnabled() && !offer.isTest) {
    items.push({
      key: "payment",
      label: "Zahlung eingerichtet",
      owner: "kunde",
      done: offer.paymentStatus === "paid" || offer.paymentStatus === "processing",
      at: offer.paidAt ?? null,
    });
  }
  items.push(
    { key: "welcome", label: "Willkommens-Mail verschickt", owner: "auto", done: !!ob.welcomeSentAt, at: ob.welcomeSentAt },
    { key: "login", label: "Kunde hat sich eingeloggt", owner: "kunde", done: !!firstLogin, at: firstLogin },
    { key: "questionnaire", label: "Fragebogen ausgefüllt", owner: "kunde", done: !!ob.questionnaireAt, at: ob.questionnaireAt },
  );
  if (kampagnen) {
    items.push({ key: "metaAccess", label: "Meta-Zugriff (Werbekonto + Seite) erteilt", owner: "kunde", done: !!ob.metaAccessAt, at: ob.metaAccessAt, manual: "metaAccess" });
  }
  if (software) {
    items.push(
      {
        key: "calendar",
        label: "Kalender verbunden",
        owner: "kunde",
        // Google/Microsoft verbunden oder freie Zeiten über App-Kalender, ICS-Link bzw. Allianz-Online-Kalender. Ohne
        // Google/Microsoft entsteht kein Meet-/Teams-Link: dann gehört der Video-Link (z. B. Webex) dazu (Ole, 21.11.2026:
        // „Lohmann hat im Onboarding gar keinen Webex-Link hinterlegt“).
        // App-Kalender: erst mit bestätigter Test-Einladung (IT-Filter der Konzernadresse, 22.11.2026)
        // Schon live (z. B. Lohmann): Test-Einladung nicht nachträglich verlangen (22.11.2026)
        done: kalenderSchrittFertig(ob.customer, !!skip("calendar"), !!skip(EINLADUNG_TEST_KEY) || !!ob.liveAt),
        at: null,
      },
      {
        key: "mailbox",
        label: "E-Mail-Postfach verbunden",
        owner: "kunde",
        // Verbunden (ein Login reicht) oder „Meine Gesellschaft erlaubt das nicht“ (E-Mail-Funktionen aus)
        done: ob.customer.mailFeaturesOff || ob.customer.users.some((u) => !!u.mailConnection),
        at: null,
      },
      {
        key: "whatsapp",
        label: "WhatsApp-Nummer verbunden",
        owner: selfConnectEnabled() ? "kunde" : "du",
        done: ob.customer.whatsAppAccount?.status === "connected" || !!skip("whatsapp"),
        at: null,
      },
      {
        // Erstinformation (§ 15/16 VersVermV): der Assistent schickt sie als PDF beim ersten Kontakt (lib/erstinformation.ts)
        key: "erstinfo",
        label: "Erstinformation vollständig (Pflichtangaben nach § 15 VersVermV bestätigt oder eigenes PDF)",
        owner: "kunde",
        done: erstinfoOk,
        at: ob.customer.erstinformation?.bestaetigtAt ?? null,
      },
      // P8/M9 (Ole, 17.11.2026): „So arbeitet Ihr Assistent“ (mit „Weiter“ gesehen) und „Service-Mails in Ihrem Namen“
      // (bestätigt bzw. E-Mail-Funktionen aus). Nach dem Livegang gelten beide als erledigt (dauerhaft unter
      // Einstellungen → Assistent erreichbar), damit bestehende Kunden keine neuen offenen Schritte bekommen.
      {
        key: "assistent",
        label: "So arbeitet Ihr Assistent angesehen",
        owner: "kunde",
        done: !!skip("assistent") || !!ob.liveAt,
        at: null,
      },
      // Ole, 21.11.2026: Merkblatt „Einwände im Termin“ lesen (mit „Gelesen“ bestätigt). Nach dem Livegang erledigt,
      // damit bestehende Kunden keinen neuen offenen Schritt bekommen (Merkblatt bleibt auf der Präsentationsseite).
      {
        key: "einwaende",
        label: "Merkblatt Einwände gelesen",
        owner: "kunde",
        done: !!skip("einwaende") || !!ob.liveAt,
        at: null,
      },
      {
        key: "serviceMails",
        label: "Service-Mails in Ihrem Namen bestätigt",
        owner: "kunde",
        done: ob.customer.mailFeaturesOff || !!leseMailAblauf(ob.customer.mailAblauf).bestaetigtAt || !!ob.liveAt,
        at: null,
      },
      // Kranken, BU und Leben (Ole, 21.11.2026): AVV-Ergänzung zustimmen (Datenschutz-URL setzt die App), sonst nimmt der
      // Assistent nur Sachversicherungen an. „Brauche ich nicht“ überspringt den Schritt. Nur, wenn Policen per WhatsApp
      // eingerichtet sind (Ablage, kein Notschalter).
      ...(policenGesundheitMoeglich()
        ? [
            {
              key: "policenGesundheit",
              label: "Policen aus Kranken, BU und Leben freigeschaltet",
              owner: "kunde",
              done: gesundheitFreigegeben(ob.customer) || !!skip("policenGesundheit"),
              at: ob.customer.policenAvvZugestimmtAt ?? null,
            } satisfies ChecklistItem,
          ]
        : []),
      {
        key: "templates",
        // Ohne freigegebene Vorlage darf WhatsApp neue Leads nicht anschreiben.
        label:
          (ob.customer.messageTemplates?.length ?? 0) > 0
            ? "WhatsApp-Vorlage fürs Erstanschreiben von Meta freigegeben"
            : "WhatsApp-Vorlage fürs Erstanschreiben noch nicht freigegeben: Assistent kann Leads noch nicht anschreiben",
        owner: "auto",
        done: (ob.customer.messageTemplates?.length ?? 0) > 0,
        at: null,
      },
      ...(kampagnen ? [{
        key: "consent",
        // Einwilligung zur Kontaktaufnahme im Leadformular: die Formulare legen wir an (Ole, 13.11.2026),
        // also unser Schritt – erledigt mit der Kampagne oder per Admin-Bestätigung
        label: "Einwilligung im Leadformular enthalten",
        owner: "du",
        done: !!ob.consentAt || !!ob.consentConfirmedAt || !!ob.campaignReadyAt,
        at: ob.consentConfirmedAt ?? ob.consentAt,
        manual: "consent" as const,
      } satisfies ChecklistItem] : []),
    );
  }
  // Schritte nur für gebuchte Module bzw. ein Team (Ole, 15.11.2026)
  if (ob.customer.existingCustomersEnabled) {
    items.push({ key: "bestandImport", label: "Kundenliste hochgeladen", owner: "kunde", done: ob.customer._count.existingCustomers > 0 || !!skip("bestandImport"), at: null });
  }
  if (ob.customer.empfehlungEnabled) {
    items.push({ key: "reviewLink", label: "Google-Bewertungslink hinterlegt", owner: "kunde", done: !!ob.customer.reviewSettings?.googleReviewUrl || !!skip("reviewLink"), at: null });
  }
  if (ob.customer.seatsBilled > 0) {
    items.push({ key: "team", label: "Team eingeladen", owner: "kunde", done: ob.customer.users.length > 1 || !!skip("team"), at: null });
  }
  if (kampagnen) {
    items.push(
      {
        key: "website",
        label: "Pflichtangaben (Impressum) geprüft",
        owner: "du",
        done: !!ob.websiteCheckedAt || ohneWebsite,
        at: ob.websiteCheckedAt,
        manual: "website",
        ...(ohneWebsite ? { note: ERSTINFO_STATT_WEBSITE } : {}),
      },
      { key: "campaign", label: "Kampagne und Leadformular angelegt", owner: "du", done: !!ob.campaignReadyAt, at: ob.campaignReadyAt, manual: "campaign" },
      { key: "testLead", label: "Testlead durchgespielt", owner: "du", done: !!ob.testLeadAt, at: ob.testLeadAt, manual: "testLead" },
    );
  }
  items.push({ key: "live", label: "Live", owner: "du", done: !!ob.liveAt, at: ob.liveAt });
  // Von uns für den Kunden abgehakt (Kundenakte, Ole 20.11.2026): zählt überall als erledigt
  for (const it of items) if (!it.done && vonUnsAbgehakt(ob.stepSkips, it.key)) it.done = true;
  return items;
}

export function checklistProgress(items: ChecklistItem[]) {
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, percent: Math.round((done / items.length) * 100) };
}

/** Schritte, die der Kunde in der Einrichtung selbst erledigt (Reihenfolge wie auf der Einrichtungsseite). */
export const CUSTOMER_SETUP_KEYS = ["questionnaire", "app", "calendar", "mailbox", "provision", "erstinfo", "assistent", "einwaende", "serviceMails", "policenGesundheit", "metaAccess", "whatsapp", "bestandImport", "reviewLink", "team"] as const;

/** Übersprungene Schritte (Onboarding.stepSkips): Grund und Zeitpunkt je Schritt. */
export type StepSkip = { at: string; reason: string };
export const STEP_SKIP_KEYS = ["calendar", "whatsapp", "bestandImport", "reviewLink", "team", "policenGesundheit"] as const;
export type StepSkipKey = (typeof STEP_SKIP_KEYS)[number];
export function stepSkipOf(raw: unknown, key: string): StepSkip | null {
  if (!raw || typeof raw !== "object") return null;
  const v = (raw as Record<string, unknown>)[key];
  return v && typeof v === "object" && typeof (v as StepSkip).reason === "string" ? (v as StepSkip) : null;
}
/**
 * Von uns in der Kundenakte für den Kunden abgehakt (Ole, 20.11.2026: z. B. im Kickoff gemeinsam erledigt).
 * Gespeichert in stepSkips mit Grund „admin“. Gilt für alle Schritte ohne eigenes Datumsfeld (MANUAL_FIELDS).
 */
export const ADMIN_ABGEHAKT = "admin";
export const vonUnsAbgehakt = (raw: unknown, key: string) => stepSkipOf(raw, key)?.reason === ADMIN_ABGEHAKT;
/** Schritte, die wir nicht abhaken (ergeben sich nur aus echten Daten bzw. haben eigene Knöpfe). */
export const NICHT_ABHAKBAR = ["welcome", "payment", "templates", "live"] as const;
/** App installiert / Provisionen hinterlegt: keine Checklisten-Punkte, kommen von außen dazu. */
export type CustomerExtras = { appDone: boolean; provisionDone: boolean };
/** Unser Teil, dem Kunden nur zur Information gezeigt (nicht im Fortschrittsbalken). */
export const OUR_SETUP_KEYS = ["campaign", "testLead", "live"] as const;

/**
 * Fortschritt aus Sicht des Kunden: nur Schritte, die er aktiv erledigt (Fragebogen, Meta-Zugriff,
 * Kalender, WhatsApp beim Selbst-Verbinden). Zahlung, Login und Willkommens-Mail zählen nicht,
 * unsere Schritte (Kampagne, Testlead, Go-live) stehen getrennt in `ours`.
 * Admin-Ansichten nutzen weiter `checklistProgress` (alle Punkte).
 */
export function customerSetupProgress(items: ChecklistItem[], extras?: CustomerExtras) {
  // Eine Zählung für Startkarte, Einrichtungsseite und Menü (Ole, 13.11.2026): nur, was der Kunde selbst tut
  const extra: ChecklistItem[] = extras
    ? [
        { key: "app", label: "App aufs Handy und Mitteilungen", owner: "kunde", done: extras.appDone, at: null },
        { key: "provision", label: "Provisionen hinterlegen", owner: "kunde", done: extras.provisionDone, at: null },
      ]
    : [];
  const all = [...items, ...extra];
  const steps = CUSTOMER_SETUP_KEYS.map((k) => all.find((i) => i.key === k && i.owner === "kunde")).filter(
    (i): i is ChecklistItem => !!i,
  );
  const done = steps.filter((i) => i.done).length;
  const total = steps.length;
  // WhatsApp ohne Selbst-Verbinden (kein 360dialog-Partnerzugang): machen wir – dann unter „Unser Teil“ zeigen
  const waOurs = items.find((i) => i.key === "whatsapp" && i.owner !== "kunde");
  const ours = [...(waOurs ? [waOurs] : []), ...OUR_SETUP_KEYS.map((k) => items.find((i) => i.key === k)).filter((i): i is ChecklistItem => !!i)];
  return {
    steps,
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 100,
    complete: done === total,
    open: steps.filter((i) => !i.done),
    ours,
  };
}

/** Fortschritt mehrerer Onboardings (für Übersichten), Schlüssel = customerId. */
export async function onboardingProgressFor(customerIds: string[]) {
  if (customerIds.length === 0) return new Map<string, { percent: number; live: boolean; waitingCustomer: number; waitingYou: number }>();
  const rows = await prisma.onboarding.findMany({
    where: { customerId: { in: customerIds } },
    include: {
      customer: { include: ONBOARDING_CUSTOMER_INCLUDE },
    },
  });
  const offers = await prisma.offer.findMany({
    where: { id: { in: rows.map((r) => r.offerId).filter(Boolean) as string[] } },
    select: { id: true, paymentStatus: true, paidAt: true, isTest: true },
  });
  const map = new Map<string, { percent: number; live: boolean; waitingCustomer: number; waitingYou: number }>();
  for (const r of rows) {
    const items = onboardingChecklist(r, offers.find((o) => o.id === r.offerId) ?? null);
    const open = items.filter((i) => !i.done);
    map.set(r.customerId, {
      percent: checklistProgress(items).percent,
      live: !!r.liveAt,
      waitingCustomer: open.filter((i) => i.owner === "kunde").length,
      waitingYou: open.filter((i) => i.owner === "du").length,
    });
  }
  return map;
}

/** Offene Schritte, die der Kunde selbst erledigen muss (0 = kein Onboarding bzw. fertig). */
export async function customerSetupOpenCount(customerId: string): Promise<number> {
  const ob = await loadOnboarding({ customerId });
  if (!ob || ob.status === "cancelled") return 0;
  const offer = ob.offerId ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { paymentStatus: true, paidAt: true, isTest: true } }) : null;
  const progress = customerSetupProgress(onboardingChecklist(ob, offer), await customerExtras(customerId));
  // Nach dem Livegang zählen nur noch die Software-Schritte (z. B. WhatsApp nach einem Paketwechsel, Ole 13.11.2026);
  // Nur Betreuung: nach dem Livegang nichts mehr offen
  if (ob.liveAt && ob.package === "service") return 0;
  return progress.open.filter((i) => !ob.liveAt || LIVE_SETUP_KEYS.has(i.key)).length;
}

/** Schritte, die auch nach dem Livegang in der Einrichtung offen bleiben. */
const LIVE_SETUP_KEYS = new Set(["questionnaire", "app", "calendar", "provision", "whatsapp", "erstinfo"]);

/** App installiert (Push-Anmeldung eines Logins) und eigene Provisionssätze hinterlegt. */
export async function customerExtras(customerId: string): Promise<CustomerExtras> {
  const users = await prisma.user.findMany({ where: { customerId, role: "BUYER" }, select: { id: true } });
  const [push, provision, ob] = await Promise.all([
    users.length ? prisma.pushSubscription.count({ where: { userId: { in: users.map((u) => u.id) } } }) : 0,
    loadCustomerProvision(customerId),
    prisma.onboarding.findUnique({ where: { customerId }, select: { appSkippedAt: true, stepSkips: true } }),
  ]);
  return { appDone: push > 0 || !!ob?.appSkippedAt, provisionDone: provision.confirmed || vonUnsAbgehakt(ob?.stepSkips, "provision") };
}

/**
 * Einrichtung neu starten (z. B. Bestandskunde wechselt auf Betreuung + Software, Ole 13.11.2026):
 * Fragebogen und Einwilligung wieder offen; Kalender und WhatsApp sind ohnehin offen, solange nicht
 * verbunden. Meta-Zugriff, Kampagne, Testlead und Livegang bleiben erledigt – Leads und Daten unberührt.
 */
export async function restartSetup(customerId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const opened = await openSetupForExisting(customerId);
  if (!opened.ok) return opened;
  const ob = await prisma.onboarding.findUnique({ where: { customerId } });
  if (!ob) return { ok: false, error: "Keine Einrichtung gefunden." };
  const now = new Date();
  await prisma.onboarding.update({
    where: { id: ob.id },
    data: {
      status: "running",
      questionnaireAt: null,
      consentAt: null,
      consentConfirmedAt: null,
      setupReminders: Prisma.DbNull,
      metaAccessAt: ob.metaAccessAt ?? now,
      websiteCheckedAt: ob.websiteCheckedAt ?? now,
      campaignReadyAt: ob.campaignReadyAt ?? now,
      testLeadAt: ob.testLeadAt ?? now,
      liveAt: ob.liveAt ?? now,
    },
  });
  return { ok: true };
}

/**
 * Einrichtung für einen Bestandskunden ohne Onboarding freischalten (z. B. Kunden aus der Zeit
 * vor dem Onboarding oder Testkunden): legt ein bereits live geschaltetes Onboarding an, sodass nur
 * die Software-Schritte offen sind (Kalender, WhatsApp, Einwilligung, App, Provisionen).
 * Keine Willkommens-Mail, keine Erinnerungen (die laufen nur vor dem Livegang).
 */
export async function openSetupForExisting(customerId: string): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { plan: true, onboarding: { select: { id: true } } } });
  if (!customer) return { ok: false, error: "Kunde nicht gefunden." };
  if (customer.onboarding) return { ok: true, created: false };
  const now = new Date();
  await prisma.onboarding.create({
    data: {
      customerId,
      package: normalizePackage(customer.plan),
      status: "running",
      welcomeSentAt: now,
      questionnaireAt: now,
      metaAccessAt: now,
      websiteCheckedAt: now,
      campaignReadyAt: now,
      testLeadAt: now,
      liveAt: now,
    },
  });
  return { ok: true, created: true };
}

/** Mail „Ihre Kampagne ist live“ – beim Live-Schalten im Admin. */
export async function sendGoLiveMail(onboardingId: string) {
  const ob = await prisma.onboarding.findUnique({
    where: { id: onboardingId },
    include: { customer: { include: { users: { where: { role: "BUYER" }, select: { email: true } } } } },
  });
  if (!ob) return;
  const to = ob.customer.users.map((u) => u.email);
  if (to.length === 0) return;
  const offer = ob.offerId ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { contactName: true } }) : null;
  const software = mitSoftware(ob.package);
  const q = (ob.questionnaire ?? {}) as { leadEmails?: string[] };
  const greeting = await customerGreeting({ salesContactId: ob.salesContactId, contactName: offer?.contactName ?? null });
  if (!mitKampagnen(ob.package)) {
    // Pay-per-Lead + Software: keine Kampagne, der Assistent übernimmt die bestellten Leads
    const r = await sendCustomerMail({
      to,
      subject: "Ihr Assistent ist startklar",
      greeting,
      paragraphs: [
        "alles ist eingerichtet. Jeder Lead, den Sie per Pay-per-Lead bekommen, erhält ab jetzt innerhalb weniger Minuten eine WhatsApp-Nachricht von Ihrem digitalen Assistenten und kann direkt einen Termin in Ihrem Kalender buchen.",
        "Leads bestellen Sie wie gewohnt im Kundenbereich unter „Wachstum“. Unter „Heute“ sehen Sie, wen Sie anrufen sollten.",
        "Tipp: Installieren Sie den Kundenbereich auf Ihrem Handy (im Browser „Zum Startbildschirm hinzufügen“). Dann haben Sie neue Leads immer dabei.",
      ],
      button: { label: "Zum Kundenbereich", url: `${getAppUrl()}/buyer` },
    });
    if (!r.ok) reportError(new Error(r.error), "onboarding-golive-mail", { onboarding: ob.id });
    return;
  }
  const res = await sendCustomerMail({
    to,
    subject: "Ihre Kampagne ist live 🚀",
    greeting,
    paragraphs: [
      "alles ist eingerichtet, Ihre Anzeigen laufen ab sofort. Die ersten Leads kommen in der Regel innerhalb von 1–3 Tagen.",
      software
        ? "Neue Leads bekommen innerhalb weniger Minuten eine WhatsApp-Nachricht von Ihrem digitalen Assistenten und können direkt einen Termin in Ihrem Kalender buchen. Im Kundenbereich sehen Sie unter „Heute“, wen Sie anrufen sollten."
        : `Jeder neue Lead kommt sofort per E-Mail${q.leadEmails?.length ? ` an ${q.leadEmails.join(", ")}` : ""} und steht im Kundenbereich unter „Leads“. Am besten rufen Sie innerhalb der ersten Minuten an.`,
      "Tipp: Installieren Sie den Kundenbereich auf Ihrem Handy (im Browser „Zum Startbildschirm hinzufügen“). Dann haben Sie neue Leads immer dabei.",
    ],
    button: { label: "Zum Kundenbereich", url: `${getAppUrl()}/buyer` },
  });
  if (!res.ok) reportError(new Error(res.error), "onboarding-golive-mail", { onboarding: ob.id });
}

/**
 * Konditionen aus dem Angebot an den Kunden: inklusive Logins, Preis je
 * weiterem Login (im Abo zunächst die vereinbarte Zahl), Zahlweise und das
 * Bestandskunden-Modul (schaltet den Bereich „Bestand“ frei).
 */
function billingTermsOf(offer: {
  vermittlerTyp: string;
  seats: number | null;
  seatsIncluded: number | null;
  seatMonthly: unknown;
  bestandMonthly: unknown;
  empfehlungMonthly?: unknown;
  annualPrepay: boolean;
  /** Geschenkte Monate laut Angebot (null = Standard der Laufzeit) */
  annualFreeMonths?: number | null;
  /** Laufzeit: Vorauszahlung mit 6 Monaten = halbjährlich, sonst jährlich */
  term?: string | null;
  allowBankTransfer?: boolean;
  bankTransferDays?: number;
  zahlweise?: string | null;
  startDate?: Date | null;
  billingDay?: number | null;
}) {
  // Abrechnungstag (lib/abrechnungstag.ts): Tag und erster Abrechnungstag an den Kunden (Laufzeit und Kündigung zählen ab dann).
  // Vorauszahlung: Abrechnungstag gilt nicht (voller Betrag zum Start, Zeitraum ab Start), daher keiner gespeichert.
  const billingDay = offer.annualPrepay ? null : (offer.billingDay ?? null);
  const startIso = offer.startDate ? offer.startDate.toISOString().slice(0, 10) : null;
  const firstBillingIso = startIso ? ersterAbrechnungstag(startIso, billingDay) : null;
  const seatsBilled = offer.seats != null && offer.seatsIncluded != null && Number(offer.seatMonthly ?? 0) > 0
    ? Math.max(0, offer.seats - offer.seatsIncluded)
    : 0;
  return {
    // Makler-Angebot → Kunde ist Makler (Provisionssätze, Vertrags-Garantie)
    ...(offer.vermittlerTyp === "makler" ? { vermittlerTyp: "makler" } : {}),
    ...(offer.seatsIncluded != null ? { seatsIncluded: offer.seatsIncluded, seatMonthly: offer.seatMonthly == null ? null : Number(offer.seatMonthly), seatsBilled } : {}),
    billingInterval: rhythmusFuer(offer.term, offer.annualPrepay),
    // Freimonate wie im angenommenen Angebot einfrieren (Standard kann sich ändern, lib/offer-pricing.ts freimonateKunde)
    prepayFreeMonths: offer.annualPrepay ? (offer.annualFreeMonths ?? prepayFreeMonthsFor(offer.term)) : null,
    ...(offer.bestandMonthly != null ? { bestandMonthly: Number(offer.bestandMonthly), existingCustomersEnabled: true, bestandRequestedAt: null } : {}),
    // Empfehlungen & Bewertungen im Angebot: ab Start freigeschaltet und berechnet (keine Testphase)
    ...(offer.empfehlungMonthly != null
      ? { empfehlungMonthly: Number(offer.empfehlungMonthly), empfehlungEnabled: true, empfehlungSince: new Date(), empfehlungCancelAt: null }
      : {}),
    // Überweisung nur auf Anfrage (lib/ueberweisung.ts): Freigabe und Zahlungsziel gehen an den Kunden über
    ...(offer.allowBankTransfer ? { allowBankTransfer: true, bankTransferDays: offer.bankTransferDays ?? 14 } : {}),
    ...(offer.zahlweise === "ueberweisung" ? { zahltPerUeberweisung: true } : {}),
    ...(offer.startDate ? { billingDay, billingStart: firstBillingIso ? new Date(`${firstBillingIso}T12:00:00Z`) : null } : {}),
  };
}
