// Splittests der Lead-Reise (Ole, 19.11.2026: „Wir sollten konstant Splittests fahren und Conversion-Rates
// hochtesten.“). Gleiche Regeln wie die Vorlagen-Tests (lib/whatsapp/ab-test.ts, zTest/decideAbWinner):
//   - Zuteilung: fest je Einheit per Hash (SHA-256 aus Experiment und Einheit), damit niemand beide Fassungen sieht.
//     Einheit = Lead-ID, sonst Chat-, Termin- bzw. Seitenaufruf-ID; nie Name, Nummer oder Adresse.
//   - Messung: Quote = Einheiten mit Ziel-Ereignis (nach der Zuteilung) / zugeteilte Einheiten, je Fassung.
//   - Entscheidung: ab MIN je Fassung und p < 0,05 (zweiseitiger z-Test) wird die bessere Fassung automatisch
//     Standard (Experiment.winner, WhatsApp-Cron einmal je Stunde) und im Audit-Log vermerkt („experiment.gewinner“).
//
// Schnittstelle (auch für andere Teams, z. B. die Präsentation):
//   1. Experiment in EXPERIMENTE eintragen (Schlüssel, Ziel, Beschreibung von A und B).
//   2. Beim Zeigen: `const v = await variante("mein_test", leadId)` → "a" (bisher) oder "b" (neu).
//   3. Beim Erreichen des Ziels: `await ereignis("mein_test", leadId, "termin_gebucht")`, oder für alle Tests eines
//      Leads auf einmal: `await zielErreicht([leadId], "termin_gebucht")`.
// Fehler in der Messung lassen die Lead-Reise nie scheitern (alles gefangen, Rückfall Fassung a).

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";
import { ALPHA, decideAbWinner, MIN_JE_FASSUNG, zTest, type AbDecision } from "@/lib/whatsapp/ab-test";

export type Variante = "a" | "b";

/** Ziel-Kennzahlen (frei erweiterbar; dieselbe Zeichenkette bei ereignis bzw. zielErreicht verwenden). */
export type Ziel = "termin_gebucht" | "komplettcheck_ja" | "erschienen" | (string & {});

export type ExperimentDef = {
  titel: string;
  ziel: Ziel;
  /** Was Fassung a bzw. b zeigt (ein Satz, für Diagnose und Admin) */
  a: string;
  b: string;
  /** Mindestens so viele Einheiten je Fassung vor einer Entscheidung (Standard MIN_JE_FASSUNG) */
  min?: number;
  /**
   * false = startet angehalten (alle sehen Fassung a), bis der Test eingeschaltet wird: Zeile in „Experiment“ mit
   * aktiv = true oder diesen Eintrag entfernen. Ohne Angabe läuft er (eine Zeile mit aktiv = false hält ihn an).
   */
  aktiv?: false;
};

/**
 * Laufende Experimente (A = bisher, B = neu). Neue Tests hier eintragen; ohne Eintrag gibt variante() immer "a".
 */
export const EXPERIMENTE = {
  komplettcheck_text: {
    titel: "Komplettcheck-Frage nach der Buchung",
    ziel: "komplettcheck_ja",
    a: "Bisher: „ob Sie insgesamt gut abgesichert sind und wo Sie vielleicht etwas sparen können“",
    b: "Neu (Ole): „Oft zahlen Menschen für dieselbe Absicherung doppelt …“, kostenlos, nur ein paar Minuten länger",
  },
  terminvorschlag_kostenlos: {
    titel: "Terminvorschlag im Chat",
    ziel: "termin_gebucht",
    a: "Bisher: „In einem kurzen Videotermin zeigt Ihnen …“",
    b: "Neu: „In einem kurzen, kostenlosen Videotermin zeigt Ihnen …“",
  },
  buchungsseite_kompakt: {
    titel: "Buchungsseite /book",
    ziel: "termin_gebucht",
    a: "Bisher: alle Zeiten, Pflicht-Haken Datenschutz, „Termin verbindlich buchen“",
    b: "Neu: nächste Tage zuerst, Nutzen in einer Zeile, Datenschutz als Hinweis, „Kostenlos Termin buchen“",
  },
  // Beratungspräsentation (19.11.2026): Herausforderer C gegen Standard B, Einheit Lead-ID (lib/praesentation-variante-server.ts).
  // Ole hat C am 19.11.2026 freigegeben: läuft ab dem Deploy (kein Eintrag in „Experiment“ nötig; anhalten per aktiv = false).
  praesentation: {
    titel: "Beratungspräsentation im Termin",
    ziel: "zusage",
    a: "Fassung B (Standard): Begrüßung, Beitrag und Entscheidung auf getrennten Folien, ein Paket mit „Ja, so machen wir es“",
    b: "Fassung C: Einstieg mit dem Anliegen, Beitrag auf der Entscheidungsfolie, Wahl zwischen zwei Paketen, bisheriger Vertrag in Euro",
    // Termine sind seltener als Leads und der Cron prüft stündlich: erst ab 100 Präsentationen je Fassung entscheiden
    min: 100,
  },
} as const satisfies Record<string, ExperimentDef>;

