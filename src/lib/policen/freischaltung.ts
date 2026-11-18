// Freischaltung Kranken/BU/Leben je Vermittler (Rechtsprüfung A5, Vorgabe Ole 18.11.2026): Karte „Policen aus Kranken,
// BU und Leben freischalten“ mit der AVV-Ergänzung (b). Zustimmung nur durch den Inhaber; gespeichert am Kunden
// (schnelle Prüfung) und als Nachweis in PolicenNachweis (nur anhängen: Kunde, Login, Zeitpunkt, Textversion).
// Die Datenschutzhinweise für seine Kunden sind die Seite /datenschutz/policen?k=<Token> mit seinen Anbieterangaben;
// ihre Adresse wird beim Zustimmen hinterlegt (policenDatenschutzUrl), sofern keine eigene eingetragen ist.
// Karte oben in der Terminvorbereitung und auf Heute, bis zugestimmt oder 3-mal „Später“, danach nur in den Einstellungen.

import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { firmDisplayName } from "@/lib/advisor-name";
import { AVV_POLICEN_VERSION, gesundheitFreigegeben, gesundheitNotAus, GESUNDHEIT_FREIGABE_SELECT } from "@/lib/policen/regeln";
import { avvPolicenAbsaetze, speicherAngabe } from "@/lib/policen/avv-text";

export const SPAETER_MAX = 3;

export type Freischaltung = {
  /** Karte zeigen: auf Heute bzw. in der Terminvorbereitung (karte) oder nur in den Einstellungen */
  karte: boolean;
  einstellungen: boolean;
  freigeschaltet: boolean;
  intern: boolean;
  zugestimmtAt: string | null;
  datenschutzUrl: string | null;
  avv: { titel: string; text: string }[];
};

type Ctx = { customerId: string; userId: string | null; preview: boolean; teamRole?: string | null; demo?: boolean };
const inhaber = (ctx: Ctx) => !!ctx.userId && !ctx.preview && !ctx.demo && ctx.teamRole !== "advisor";

async function avvFuer(customerId: string, name: string) {
  const erst = await prisma.erstinformation.findUnique({ where: { customerId }, select: { firma: true, name: true } }).catch(() => null);
  const vermittler = [erst?.name, erst?.firma || firmDisplayName(name)].filter(Boolean).join(", ") || name;
  return avvPolicenAbsaetze({ vermittler, speicher: speicherAngabe(process.env.POLICEN_S3_ENDPOINT) });
}

/** Was die Karte zeigt; null = gar nicht (kein Inhaber, Funktion aus, Notschalter). */
export async function ladeFreischaltung(ctx: Ctx): Promise<Freischaltung | null> {
  if (!inhaber(ctx) || gesundheitNotAus()) return null;
  const { policenAn } = await import("@/lib/policen/server");
  if (!policenAn()) return null;
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true, policenAvvSpaeter: true, ...GESUNDHEIT_FREIGABE_SELECT } });
  if (!c) return null;
  const intern = !!(c.policenIntern || c.isTest);
  const freigeschaltet = gesundheitFreigegeben(c);
  const zugestimmt = !!c.policenAvvZugestimmtAt && c.policenAvvVersion === AVV_POLICEN_VERSION;
  const datenschutzUrl =
    c.policenDatenschutzUrl ?? (await import("@/lib/policen/verantwortlicher").then((m) => m.policenDatenschutzUrl(ctx.customerId)).catch(() => null));
  return {
    karte: !intern && !zugestimmt && c.policenAvvSpaeter < SPAETER_MAX,
    einstellungen: true,
    freigeschaltet,
    intern,
    zugestimmtAt: zugestimmt ? c.policenAvvZugestimmtAt!.toISOString() : null,
    datenschutzUrl,
    avv: await avvFuer(ctx.customerId, c.name),
  };
}

/** „Zustimmen und einschalten“: Nachweis anhängen, Kunde freischalten, Datenschutzhinweis hinterlegen. */
export async function stimmeAvvZu(ctx: Ctx, now = new Date()): Promise<boolean> {
  if (!inhaber(ctx)) return false;
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true, policenDatenschutzUrl: true } });
  if (!c) return false;
  const url = c.policenDatenschutzUrl ?? (await import("@/lib/policen/verantwortlicher").then((m) => m.policenDatenschutzUrl(ctx.customerId)));
  const avv = await avvFuer(ctx.customerId, c.name);
  await prisma.policenNachweis.create({
    data: {
      customerId: ctx.customerId,
      phone: "",
      art: "avv_zustimmung",
      quelle: "vermittler",
      textVersion: AVV_POLICEN_VERSION,
      wortlaut: avv.map((x) => `${x.titel} ${x.text}`.trim()).join("\n\n"),
      datenschutzUrl: url,
      vermittlerUserId: ctx.userId,
      createdAt: now,
    },
  });
  await prisma.customer.update({
    where: { id: ctx.customerId },
    data: { policenAvvZugestimmtAt: now, policenAvvVersion: AVV_POLICEN_VERSION, policenAvvUserId: ctx.userId, policenDatenschutzUrl: url },
  });
  await audit("policen.avv_zustimmung", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: { version: AVV_POLICEN_VERSION }, actor: { id: ctx.userId, role: "BUYER" } });
  return true;
}

/** „Später“: Zähler hochzählen (ab 3 nur noch in den Einstellungen). */
export async function spaeterAvv(ctx: Ctx): Promise<boolean> {
  if (!inhaber(ctx)) return false;
  await prisma.customer.update({ where: { id: ctx.customerId }, data: { policenAvvSpaeter: { increment: 1 } } });
  return true;
}
