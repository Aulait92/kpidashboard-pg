// Garantien: Daten laden, täglich prüfen (Cron), Fälle gewähren/ablehnen.
// Die Bewertung selbst ist rein und getestet (lib/garantien.ts).
// Gutgeschrieben wird nie automatisch – nur über „Gewähren“ in Admin „Heute“.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { addGarantieGutschrift } from "@/lib/billing";
import { reportError } from "@/lib/monitoring";
import { CLOSED_STATUS } from "@/lib/products";
import { estimatedProvision } from "@/lib/provision";
import { loadCustomerProvision } from "@/lib/provision-server";
import { loadRechnerConfig } from "@/lib/rechner-server";
import { monthKey } from "@/lib/revenue-ledger";
import { RETAINER_CUSTOMER_SELECT, retainerInputFor } from "@/lib/zahlen";
import {
  bewerteGarantien,
  GARANTIE_LABEL,
  GARANTIE_UMFANG,
  monatName,
  offerHasGuarantee,
  regelnAus,
  startDatum,
  type FallStatus,
  type GarantieArt,
  type GarantieErgebnis,
  type GarantieInput,
  type GarantieRegeln,
} from "@/lib/garantien";

const DAY = 86_400_000;
const NOT_STORNO = { OR: [{ stornoState: null }, { stornoState: { not: "approved" } }] };

export type GarantieFallRow = {
  id: string;
  art: GarantieArt;
  monat: string;
  status: FallStatus;
  grund: string | null;
  betrag: number | null;
  stripeRef: string | null;
  entschiedenAm: Date | null;
  entschiedenVon: string | null;
  kennzahlen: Record<string, unknown>;
};

const toFall = (f: {
  id: string;
  art: string;
  monat: string;
  status: string;
  grund: string | null;
  betrag: unknown;
  stripeRef: string | null;
  entschiedenAm: Date | null;
  entschiedenVon: string | null;
  kennzahlen: unknown;
}): GarantieFallRow => ({
  id: f.id,
  art: f.art as GarantieArt,
  monat: f.monat,
  status: f.status as FallStatus,
  grund: f.grund,
  betrag: f.betrag == null ? null : Number(f.betrag),
  stripeRef: f.stripeRef,
  entschiedenAm: f.entschiedenAm,
  entschiedenVon: f.entschiedenVon,
  kennzahlen: (f.kennzahlen ?? {}) as Record<string, unknown>,
});

/** Kunden mit angenommenem Garantie-Angebot (Katze/TKV, ab 11.11.2026). */
export async function garantieKunden(customerIds?: string[]): Promise<{ customerId: string; offerId: string }[]> {
  const onboardings = await prisma.onboarding.findMany({
    where: { offerId: { not: null }, ...(customerIds ? { customerId: { in: customerIds } } : {}), customer: { archived: false } },
    select: { customerId: true, offerId: true },
  });
  if (!onboardings.length) return [];
  const offers = await prisma.offer.findMany({
    where: { id: { in: onboardings.map((o) => o.offerId!) } },
    select: { id: true, status: true, createdAt: true, products: true },
  });
  const ok = new Set(offers.filter(offerHasGuarantee).map((o) => o.id));
  return onboardings.filter((o) => ok.has(o.offerId!)).map((o) => ({ customerId: o.customerId, offerId: o.offerId! }));
}

