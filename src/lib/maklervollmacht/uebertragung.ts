// Bestandsübertragung aus der Maklervollmacht (Ole, 18.11.2026; nur Makler). Regeln: lib/maklervollmacht/uebertragung-regeln.ts.
//
// - Unterschrift (lib/maklervollmacht/server.ts unterschreiben): je Vertrag der Vollmacht ein LeadContract mit herkunft
//   „uebertragung“, Status „Übertragung läuft“ (uebertragungBestaetigtAt null), idempotent über uebertragungKey. Beitrag
//   aus dem bisherigen Vertrag der Terminvorbereitung, sonst leer. Je Versicherer eine Aufgabe nach 4 Wochen.
// - Bestätigt: uebertragungBestaetigtAt, optional mit Monatsbeitrag. Erst dann zählt der Vertrag (Bestandsprovision).
// - Abgelehnt: storniert ohne Grund (zählt nie). Widerruf der Vollmacht: offene Übertragungen und Aufgaben entfernen.
// Der Status des Leads bleibt unverändert: kein „Abschluss“, also kein Abschluss-Ereignis an Meta (lib/capi).

import { prisma } from "@/lib/prisma";
import { logLeadHistory } from "@/lib/lead-history";
import { premiumYearFor } from "@/lib/abschluss";
import { contractLabel } from "@/lib/provision";
import { planeAufgabe } from "@/lib/lead-aufgaben";
import { UEBERTRAGUNG_TODO, uebertragungNote } from "@/lib/vertraege-shared";
import { versichererListe, type VvVertrag } from "@/lib/maklervollmacht/regeln";
import {
  UEBERTRAGUNG,
  UEBERTRAGUNG_TAGE,
  aufgabeKind,
  beitragAusMonat,
  bisherBeitragMonat,
  gleicherVersicherer,
  provisionsSparte,
  uebertragungKey,
  uebertragungStand,
  type UebertragungStand,
} from "@/lib/maklervollmacht/uebertragung-regeln";

const DAY = 86_400_000;

const vertraegeAus = (v: unknown): VvVertrag[] =>
  (Array.isArray(v) ? v : []).filter((x): x is VvVertrag => !!x && typeof x === "object" && typeof (x as VvVertrag).versicherer === "string" && !!(x as VvVertrag).versicherer.trim());

/**
 * Nach der Unterschrift: je Vertrag der Vollmacht eine laufende Übertragung am Lead, je Versicherer eine Aufgabe in 4 Wochen.
 * Idempotent (erneuter Aufruf legt nichts doppelt an). Gibt die Zahl der neu angelegten Verträge zurück.
 */
export async function uebertragungenAnlegen(vollmachtId: string, now = new Date()): Promise<number> {
  const v = await prisma.maklervollmacht.findUnique({
    where: { id: vollmachtId },
    select: { id: true, status: true, leadId: true, customerId: true, vertraege: true, signedAt: true, customer: { select: { vermittlerTyp: true } } },
  });
  if (!v || v.status !== "unterschrieben" || v.customer.vermittlerTyp !== "makler") return 0;
  const vertraege = vertraegeAus(v.vertraege);
  if (!vertraege.length) return 0;
  const signedAt = v.signedAt ?? now;
  // Bisheriger Vertrag aus der Terminvorbereitung (neueste Termine zuerst)
  const termine = await prisma.appointment.findMany({ where: { leadId: v.leadId, customerId: v.customerId }, orderBy: { startsAt: "desc" }, take: 10, select: { tarifauswahl: true } });
  const auswahlen = termine.map((t) => t.tarifauswahl).filter(Boolean);
  let neu = 0;
  for (const [i, vt] of vertraege.entries()) {
    const sparte = provisionsSparte(vt.sparte);
    const premium = beitragAusMonat(sparte, bisherBeitragMonat(auswahlen, vt));
    const key = uebertragungKey(v.id, i);
    const vorhanden = await prisma.leadContract.findUnique({ where: { uebertragungKey: key }, select: { id: true } });
    if (vorhanden) continue;
    await prisma.leadContract
      .create({
        data: {
          leadId: v.leadId,
          customerId: v.customerId,
          sparte,
          premium,
          premiumSource: premium != null ? "angebot" : null,
          premiumYear: premiumYearFor(sparte, premium),
          signedAt,
          insurer: vt.versicherer.trim().slice(0, 120),
          contractNo: vt.vertragsnummer?.trim().slice(0, 80) || null,
          herkunft: UEBERTRAGUNG,
          vollmachtId: v.id,
          uebertragungKey: key,
        },
      })
      .then(() => neu++)
      .catch(() => null); // gleichzeitiger Aufruf: schon angelegt (uebertragungKey eindeutig)
  }
  const due = new Date(signedAt.getTime() + UEBERTRAGUNG_TAGE * DAY);
  for (const g of versichererListe(vertraege)) {
    await planeAufgabe({ leadId: v.leadId, customerId: v.customerId, kind: aufgabeKind(g.versicherer), note: uebertragungNote(g.versicherer), dueAt: due, requiresStatus: null }, now);
  }
  if (neu > 0) {
    await logLeadHistory(v.leadId, "abschluss", `Bestandsübertragung läuft: ${neu} ${neu === 1 ? "Vertrag" : "Verträge"} (${versichererListe(vertraege).map((g) => g.versicherer).join(", ")})`, { customerId: v.customerId });
  }
  return neu;
}

