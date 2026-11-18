// Tarifkatalog lernt aus Einträgen der Vermittler (Ole, 18.11.2026): Vorschläge speichern (unsichtbar, nie ein Fehler
// für den Vermittler), Admin-Liste laden, übernehmen bzw. ablehnen, Katalog mit Überlagerung laden, Export.
// Reine Funktionen: lib/tarif-vorschlaege.ts.

import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import type { TeamCtx } from "@/lib/team";
import { ladeTarifkatalog, tarifkatalogOrdner } from "@/lib/tarifkatalog-laden";
import { sparteVon, type Katalog } from "@/lib/tarifkatalog";
import {
  FOLIE_MAX_WERT,
  TARIF_MERKMAL,
  gruppieren,
  katalogUeberlagern,
  wertNorm,
  type VorschlagGruppe,
  type VorschlagNeu,
  type VorschlagQuelle,
  type VorschlagStatus,
} from "@/lib/tarif-vorschlaege";

/**
 * Vorschläge speichern: je Vermittler-Konto, Tarif, Merkmal und Wert nur einmal (Autosave ruft öfter auf). Fehler
 * werden nur gemeldet, der Ablauf des Vermittlers geht weiter.
 */
export async function vorschlaegeErfassen(ctx: Pick<TeamCtx, "customerId" | "userId">, liste: VorschlagNeu[], quelle: VorschlagQuelle): Promise<number> {
  if (!liste.length) return 0;
  try {
    // Testkonten (Demo, eigene Tests) zählen nicht als Vermittler
    const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { isTest: true } });
    if (!c || c.isTest) return 0;
    const r = await prisma.tarifVorschlag.createMany({
      data: liste.slice(0, 40).map((v) => ({ ...v, customerId: ctx.customerId, userId: ctx.userId ?? null, quelle })),
      skipDuplicates: true,
    });
    return r.count;
  } catch (e) {
    reportError(e, "tarif-vorschlaege.erfassen");
    return 0;
  }
}

/** Übernommene Werte (ohne neue Tarifnamen); bei Fehlern keine (dann gilt die Datei). */
async function ueberlagerung() {
  return prisma.tarifKatalogWert.findMany({ where: { merkmal: { not: TARIF_MERKMAL } }, select: { tarifId: true, merkmal: true, wert: true } }).catch(() => []);
}

/**
 * Tarifkatalog wie ladeTarifkatalog, dazu die übernommenen Werte aus der Datenbank (wirkt sofort für alle Vermittler,
 * ohne Deploy). Für Terminvorbereitung, Vergleichsfolie und Präsentation.
 */
export async function ladeTarifkatalogAktuell(ordner = tarifkatalogOrdner()): Promise<Katalog> {
  return katalogUeberlagern(ladeTarifkatalog(ordner), await ueberlagerung());
}

export type VorschlaegeAnsicht = { gruppen: VorschlagGruppe[]; anzahl: Record<VorschlagStatus, number> };

/** Admin-Liste: Gruppen eines Status (Tarif und Merkmal, je Wert verschiedene Vermittler), dazu die Anzahl je Status. */
export async function ladeVorschlaege(status: VorschlagStatus, k?: Katalog): Promise<VorschlaegeAnsicht> {
  const [zeilen, je, kat] = await Promise.all([
    prisma.tarifVorschlag.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: { customerId: true, tarifId: true, gesellschaft: true, sparte: true, datei: true, merkmal: true, neuerWert: true, ungeprueft: true, createdAt: true },
    }),
    prisma.tarifVorschlag.groupBy({ by: ["status", "tarifId", "merkmal"], _count: { _all: true } }),
    k ? Promise.resolve(k) : ladeTarifkatalogAktuell(),
  ]);
  const anzahl: Record<VorschlagStatus, number> = { offen: 0, uebernommen: 0, abgelehnt: 0 };
  // Anzahl je Status = Gruppen (Tarif und Merkmal), wie die Liste sie zeigt
  for (const g of je) if (g.status in anzahl) anzahl[g.status as VorschlagStatus]++;
  return { gruppen: gruppieren(zeilen, kat), anzahl };
}

type Ziel = { tarifId: string; merkmal: string; wert: string };

