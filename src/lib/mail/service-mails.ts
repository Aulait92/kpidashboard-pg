// Erklärschritt „Service-Mails in Ihrem Namen“ (Ole, 17.11.2026, Paket M9, Einstellungen → Assistent): Vorschau einer
// echten Terminbestätigung aus denselben Funktionen wie der Versand (content("booked"), leadEmailBody, leadSignatur
// bzw. Postfach-Signatur, leadAnzeigename) und die Signaturangaben aus der Erstinformation.

import { prisma } from "@/lib/prisma";
import { asAnsprache } from "@/lib/ansprache";
import { erstinfoDaten, type ErstinfoWeb } from "@/lib/erstinformation-shared";
import { publicBaseOrNull } from "@/lib/public-url";
import { content, leadEmailBody } from "@/lib/calendar/lead-email";
import { leadAnzeigename, leadMailAdresse, leadSignatur, postfachSignatur } from "@/lib/mail/lead-absender";
import { leadVersandKontext } from "@/lib/mail/lead-versand";
import { vermittlerName } from "@/lib/whatsapp/gespraech";
import type { CustomerEvent } from "@/lib/calendar/add-to-calendar";

/** Angaben für die Signatur (wie in der Erstinformation). */
export type SignaturAngaben = { name: string; firma: string; telefon: string; anschrift: string };
export const SIGNATUR_FELDER: { key: keyof SignaturAngaben; label: string }[] = [
  { key: "name", label: "Vor- und Nachname" },
  { key: "firma", label: "Agentur bzw. Firma" },
  { key: "telefon", label: "Telefon" },
  { key: "anschrift", label: "Anschrift" },
];

const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/** Gespeicherte bzw. vorgeschlagene Signaturangaben (Erstinformation, Impressum). */
export async function signaturAngaben(customerId: string): Promise<SignaturAngaben> {
  const [record, customer] = await Promise.all([
    prisma.erstinformation.findUnique({ where: { customerId }, select: { name: true, firma: true, anschrift: true, telefon: true } }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { name: true, vermittlerTyp: true, onboarding: { select: { websiteInfo: true } } } }),
  ]);
  const d = erstinfoDaten(record, (customer?.onboarding?.websiteInfo ?? undefined) as ErstinfoWeb | undefined, { name: customer?.name, vermittlerTyp: customer?.vermittlerTyp });
  return { name: d.name, firma: d.firma, telefon: d.telefon, anschrift: (record?.anschrift ?? d.anschrift ?? "").trim() };
}

/** Welche Angaben fehlen (rein). */
export function fehlendeAngaben(a: SignaturAngaben): (keyof SignaturAngaben)[] {
  return SIGNATUR_FELDER.map((f) => f.key).filter((k) => !clean(a[k]));
}

export type ServiceMailVorschau = {
  /** Anzeigename „Ole Kannapinn | Kannapinn Versicherungen“ bzw. Name des Postfachs */
  von: string;
  /** Technische Adresse (Versanddomain bzw. Postfach) */
  adresse: string | null;
  postfach: boolean;
  subject: string;
  html: string;
};

/** Beispiel-Termin morgen um 10 Uhr (Berlin), als Videotermin. */
function beispielTermin(advisorName: string, now: Date): CustomerEvent {
  const tag = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now.getTime() + 86_400_000));
  // 10:00 Berlin: 09:00 UTC im Winter, 08:00 UTC im Sommer
  const probe = new Date(`${tag}T09:00:00Z`);
  const stunde = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(probe));
  const start = new Date(probe.getTime() - (stunde - 10) * 3_600_000);
  const base = publicBaseOrNull() ?? "https://app.performancegrowth.de";
  return {
    uid: "beispiel",
    start,
    end: new Date(start.getTime() + 30 * 60_000),
    summary: "Videoberatung",
    description: "",
    location: "",
    manageUrl: `${base}/book/manage/beispiel`,
    token: "beispiel",
    advisorName,
    mode: "video",
    videoUrl: `${base}/termin/beispiel`,
  };
}

/**
 * Vorschau der Terminbestätigung an „Julia Schneider“ mit den Angaben dieses Kunden. `angaben` überschreibt
 * Name, Firma, Telefon und Anschrift (Live-Vorschau beim Ausfüllen).
 */
export async function serviceMailVorschau(customerId: string, o: { userId?: string | null; angaben?: Partial<SignaturAngaben>; now?: Date } = {}): Promise<ServiceMailVorschau> {
  const [k, c] = await Promise.all([
    leadVersandKontext(customerId, { schreiber: o.userId ?? null, nurLesen: true }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { leadAddress: true } }),
  ]);
  const an = asAnsprache(c?.leadAddress);
  const a = o.angaben ?? {};
  const daten = {
    ...k.daten,
    ...(clean(a.name) ? { name: clean(a.name) } : {}),
    ...(clean(a.firma) ? { agentur: clean(a.firma) } : {}),
    ...(clean(a.telefon) ? { telefon: clean(a.telefon) } : {}),
    ...(a.anschrift?.trim() ? { anschrift: a.anschrift.trim() } : {}),
  };
  const postfach = k.postfach ? await prisma.mailConnection.findUnique({ where: { userId: k.postfach.userId }, select: { email: true, fromName: true } }) : null;
  const sig = (k.postfach ? postfachSignatur(k.postfach.signatur) : null) ?? leadSignatur(daten);
  const person = vermittlerName(an, { name: clean(a.name) || k.vermittler.name, anrede: k.vermittler.anrede, fallback: daten.name });
  const ev = beispielTermin(daten.name, o.now ?? new Date());
  const inhalt = content("booked", ev, { fullName: "Julia Schneider", firstName: "Julia", lastName: "Schneider", salutation: "Frau" }, an, { person, erstinfoUrl: daten.erstinfoUrl, erstinfoPdf: false });
  const body = leadEmailBody(inhalt, ev, sig);
  return {
    von: postfach ? postfach.fromName?.trim() || postfach.email : leadAnzeigename(daten.name, daten.agentur),
    adresse: postfach ? postfach.email : leadMailAdresse(),
    postfach: !!postfach,
    subject: inhalt.subject,
    html: body.html,
  };
}