/** Aufgabe eines Versicherers beenden: wartende entfallen, eine aktive Wiedervorlage mit diesem Text wird frei. */
async function aufgabeBeenden(leadId: string, versicherer: string, grund: string, opts: { loeschen?: boolean } = {}) {
  const kind = aufgabeKind(versicherer);
  if (opts.loeschen) await prisma.leadTask.deleteMany({ where: { leadId, kind } });
  else await prisma.leadTask.updateMany({ where: { leadId, kind, status: { in: ["wartet", "aktiv"] } }, data: { status: "entfallen", endedReason: grund } });
  await prisma.lead.updateMany({ where: { id: leadId, followUpNote: uebertragungNote(versicherer) }, data: { followUpAt: null, followUpNote: null } });
}

/** Widerruf der Vollmacht: offene (unbestätigte) Übertragungen entfernen, Aufgaben löschen. Bestätigte bleiben. */
export async function uebertragungenZurueckziehen(vollmachtId: string): Promise<number> {
  const offen = await prisma.leadContract.findMany({ where: { vollmachtId, herkunft: UEBERTRAGUNG, uebertragungBestaetigtAt: null }, select: { id: true, leadId: true, insurer: true } });
  if (!offen.length) return 0;
  await prisma.leadContract.deleteMany({ where: { id: { in: offen.map((c) => c.id) } } });
  for (const name of new Set(offen.map((c) => c.insurer ?? ""))) if (name) await aufgabeBeenden(offen[0].leadId, name, "Vollmacht widerrufen", { loeschen: true });
  return offen.length;
}

export type UebertragungZiel = { versicherer: string } | { contractId: string };

async function offeneZiel(customerId: string, leadId: string, ziel: UebertragungZiel) {
  const rows = await prisma.leadContract.findMany({
    where: { customerId, leadId, herkunft: UEBERTRAGUNG, uebertragungBestaetigtAt: null, status: "aktiv", ...("contractId" in ziel ? { id: ziel.contractId } : {}) },
    orderBy: { createdAt: "asc" },
    select: { id: true, sparte: true, premium: true, insurer: true, productName: true },
  });
  return "versicherer" in ziel ? rows.filter((r) => gleicherVersicherer(r.insurer, ziel.versicherer)) : rows;
}

/** Noch offene Übertragungen dieses Versicherers? Sonst die Aufgabe beenden. */
async function aufgabeAbschliessen(customerId: string, leadId: string, versicherer: string | null, grund: string) {
  if (!versicherer) return;
  const rest = await offeneZiel(customerId, leadId, { versicherer });
  if (!rest.length) await aufgabeBeenden(leadId, versicherer, grund);
}

type Ergebnis = { ok: true; vertraege: number } | { ok: false; error: string };

/**
 * „Bestätigt“: Gesellschaft hat umgeschlüsselt. Ab jetzt zählt die Bestandsprovision. Ein optionaler Monatsbeitrag gilt
 * für den einen Vertrag ohne Beitrag (bei mehreren ohne Beitrag trägt der Makler ihn im Vertrag ein).
 */