/** Alle Eingaben der Bewertung für einen Kunden. */
export async function ladeGarantieInput(customerId: string, offerId: string, now = new Date()): Promise<GarantieInput> {
  const [customer, offer, onboarding, spend, pausen, faelle, provision] = await Promise.all([
    prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { ...RETAINER_CUSTOMER_SELECT, paymentOverdueSince: true } }),
    prisma.offer.findUniqueOrThrow({
      where: { id: offerId },
      select: { acceptedAt: true, softwareFee: true, introMonthlyFee: true, introMonths: true, annualFreeMonths: true, subscriptionStatus: true, updatedAt: true },
    }),
    prisma.onboarding.findUnique({ where: { customerId }, select: { liveAt: true } }),
    prisma.customerAdSpend.findMany({ where: { customerId, date: { lte: now } }, select: { date: true, amount: true }, orderBy: { date: "asc" } }),
    prisma.customerPause.findMany({
      where: { customerId, OR: [{ appliedAt: { not: null } }, { status: { in: ["active", "ended"] } }] },
      select: { startsAt: true, endsAt: true, resumedAt: true, status: true, kind: true, updatedAt: true },
    }),
    prisma.garantieFall.findMany({ where: { customerId }, select: { art: true, monat: true, status: true } }),
    loadCustomerProvision(customerId),
  ]);
  const spendRows = spend.map((s) => ({ date: s.date, amount: Number(s.amount) }));
  const { start, quelle } = startDatum(spendRows, offer.acceptedAt, onboarding?.liveAt ?? null);
  const [leads, termine] = start
    ? await Promise.all([
        prisma.lead.findMany({
          where: { customerId, createdAt: { gte: new Date(start.getTime() - DAY), lte: now }, ...NOT_STORNO },
          select: { createdAt: true, source: true, status: true, closeValue: true, closedAt: true, statusChangedAt: true },
        }),
        prisma.appointment.findMany({
          where: { customerId, startsAt: { gte: new Date(start.getTime() - DAY), lte: now }, status: { not: "cancelled" } },
          select: { startsAt: true, status: true },
        }),
      ])
    : [[], []];
  const end = offer.subscriptionStatus === "canceled" ? offer.updatedAt : null;
  return {
    now,
    start,
    startQuelle: quelle,
    spend: spendRows,
    // Jede angewendete Pause (Urlaub, Krankheit, Zahlungsverzug) verlängert den Zeitraum
    pausen: pausen.map((p) => ({
      from: p.startsAt,
      to: p.status === "active" ? null : (p.resumedAt ?? p.endsAt ?? p.updatedAt),
    })),
    offeneRechnung: customer.paymentOverdueSince != null || pausen.some((p) => p.kind === "dunning" && p.status === "active"),
    leads: leads.map((l) => ({ createdAt: l.createdAt, source: l.source, status: l.status })),
    abschluesse: leads
      .filter((l) => l.status === CLOSED_STATUS)
      .map((l) => ({ at: l.closedAt ?? l.statusChangedAt, provision: estimatedProvision(l.source, l.closeValue, provision.rates) ?? 0 })),
    termine,
    provisionssaetze: provision.hasCustom,
    vermittlerTyp: provision.typ,
    retainer: Number(customer.retainerMonthly ?? 0) > 0 ? retainerInputFor(customer, offer, end) : null,
    faelle: faelle.map((f) => ({ art: f.art as GarantieArt, monat: f.monat, status: f.status as FallStatus })),
  };
}

export type GarantieUebersicht = { ergebnisse: GarantieErgebnis[]; faelle: GarantieFallRow[] };

/** Für Kundenakte und Kundenbereich: aktueller Stand der Garantien (null = keine Garantie). */
export async function garantieStatus(customerId: string, now = new Date()): Promise<GarantieUebersicht | null> {
  const [k] = await garantieKunden([customerId]);
  if (!k) return null;
  const regeln = regelnAus(await loadRechnerConfig());
  const [input, faelle] = await Promise.all([
    ladeGarantieInput(customerId, k.offerId, now),
    prisma.garantieFall.findMany({ where: { customerId }, orderBy: { monat: "asc" } }),
  ]);
  return { ergebnisse: bewerteGarantien(input, regeln), faelle: faelle.map(toFall) };
}

const kennzahlenJson = (e: GarantieErgebnis) => ({ ...e.kennzahlen, bedingungen: e.bedingungen, fehlend: e.fehlend }) as unknown as Prisma.InputJsonValue;

