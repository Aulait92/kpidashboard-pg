// iPhone-App: App-Anmeldung je Login merken, Einrichtungsschritt, Hinweiskarte und Kennzahlen (lib/app-store.ts).

import { prisma } from "@/lib/prisma";
import { appHinweisArt, geraetAusUserAgent, istAppUserAgent, istIphoneUserAgent, type AppHinweisArt } from "@/lib/app-store";

/**
 * Bei jeder Seite im Kundenbereich: erste Anmeldung in der App und erstes iPhone merken (je Login, nur einmal).
 * `stand` = schon geladene Felder, damit im Normalfall gar nicht geschrieben wird.
 */
export async function merkeGeraet(userId: string, ua: string | null | undefined, stand?: { appLoginAt: Date | null; iphoneSeenAt: Date | null } | null): Promise<void> {
  const app = istAppUserAgent(ua);
  const iphone = istIphoneUserAgent(ua);
  if (!app && !iphone) return;
  const now = new Date();
  if (app && !stand?.appLoginAt) await prisma.user.updateMany({ where: { id: userId, appLoginAt: null }, data: { appLoginAt: now } });
  if (iphone && !stand?.iphoneSeenAt) await prisma.user.updateMany({ where: { id: userId, iphoneSeenAt: null }, data: { iphoneSeenAt: now } });
}

/** Mindestens ein Login des Kunden hat sich in der App angemeldet (oder hat ein Gerät der App für Mitteilungen). */
export async function appAngemeldetFuerKunde(customerId: string): Promise<boolean> {
  const n = await prisma.user.count({
    where: { customerId, role: "BUYER", OR: [{ appLoginAt: { not: null } }, { deviceTokens: { some: {} } }] },
  });
  return n > 0;
}

/**
 * Einrichtungsschritt „App aufs Handy“ erledigt (Ole, 24.11.2026): Anmeldung in der App oder „Ich habe kein iPhone“
 * (Onboarding.appSkippedAt). Web-Push eines Logins zählt weiter, damit bei Bestandskunden kein erledigter Schritt
 * wieder aufgeht.
 */
export async function appSchrittErledigt(customerId: string): Promise<boolean> {
  const ob = await prisma.onboarding.findUnique({ where: { customerId }, select: { appSkippedAt: true } });
  if (ob?.appSkippedAt) return true;
  if (await appAngemeldetFuerKunde(customerId)) return true;
  const users = await prisma.user.findMany({ where: { customerId, role: "BUYER" }, select: { id: true } });
  if (!users.length) return false;
  return (await prisma.pushSubscription.count({ where: { userId: { in: users.map((u) => u.id) } } })) > 0;
}

/** Hinweiskarte „iPhone-App“ auf der Startseite für diesen Login und dieses Gerät; null = keine. */
export async function ladeAppHinweis(userId: string, ua: string | null | undefined): Promise<AppHinweisArt | null> {
  const geraet = geraetAusUserAgent(ua);
  if (geraet === "app") return null;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { appLoginAt: true, iphoneSeenAt: true, appHinweisAusAt: true, _count: { select: { deviceTokens: true } } },
  });
  if (!u) return null;
  return appHinweisArt({
    geraet,
    appAngemeldet: !!u.appLoginAt || u._count.deviceTokens > 0,
    weggeklickt: !!u.appHinweisAusAt,
    iphoneGesehen: !!u.iphoneSeenAt || geraet === "iphone",
  });
}

export async function appHinweisWegklicken(userId: string): Promise<void> {
  await prisma.user.updateMany({ where: { id: userId, appHinweisAusAt: null }, data: { appHinweisAusAt: new Date() } });
}

export type AppKennzahlen = { logins: number; mitApp: number; mitPush: number; mitAppPush: number; quoteApp: number; quotePush: number };

/**
 * Admin: Logins von Software-Kunden (Kundenbereich, ohne Demo-/Testkunden nicht unterschieden) mit App-Anmeldung und
 * mit Push-Erlaubnis (Web-Push oder App-Gerät). `customerIds` = Software-Kunden.
 */
export async function appKennzahlen(customerIds: string[]): Promise<AppKennzahlen> {
  if (!customerIds.length) return { logins: 0, mitApp: 0, mitPush: 0, mitAppPush: 0, quoteApp: 0, quotePush: 0 };
  const users = await prisma.user.findMany({
    where: { role: "BUYER", customerId: { in: customerIds } },
    select: { id: true, appLoginAt: true, _count: { select: { deviceTokens: true } } },
  });
  const ids = users.map((u) => u.id);
  const web = ids.length ? await prisma.pushSubscription.findMany({ where: { userId: { in: ids } }, select: { userId: true }, distinct: ["userId"] }) : [];
  const webSet = new Set(web.map((w) => w.userId));
  const mitApp = users.filter((u) => !!u.appLoginAt || u._count.deviceTokens > 0).length;
  const mitAppPush = users.filter((u) => u._count.deviceTokens > 0).length;
  const mitPush = users.filter((u) => u._count.deviceTokens > 0 || webSet.has(u.id)).length;
  const q = (n: number) => (users.length ? Math.round((n / users.length) * 100) : 0);
  return { logins: users.length, mitApp, mitPush, mitAppPush, quoteApp: q(mitApp), quotePush: q(mitPush) };
}

/**
 * Kennzahlen für echte Software-Kunden (wie Diagnose nutzung-woche: nicht Test, nicht intern, nicht archiviert, keine
 * Demo, keine reinen Pay-per-Lead-Kunden). Für Admin › Qualität › Nutzung und Diagnose q=app-nutzung (nur Zahlen).
 */
export async function appKennzahlenSoftware(): Promise<AppKennzahlen> {
  const { AUSGESCHLOSSEN } = await import("@/lib/ops/nutzung-woche");
  const { NUR_PPL_WHERE } = await import("@/lib/customer-package");
  const basis = { isTest: false, archived: false, plan: { not: "internal" }, id: { notIn: AUSGESCHLOSSEN } };
  const ppl = new Set((await prisma.customer.findMany({ where: { AND: [basis, NUR_PPL_WHERE] }, select: { id: true } })).map((k) => k.id));
  const software = (await prisma.customer.findMany({ where: basis, select: { id: true } })).map((k) => k.id).filter((id) => !ppl.has(id));
  return appKennzahlen(software);
}
