// Unternehmensverifizierung bei Meta (Ole, 27.11.2026): Meta verlangt für WhatsApp Flows (Policen-Formular,
// lib/policen/flow/server.ts) ein verifiziertes Business-Portfolio. 360dialog meldet den Stand je Nummer in der
// Partner-API (waba_account.fb_account_status: verified | not_verified …). Der WhatsApp-Cron gleicht ihn ab
// (eine Anfrage für alle Nummern, verifizierte täglich, offene alle 6 Std.) und speichert ihn am WhatsApp-Konto;
// Seiten lesen nur den gespeicherten Stand. Wird ein Konto verifiziert, legt der nächste Cron-Lauf den gesperrten Flow
// sofort wieder an (Backoff aufgehoben).
// Anzeige: Einrichtung (Schritt „WhatsApp verbinden“) und „Heute“ (Hinweise), nur wenn das Formular für den Kunden
// überhaupt in Frage kommt (Policen an, Flow-Schalter an, Kunde erlaubt, kein Pay-per-Lead). Offen nur, wenn Meta das
// Formular tatsächlich sperrt (PolicenFlow meta_gesperrt) und das Unternehmen nicht verifiziert ist: Prod 27.11.2026 hat
// auch nicht verifizierte Konten mit veröffentlichtem Flow (dann kein Hinweis, er wäre unehrlich). Unbekannter Stand
// zeigt nichts (kein Fehlalarm).

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { listPartnerChannels, partnerConfig, type PartnerChannel } from "@/lib/whatsapp/dialog360-partner";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { NUR_PPL_WHERE } from "@/lib/customer-package";
import { metaVerifiziert, STATUS_META_GESPERRT } from "@/lib/policen/flow/meta-sperre";

export const META_VERIFIZIERUNG_URL = "https://business.facebook.com/settings/security";
const HOUR = 60 * 60 * 1000;
export const ABGLEICH_VERIFIZIERT_MS = 24 * HOUR;
export const ABGLEICH_OFFEN_MS = 6 * HOUR;

type Konto = { customerId: string; dialog360ChannelId: string | null; wabaId: string | null; metaBusinessStatus: string | null; metaBusinessCheckedAt: Date | null };

/** Nummer des Kontos in der Partner-Liste: Channel-ID, sonst WABA-ID, sonst die neueste Nummer mit unserer Kunden-ID. */
export function kanalFuerKonto(channels: PartnerChannel[], k: Pick<Konto, "customerId" | "dialog360ChannelId" | "wabaId">): PartnerChannel | null {
  return (
    (k.dialog360ChannelId ? channels.find((c) => c.id === k.dialog360ChannelId) : undefined) ??
    (k.wabaId ? channels.find((c) => c.wabaExternalId === k.wabaId) : undefined) ??
    channels.find((c) => c.partnerPayload === k.customerId) ??
    null
  );
}

/** Fällig für den Abgleich? Nie geprüft, verifiziert nach 24 Std., sonst nach 6 Std. */
export function abgleichFaellig(k: Pick<Konto, "metaBusinessStatus" | "metaBusinessCheckedAt">, now: Date): boolean {
  if (!k.metaBusinessCheckedAt) return true;
  const abstand = metaVerifiziert(k.metaBusinessStatus) ? ABGLEICH_VERIFIZIERT_MS : ABGLEICH_OFFEN_MS;
  return now.getTime() - k.metaBusinessCheckedAt.getTime() >= abstand;
}

/**
 * Im WhatsApp-Cron: Stand der Unternehmensverifizierung für alle verbundenen 360dialog-Konten nachziehen (nur wenn
 * eines fällig ist; eine Anfrage an die Partner-API). Neu verifiziert: Sperre des Policen-Flows sofort aufheben.
 */
export async function syncMetaVerifizierung(now = new Date(), o: { erzwingen?: boolean } = {}): Promise<{ geprueft: number; neuVerifiziert: number } | null> {
  const cfg = partnerConfig();
  if (!cfg) return null;
  const konten: Konto[] = await prisma.whatsAppAccount.findMany({
    where: { status: "connected", provider: "360dialog", customerId: { not: SUPPORT_CUSTOMER_ID } },
    select: { customerId: true, dialog360ChannelId: true, wabaId: true, metaBusinessStatus: true, metaBusinessCheckedAt: true },
    take: 500,
  });
  if (!o.erzwingen && !konten.some((k) => abgleichFaellig(k, now))) return { geprueft: 0, neuVerifiziert: 0 };
  let channels: PartnerChannel[];
  try {
    channels = await listPartnerChannels(cfg);
  } catch (e) {
    reportError(e, "meta-verifizierung-abgleich");
    return null;
  }
  let geprueft = 0;
  let neuVerifiziert = 0;
  for (const k of konten) {
    const ch = kanalFuerKonto(channels, k);
    // Nicht in der Liste (älter als die 200 neuesten Nummern): Stand behalten, nur als geprüft merken
    const status = ch?.fbAccountStatus ?? k.metaBusinessStatus;
    await prisma.whatsAppAccount.update({
      where: { customerId: k.customerId },
      data: { metaBusinessStatus: status, ...(ch?.businessName ? { metaBusinessName: ch.businessName } : {}), metaBusinessCheckedAt: now },
    });
    geprueft++;
    if (metaVerifiziert(status) && !metaVerifiziert(k.metaBusinessStatus)) {
      neuVerifiziert++;
      await flowSperreAufheben(k.customerId);
    }
  }
  return { geprueft, neuVerifiziert };
}

/** Backoff des Policen-Flows aufheben: der nächste Cron-Lauf legt ihn sofort an. */
export async function flowSperreAufheben(customerId: string): Promise<void> {
  await prisma.policenFlow.updateMany({ where: { customerId, status: STATUS_META_GESPERRT }, data: { naechsterVersuchAt: null, checkedAt: null } });
}

export type MetaVerifizierungStand = "offen" | "erledigt";

/**
 * Anzeige-Logik (rein): null = nichts zeigen. Nur mit verbundener Nummer, wenn das Formular für den Kunden in Frage
 * kommt, und nur bei bekanntem Stand.
 */
export function metaVerifizierungAnzeige(o: { verbunden: boolean; formularMoeglich: boolean; metaStatus: string | null | undefined; flowGesperrt: boolean }): MetaVerifizierungStand | null {
  if (!o.verbunden || !o.formularMoeglich || !o.metaStatus) return null;
  if (metaVerifiziert(o.metaStatus)) return "erledigt";
  return o.flowGesperrt ? "offen" : null;
}

/** Stand für einen Kunden aus dem gespeicherten Wert (kein Live-Abruf). */
export async function ladeMetaVerifizierung(customerId: string): Promise<MetaVerifizierungStand | null> {
  const { flowSchalterAn, flowKundeErlaubt } = await import("@/lib/policen/flow/server");
  if (!flowSchalterAn() || !flowKundeErlaubt(customerId)) return null;
  const { policenAn } = await import("@/lib/policen/server");
  if (!policenAn()) return null;
  const [acc, ppl, rec] = await Promise.all([
    prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true, metaBusinessStatus: true } }),
    prisma.customer.count({ where: { id: customerId, ...NUR_PPL_WHERE } }),
    prisma.policenFlow.findUnique({ where: { customerId }, select: { status: true } }),
  ]);
  return metaVerifizierungAnzeige({
    verbunden: acc?.status === "connected",
    formularMoeglich: !ppl && customerId !== SUPPORT_CUSTOMER_ID,
    metaStatus: acc?.metaBusinessStatus,
    flowGesperrt: rec?.status === STATUS_META_GESPERRT,
  });
}