export async function uebertragungBestaetigen(
  customerId: string,
  leadId: string,
  ziel: UebertragungZiel,
  opts: { monatsbeitrag?: number | null; userId?: string | null } = {},
  now = new Date(),
): Promise<Ergebnis> {
  const rows = await offeneZiel(customerId, leadId, ziel);
  if (!rows.length) return { ok: false, error: "Keine laufende Übertragung gefunden." };
  const ohneBeitrag = rows.filter((r) => r.premium == null);
  for (const r of rows) {
    const premium = ohneBeitrag.length === 1 && r.id === ohneBeitrag[0].id ? beitragAusMonat(r.sparte, opts.monatsbeitrag ?? null) : null;
    await prisma.leadContract.updateMany({
      where: { id: r.id, uebertragungBestaetigtAt: null },
      data: { uebertragungBestaetigtAt: now, ...(premium != null ? { premium, premiumSource: "vermittler", premiumYear: premiumYearFor(r.sparte, premium) } : {}) },
    });
  }
  const versicherer = rows[0].insurer;
  await aufgabeAbschliessen(customerId, leadId, versicherer, "Übertragung bestätigt");
  await logLeadHistory(leadId, "abschluss", `Bestandsübertragung bestätigt${versicherer ? ` bei ${versicherer}` : ""}: ${rows.map((r) => contractLabel(r)).join(", ")}`, { customerId, userId: opts.userId ?? null });
  return { ok: true, vertraege: rows.length };
}

/** „Abgelehnt“: Übertragung kam nicht zustande, Vertrag storniert (zählt nie). */
export async function uebertragungAblehnen(customerId: string, leadId: string, ziel: UebertragungZiel, opts: { userId?: string | null } = {}, now = new Date()): Promise<Ergebnis> {
  const rows = await offeneZiel(customerId, leadId, ziel);
  if (!rows.length) return { ok: false, error: "Keine laufende Übertragung gefunden." };
  await prisma.leadContract.updateMany({ where: { id: { in: rows.map((r) => r.id) }, uebertragungBestaetigtAt: null }, data: { status: "storniert", cancelledAt: now, cancelReason: null, chargeback: null } });
  const versicherer = rows[0].insurer;
  await aufgabeAbschliessen(customerId, leadId, versicherer, "Übertragung abgelehnt");
  await logLeadHistory(leadId, "abschluss", `Bestandsübertragung abgelehnt${versicherer ? ` bei ${versicherer}` : ""}: ${rows.map((r) => contractLabel(r)).join(", ")}`, { customerId, userId: opts.userId ?? null });
  return { ok: true, vertraege: rows.length };
}

export type UebertragungGruppe = {
  versicherer: string;
  stand: UebertragungStand;
  vertraege: number;
  /** Genau ein laufender Vertrag ohne Beitrag: beim Bestätigen den Monatsbeitrag abfragen */
  beitragFragen: boolean;
};

/** Stand je Versicherer für die Karte „Maklervollmacht“ (laufend vor bestätigt vor abgelehnt). */
export async function uebertragungenFuerVollmacht(vollmachtId: string, customerId: string): Promise<UebertragungGruppe[]> {
  const rows = await prisma.leadContract.findMany({
    where: { vollmachtId, customerId, herkunft: UEBERTRAGUNG },
    orderBy: { createdAt: "asc" },
    select: { insurer: true, status: true, uebertragungBestaetigtAt: true, premium: true },
  });
  const out = new Map<string, { versicherer: string; staende: UebertragungStand[]; ohneBeitrag: number }>();
  for (const r of rows) {
    const name = (r.insurer ?? "").trim();
    const key = name.toLowerCase();
    const e = out.get(key) ?? { versicherer: name, staende: [], ohneBeitrag: 0 };
    const s = uebertragungStand(r);
    e.staende.push(s);
    if (s === "laeuft" && r.premium == null) e.ohneBeitrag++;
    out.set(key, e);
  }
  return [...out.values()].map((e) => ({
    versicherer: e.versicherer,
    stand: e.staende.includes("laeuft") ? "laeuft" : e.staende.includes("bestaetigt") ? "bestaetigt" : "abgelehnt",
    vertraege: e.staende.length,
    beitragFragen: e.ohneBeitrag === 1,
  }));
}

/** Laufende Übertragung eines Versicherers am Lead (für die Wiedervorlage), null, wenn keine mehr läuft. */
export async function offeneUebertragung(leadId: string, customerId: string, versicherer: string): Promise<{ versicherer: string; beitragFragen: boolean } | null> {
  const rows = await offeneZiel(customerId, leadId, { versicherer });
  if (!rows.length) return null;
  return { versicherer, beitragFragen: rows.filter((r) => r.premium == null).length === 1 };
}

export { UEBERTRAGUNG_TODO };