const ziel = (raw: Partial<Ziel>): Ziel | null => {
  const tarifId = String(raw.tarifId ?? "").slice(0, 200);
  const merkmal = String(raw.merkmal ?? "").slice(0, 80);
  const wert = String(raw.wert ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return tarifId && merkmal && wert ? { tarifId, merkmal, wert } : null;
};

/** Offene Einträge mit diesem Wert (gleich geschrieben im Sinne von wertNorm). */
async function eintraege(z: Ziel, status: VorschlagStatus) {
  const rows = await prisma.tarifVorschlag.findMany({ where: { tarifId: z.tarifId, merkmal: z.merkmal, status }, select: { id: true, customerId: true, neuerWert: true, gesellschaft: true, sparte: true, datei: true } });
  return rows.filter((r) => wertNorm(r.neuerWert) === wertNorm(z.wert));
}

/**
 * Übernehmen: Wert als Überlagerung speichern (wirkt sofort) und die Vorschläge mit diesem Wert als übernommen
 * markieren. Neuer Tarifname: nur vormerken (kommt mit dem Export in die Katalogdatei).
 */
export async function vorschlagUebernehmen(raw: Partial<Ziel>, actor?: AuditActor): Promise<{ ok: true } | { ok: false; error: string }> {
  const z = ziel(raw);
  if (!z) return { ok: false, error: "Unvollständig." };
  const rows = await eintraege(z, "offen");
  if (!rows.length) return { ok: false, error: "Kein offener Vorschlag." };
  const neu = z.merkmal === TARIF_MERKMAL;
  if (!neu) {
    const k = ladeTarifkatalog();
    const t = k.tarife.find((x) => x.id === z.tarifId);
    if (!t || !sparteVon(k, t.sparte)?.merkmale.some((m) => m.key === z.merkmal)) return { ok: false, error: "Tarif oder Merkmal nicht mehr im Katalog." };
    if (z.wert.length > FOLIE_MAX_WERT) return { ok: false, error: `Für die Folie zu lang (höchstens ${FOLIE_MAX_WERT} Zeichen).` };
  }
  const r0 = rows[0];
  const vermittler = new Set(rows.map((r) => r.customerId)).size;
  const jetzt = new Date();
  await prisma.$transaction([
    prisma.tarifKatalogWert.upsert({
      where: { tarifId_merkmal: { tarifId: z.tarifId, merkmal: neu ? `${TARIF_MERKMAL}:${wertNorm(z.wert)}` : z.merkmal } },
      create: { tarifId: z.tarifId, merkmal: neu ? `${TARIF_MERKMAL}:${wertNorm(z.wert)}` : z.merkmal, wert: z.wert, gesellschaft: r0.gesellschaft, sparte: r0.sparte, datei: r0.datei, vermittler, uebernommenAm: jetzt, uebernommenVon: actor?.email ?? null },
      update: { wert: z.wert, vermittler, uebernommenAm: jetzt, uebernommenVon: actor?.email ?? null },
    }),
    prisma.tarifVorschlag.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "uebernommen", entschiedenAm: jetzt } }),
  ]);
  await audit("tarifkatalog.vorschlag_uebernommen", { entity: "TarifKatalogWert", entityId: `${z.tarifId}|${z.merkmal}`, actor, details: { wert: z.wert, vermittler } });
  return { ok: true };
}

/** Ablehnen: Vorschläge mit diesem Wert bleiben gespeichert (kein erneutes Anlegen), erscheinen aber nicht mehr offen. */
export async function vorschlagAblehnen(raw: Partial<Ziel>, actor?: AuditActor): Promise<{ ok: true } | { ok: false; error: string }> {
  const z = ziel(raw);
  if (!z) return { ok: false, error: "Unvollständig." };
  const rows = await eintraege(z, "offen");
  if (!rows.length) return { ok: false, error: "Kein offener Vorschlag." };
  await prisma.tarifVorschlag.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "abgelehnt", entschiedenAm: new Date() } });
  await audit("tarifkatalog.vorschlag_abgelehnt", { entity: "TarifVorschlag", entityId: `${z.tarifId}|${z.merkmal}`, actor, details: { wert: z.wert } });
  return { ok: true };
}

/**
 * Zurücknehmen (übernommen oder abgelehnt → wieder offen). Ein übernommener Wert verschwindet aus der Überlagerung,
 * dann gilt wieder die Datei.
 */
export async function vorschlagZuruecknehmen(raw: Partial<Ziel>, actor?: AuditActor): Promise<{ ok: true } | { ok: false; error: string }> {
  const z = ziel(raw);
  if (!z) return { ok: false, error: "Unvollständig." };
  const rows = [...(await eintraege(z, "uebernommen")), ...(await eintraege(z, "abgelehnt"))];
  if (!rows.length) return { ok: false, error: "Nichts zurückzunehmen." };
  const merkmal = z.merkmal === TARIF_MERKMAL ? `${TARIF_MERKMAL}:${wertNorm(z.wert)}` : z.merkmal;
  const w = await prisma.tarifKatalogWert.findUnique({ where: { tarifId_merkmal: { tarifId: z.tarifId, merkmal } } });
  await prisma.$transaction([
    ...(w && wertNorm(w.wert) === wertNorm(z.wert) ? [prisma.tarifKatalogWert.delete({ where: { id: w.id } })] : []),
    prisma.tarifVorschlag.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "offen", entschiedenAm: null } }),
  ]);
  await audit("tarifkatalog.vorschlag_zurueck", { entity: "TarifVorschlag", entityId: `${z.tarifId}|${z.merkmal}`, actor, details: { wert: z.wert } });
  return { ok: true };
}

export type TarifExport = {
  erzeugt: string;
  hinweis: string;
  werte: { datei: string; tarifId: string; merkmal: string; wert: string; vermittler: number; uebernommenAm: string }[];
  neueTarife: { datei: string; gesellschaft: string; sparte: string; name: string; vermittler: number; uebernommenAm: string }[];
};

/** Export der übernommenen Werte für scripts/tarif-vorschlaege-export.mjs (schreibt sie in die Katalogdateien). */
export async function tarifExport(): Promise<TarifExport> {
  const rows = await prisma.tarifKatalogWert.findMany({ orderBy: [{ datei: "asc" }, { tarifId: "asc" }, { merkmal: "asc" }] });
  return {
    erzeugt: new Date().toISOString(),
    hinweis: "node scripts/tarif-vorschlaege-export.mjs <diese Datei> [--schreiben]",
    werte: rows
      .filter((r) => !r.merkmal.startsWith(TARIF_MERKMAL))
      .map((r) => ({ datei: r.datei, tarifId: r.tarifId, merkmal: r.merkmal, wert: r.wert, vermittler: r.vermittler, uebernommenAm: r.uebernommenAm.toISOString() })),
    neueTarife: rows
      .filter((r) => r.merkmal.startsWith(TARIF_MERKMAL))
      .map((r) => ({ datei: r.datei, gesellschaft: r.gesellschaft, sparte: r.sparte, name: r.wert, vermittler: r.vermittler, uebernommenAm: r.uebernommenAm.toISOString() })),
  };
}