export type ExperimentKey = keyof typeof EXPERIMENTE;

const def = (key: string): ExperimentDef | null => (key in EXPERIMENTE ? EXPERIMENTE[key as ExperimentKey] : null);

/** Läuft der Test? Gespeicherter Stand vor dem Startwert im Code (aktiv: false = startet angehalten). */
export const laeuft = (d: ExperimentDef, row: { aktiv: boolean } | null | undefined): boolean => (row ? row.aktiv : d.aktiv !== false);

/** Alle Experimente aus (Notschalter EXPERIMENTE_AUS=1): alle bekommen Fassung a bzw. den Gewinner. */
export function experimenteAus(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|an|on|true|ja)$/i.test((env.EXPERIMENTE_AUS ?? "").trim());
}

/**
 * Feste Fassung je Experiment und Einheit (rein, SHA-256). Eigenes Präfix „exp:“, damit Experimente und Vorlagen-Tests
 * (variantForKey in lib/whatsapp/ab-test.ts, Präfix „ab:“) unabhängig voneinander verteilen.
 */
export function zuteilen(experiment: string, einheit: string): Variante {
  return createHash("sha256").update(`exp:${experiment}:${einheit}`).digest()[0] % 2 === 0 ? "a" : "b";
}

// ─── Entscheidung (rein) ────────────────────────────────────────────────────────────────────────

export type FassungStats = { n: number; ziel: number };
export type ExperimentStats = { a: FassungStats; b: FassungStats };

/** Gewinner wie bei den Vorlagen-Tests: erst ab min je Fassung und p < ALPHA. */
export function entscheide(s: ExperimentStats, min = MIN_JE_FASSUNG): AbDecision {
  return decideAbWinner({ a: { sent: s.a.n, replied: s.a.ziel }, b: { sent: s.b.n, replied: s.b.ziel } }, { min, alpha: ALPHA });
}

/** Quoten und p-Wert (rein). */
export function quoten(s: ExperimentStats): { quoteA: number; quoteB: number; p: number } {
  const t = zTest({ sent: s.a.n, replied: s.a.ziel }, { sent: s.b.n, replied: s.b.ziel });
  return { quoteA: t.rateA, quoteB: t.rateB, p: t.p };
}

// ─── Datenbank ──────────────────────────────────────────────────────────────────────────────────

let cache: { at: number; rows: Map<string, { aktiv: boolean; winner: string | null }> } | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function stand(): Promise<Map<string, { aktiv: boolean; winner: string | null }>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const rows = await prisma.experiment.findMany({ select: { key: true, aktiv: true, winner: true } }).catch(() => []);
  cache = { at: Date.now(), rows: new Map(rows.map((r) => [r.key, { aktiv: r.aktiv, winner: r.winner }])) };
  return cache.rows;
}

/** Nur für Tests: Zwischenspeicher leeren. */
export function experimenteCacheLeeren(): void {
  cache = null;
}

/**
 * Fassung für diese Einheit (meist die Lead-ID) und Zuteilung merken (einmal je Einheit). Nach einer Entscheidung immer
 * der Gewinner (ohne neue Zuteilung); angehalten, unbekannt, ohne Einheit oder bei Fehlern: "a".
 * merken: false = nur lesen (z. B. Seitenaufruf per GET, den auch Link-Scanner auslösen); die Zuteilung setzt dann der
 * Klick davor bzw. danach mit variante(…) ohne Option.
 */