/** Ergebnisse eines Kunden als Fälle speichern: neu anlegen, offene aktualisieren, erledigte schließen. */
export async function speichereFaelle(customerId: string, ergebnisse: GarantieErgebnis[], now = new Date()): Promise<{ neu: number; aktualisiert: number; geschlossen: number }> {
  const out = { neu: 0, aktualisiert: 0, geschlossen: 0 };
  const offen = await prisma.garantieFall.findMany({ where: { customerId, status: "offen" } });
  for (const e of ergebnisse) {
    const monat = e.kennzahlen.monat;
    if ((e.status === "anspruch" || e.status === "bedingungen_fehlen") && monat) {
      const periode = { periodeVon: e.periodeVon ?? now, periodeBis: e.periodeBis ?? now };
      const existing = await prisma.garantieFall.findUnique({ where: { customerId_art_monat: { customerId, art: e.art, monat } } });
      if (!existing) {
        const f = await prisma.garantieFall.create({ data: { customerId, art: e.art, monat, ...periode, kennzahlen: kennzahlenJson(e) } });
        out.neu++;
        await audit("garantie.fall", {
          entity: "GarantieFall",
          entityId: f.id,
          customerId,
          details: { art: e.art, monat, status: e.status, fehlend: e.fehlend },
          actor: { role: "system" },
        });
      } else if (existing.status === "offen") {
        await prisma.garantieFall.update({ where: { id: existing.id }, data: { ...periode, kennzahlen: kennzahlenJson(e) } });
        out.aktualisiert++;
      }
    } else if (e.status === "erfuellt") {
      // Ziel doch erreicht (z. B. Abschlüsse nachgetragen): offene Fälle des laufenden Monats schließen
      const mc = monthKey(now);
      for (const f of offen.filter((x) => x.art === e.art && (e.art === "lead" || x.monat >= mc))) {
        const grund =
          e.art === "lead"
            ? "Automatisch geschlossen: Mindest-Leads erreicht"
            : e.art === "vertrag"
              ? "Automatisch geschlossen: Mindestzahl Verträge erreicht"
              : "Automatisch geschlossen: Break-even erreicht";
        const done = await prisma.garantieFall.updateMany({
          where: { id: f.id, status: "offen" },
          data: { status: "abgelehnt", grund, entschiedenVon: "system", entschiedenAm: now, kennzahlen: kennzahlenJson(e) },
        });
        if (done.count) {
          out.geschlossen++;
          await audit("garantie.abgelehnt", { entity: "GarantieFall", entityId: f.id, customerId, details: { art: f.art, monat: f.monat, grund }, actor: { role: "system" } });
        }
      }
    }
  }
  return out;
}

/** Täglicher Cron: alle Garantie-Kunden prüfen. Schreibt nur Fälle, bucht nichts. */
export async function runGarantien(now = new Date(), regeln?: GarantieRegeln): Promise<{ kunden: number; neu: number; aktualisiert: number; geschlossen: number; fehler: number }> {
  const r = regeln ?? regelnAus(await loadRechnerConfig());
  const kunden = await garantieKunden();
  const sum = { kunden: kunden.length, neu: 0, aktualisiert: 0, geschlossen: 0, fehler: 0 };
  for (const k of kunden) {
    try {
      const input = await ladeGarantieInput(k.customerId, k.offerId, now);
      const res = await speichereFaelle(k.customerId, bewerteGarantien(input, r), now);
      sum.neu += res.neu;
      sum.aktualisiert += res.aktualisiert;
      sum.geschlossen += res.geschlossen;
    } catch (e) {
      sum.fehler++;
      reportError(e, "cron-garantien", { customerId: k.customerId });
    }
  }
  return sum;
}

export type EntscheidungResult = { ok: true; message: string } | { ok: false; error: string };