export async function variante(experiment: string, einheit: string | null | undefined, o: { merken?: boolean } = {}): Promise<Variante> {
  try {
    const d = def(experiment);
    if (!d) return "a";
    const s = (await stand()).get(experiment);
    if (s?.winner === "a" || s?.winner === "b") return s.winner;
    if (!einheit || !laeuft(d, s) || experimenteAus()) return "a";
    const v = zuteilen(experiment, einheit);
    if (o.merken === false) return v;
    await prisma.experimentZuteilung.createMany({ data: [{ experiment, einheit, variante: v }], skipDuplicates: true });
    return v;
  } catch (err) {
    console.error("[experimente] variante", err instanceof Error ? err.message.slice(0, 120) : err);
    return "a";
  }
}

/** Ziel erreicht (einmal je Experiment, Einheit und Ziel); zählt nur, wenn die Einheit zugeteilt ist. */
export async function ereignis(experiment: string, einheit: string | null | undefined, ziel: Ziel): Promise<void> {
  if (!einheit) return;
  try {
    const z = await prisma.experimentZuteilung.findUnique({ where: { experiment_einheit: { experiment, einheit } }, select: { id: true } });
    if (!z) return;
    await prisma.experimentEreignis.createMany({ data: [{ experiment, einheit, ziel }], skipDuplicates: true });
  } catch (err) {
    console.error("[experimente] ereignis", err instanceof Error ? err.message.slice(0, 120) : err);
  }
}

/**
 * Ziel für alle Experimente erreicht, in denen eine der Einheiten zugeteilt ist (z. B. [leadId, conversationId] bei
 * einer Buchung). Zählt je Experiment nur, wenn dessen Ziel-Kennzahl passt.
 */
export async function zielErreicht(einheiten: (string | null | undefined)[], ziel: Ziel): Promise<void> {
  const ids = [...new Set(einheiten.filter((x): x is string => !!x))];
  if (!ids.length) return;
  try {
    const keys = Object.entries(EXPERIMENTE as Record<string, ExperimentDef>)
      .filter(([, d]) => d.ziel === ziel)
      .map(([k]) => k);
    if (!keys.length) return;
    const z = await prisma.experimentZuteilung.findMany({ where: { experiment: { in: keys }, einheit: { in: ids } }, select: { experiment: true, einheit: true } });
    if (z.length) await prisma.experimentEreignis.createMany({ data: z.map((x) => ({ experiment: x.experiment, einheit: x.einheit, ziel })), skipDuplicates: true });
  } catch (err) {
    console.error("[experimente] ziel", err instanceof Error ? err.message.slice(0, 120) : err);
  }
}

/** Zugeteilte Einheiten und Einheiten mit Ziel (nach der Zuteilung) je Fassung. */
export async function experimentStats(experiment: string): Promise<ExperimentStats> {
  const d = def(experiment);
  const ziel = d?.ziel ?? "";
  const rows = await prisma.$queryRaw<{ variante: string; n: bigint; ziel: bigint }[]>(Prisma.sql`
    SELECT z."variante" AS variante,
           COUNT(*) AS n,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "ExperimentEreignis" e
             WHERE e."experiment" = z."experiment" AND e."einheit" = z."einheit" AND e."ziel" = ${ziel}
               AND e."createdAt" >= z."createdAt" - interval '1 minute'
           )) AS ziel
    FROM "ExperimentZuteilung" z
    WHERE z."experiment" = ${experiment}
    GROUP BY z."variante"
  `);
  const of = (v: Variante): FassungStats => {
    const r = rows.find((x) => x.variante === v);
    return { n: Number(r?.n ?? 0), ziel: Number(r?.ziel ?? 0) };
  };
  return { a: of("a"), b: of("b") };
}

export type ExperimentUebersicht = {
  key: string;
  titel: string;
  ziel: string;
  a: string;
  b: string;
  aktiv: boolean;
  stats: ExperimentStats;
  quoteA: number;
  quoteB: number;
  p: number;
  entscheidung: AbDecision;
  winner: Variante | null;
  decidedAt: Date | null;
  min: number;
};

/** Übersicht aller Experimente (Diagnose q=experimente, Admin), nur Anzahlen und Quoten. */
export async function experimenteUebersicht(): Promise<ExperimentUebersicht[]> {
  const saved = await prisma.experiment.findMany();
  return Promise.all(
    Object.entries(EXPERIMENTE as Record<string, ExperimentDef>).map(async ([key, d]) => {
      const stats = await experimentStats(key);
      const row = saved.find((s) => s.key === key);
      const min = d.min ?? MIN_JE_FASSUNG;
      const q = quoten(stats);
      return {
        key,
        titel: d.titel,
        ziel: d.ziel,
        a: d.a,
        b: d.b,
        aktiv: laeuft(d, row),
        stats,
        quoteA: q.quoteA,
        quoteB: q.quoteB,
        p: q.p,
        entscheidung: entscheide(stats, min),
        winner: row?.winner === "a" || row?.winner === "b" ? row.winner : null,
        decidedAt: row?.decidedAt ?? null,
        min,
      };
    }),
  );
}

/** Diagnose q=experimente (lesend, ohne Personendaten). */
export async function experimenteDiagnose() {
  const liste = await experimenteUebersicht();
  const pct = (x: number) => Math.round(x * 1000) / 10;
  return {
    regeln: { minJeFassung: MIN_JE_FASSUNG, alpha: ALPHA, notschalter: experimenteAus() ? "aus (EXPERIMENTE_AUS)" : "an" },
    datenschutz: "Nur Anzahlen und Quoten je Fassung, keine Einheiten-IDs.",
    experimente: liste.map((e) => ({
      key: e.key,
      titel: e.titel,
      ziel: e.ziel,
      a: e.a,
      b: e.b,
      aktiv: e.aktiv,
      fassungA: { zugeteilt: e.stats.a.n, ziel: e.stats.a.ziel, quoteProzent: pct(e.quoteA) },
      fassungB: { zugeteilt: e.stats.b.n, ziel: e.stats.b.ziel, quoteProzent: pct(e.quoteB) },
      p: Number(e.p.toFixed(4)),
      stand: e.winner ? `entschieden: ${e.winner.toUpperCase()}` : e.entscheidung.reason === "zu_wenig" ? `läuft (ab ${e.min} je Fassung)` : e.entscheidung.reason === "entschieden" ? `Gewinner ${e.entscheidung.winner?.toUpperCase()} beim nächsten Cron` : "läuft (noch kein klarer Unterschied)",
      decidedAt: e.decidedAt,
    })),
  };
}

/**
 * Im WhatsApp-Cron (einmal je Stunde): Gewinner setzen, wenn genug Daten und klarer Unterschied. Bedingt anlegen bzw.
 * aktualisieren, damit parallel laufende Crons nicht doppelt entscheiden; Audit „experiment.gewinner“.
 */
export async function promoteExperimentWinners(now = new Date()): Promise<{ key: string; winner: Variante }[]> {
  const out: { key: string; winner: Variante }[] = [];
  for (const [key, d] of Object.entries(EXPERIMENTE as Record<string, ExperimentDef>)) {
    const row = await prisma.experiment.findUnique({ where: { key } });
    if (row?.winner || !laeuft(d, row)) continue;
    const stats = await experimentStats(key);
    const e = entscheide(stats, d.min ?? MIN_JE_FASSUNG);
    if (!e.winner) continue;
    const data = { winner: e.winner, decidedAt: now, stats: { ...stats, p: e.p, z: e.z } as unknown as Prisma.InputJsonValue };
    const claimed = row
      ? (await prisma.experiment.updateMany({ where: { key, winner: null }, data })).count > 0
      : await prisma.experiment
          .create({ data: { key, ziel: d.ziel, ...data } })
          .then(() => true)
          .catch(() => false);
    if (!claimed) continue;
    cache = null;
    const { audit } = await import("@/lib/audit");
    await audit("experiment.gewinner", {
      entity: "Experiment",
      entityId: key,
      details: { key, ziel: d.ziel, winner: e.winner, p: Number(e.p.toFixed(4)), a: stats.a, b: stats.b },
      actor: { role: "system" },
    });
    out.push({ key, winner: e.winner });
  }
  return out;
}