/** „Gewähren“: Stripe-Gutschrift über den Nettobetrag des Monats, Fall auf gewährt, Protokoll. */
export async function gewaehreFall(fallId: string, actor: AuditActor): Promise<EntscheidungResult> {
  const f = await prisma.garantieFall.findUnique({ where: { id: fallId }, include: { customer: { select: { name: true, stripeCustomerId: true } } } });
  if (!f) return { ok: false, error: "Den Garantiefall gibt es nicht mehr." };
  if (f.status !== "offen") return { ok: false, error: "Dieser Garantiefall ist schon entschieden." };
  const kz = (f.kennzahlen ?? {}) as { betrag?: number; fehlend?: string[] };
  const betrag = Number(kz.betrag ?? 0);
  let stripeRef: string | null = null;
  if (betrag > 0) {
    if (!f.customer.stripeCustomerId) return { ok: false, error: "Kunde hat kein Stripe-Konto. Gutschrift bitte von Hand anlegen." };
    const art = GARANTIE_LABEL[f.art as GarantieArt];
    const was = GARANTIE_UMFANG[f.art as GarantieArt] === "all" ? "Betreuung und Software" : "Betreuung";
    try {
      stripeRef = await addGarantieGutschrift({
        stripeCustomerId: f.customer.stripeCustomerId,
        amountEur: betrag,
        description: `${art}: ${was} ${monatName(f.monat)} kostenlos`,
        fallId: f.id,
        metadata: { art: f.art, monat: f.monat },
      });
    } catch (e) {
      reportError(e, "garantie-gutschrift", { fallId: f.id });
      return { ok: false, error: `Stripe-Gutschrift fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  const done = await prisma.garantieFall.updateMany({
    where: { id: f.id, status: "offen" },
    data: { status: "gewaehrt", entschiedenVon: actor.email ?? actor.id ?? "admin", entschiedenAm: new Date(), stripeRef, betrag },
  });
  if (!done.count) return { ok: false, error: "Dieser Garantiefall ist schon entschieden." };
  await audit("garantie.gewaehrt", {
    entity: "GarantieFall",
    entityId: f.id,
    customerId: f.customerId,
    details: { art: f.art, monat: f.monat, betrag, stripeRef, trotzFehlender: kz.fehlend?.length ? kz.fehlend : undefined },
    actor,
  });
  const eur = betrag.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  return { ok: true, message: betrag > 0 ? `Gewährt: ${eur} netto gutgeschrieben (${monatName(f.monat)})` : "Gewährt (kein Betrag gutzuschreiben)" };
}

/** „Ablehnen“ mit Begründung (Pflicht), Protokoll. */
export async function lehneFallAb(fallId: string, grund: string, actor: AuditActor): Promise<EntscheidungResult> {
  const text = String(grund ?? "").trim().slice(0, 500);
  if (text.length < 3) return { ok: false, error: "Bitte kurz begründen, warum die Garantie abgelehnt wird." };
  const f = await prisma.garantieFall.findUnique({ where: { id: fallId }, select: { id: true, customerId: true, art: true, monat: true } });
  if (!f) return { ok: false, error: "Den Garantiefall gibt es nicht mehr." };
  const done = await prisma.garantieFall.updateMany({
    where: { id: f.id, status: "offen" },
    data: { status: "abgelehnt", grund: text, entschiedenVon: actor.email ?? actor.id ?? "admin", entschiedenAm: new Date() },
  });
  if (!done.count) return { ok: false, error: "Dieser Garantiefall ist schon entschieden." };
  await audit("garantie.abgelehnt", { entity: "GarantieFall", entityId: f.id, customerId: f.customerId, details: { art: f.art, monat: f.monat, grund: text }, actor });
  return { ok: true, message: "Garantie abgelehnt" };
}

/** Offene Fälle für Admin „Heute“. */
export async function offeneGarantieFaelle() {
  const rows = await prisma.garantieFall.findMany({
    where: { status: "offen" },
    orderBy: { createdAt: "asc" },
    include: { customer: { select: { name: true } } },
  });
  return rows.map((r) => ({ ...toFall(r), customerId: r.customerId, kunde: r.customer.name, createdAt: r.createdAt }));
}
