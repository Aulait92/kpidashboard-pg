// Kennzahlen der eigenen Funnels (Admin › Liefern › A/B-Tests, Karte „PKV-Funnel“, und Diagnose q=funnel). Nur Zahlen,
// keine Personendaten. Trichter: Besucher → Leads → geliefert → mit Rückmeldung → erreicht → Termin → Abschluss, dazu
// Abbruch je Schritt. Ergebnis beim Abnehmer nach lib/funnel/server.ts bewerteLead (Stand heute; Leads jünger als
// 14 Tage können noch dazukommen). Leads an Abnehmer ohne Rückmeldung in der App gelten als „unbekannt“ und zählen in
// den Quoten erreicht/Termin/Abschluss nicht mit (Nenner = Besucher ohne „unbekannt“).

import { prisma } from "@/lib/prisma";
import { ablauf, funnelDef, PKV_BEITRAG } from "@/lib/funnel/definition";
import { bewerteLead, ladeLeadFakten } from "@/lib/funnel/server";
import { experimentStats, EXPERIMENTE, laeuft, type ExperimentDef } from "@/lib/experimente";

const DAY = 86_400_000;

/** Kurze Namen der Schritte für den Trichter */
export const SCHRITT_NAME: Record<string, string> = {
  start: "Privat oder gesetzlich",
  versicherung: "Versicherung",
  situation: "Situation",
  dauer: "Dauer in der PKV",
  beitrag: "Beitrag",
  geburtsdatum: "Geburtsdatum",
  wohnort: "PLZ und Ort",
  "fast-fertig": "Fast fertig",
  name: "Name",
  kontakt: "Kontakt",
};

export type FunnelKennzahlen = {
  funnel: string;
  tage: number;
  besucher: number;
  schritte: { id: string; name: string; angesehen: number; beantwortet: number }[];
  abbrueche: { gesetzlich: number; unter_650: number; debeka: number; beamte: number };
  leads: number;
  geliefert: number;
  /** an Abnehmer in der App geliefert (können zurückmelden) */
  mitRueckmeldung: number;
  /** davon mit tatsächlicher Rückmeldung (Status, Termin, Abschluss oder Storno) */
  rueckmeldungDa: number;
  unbekannt: number;
  erreicht: number;
  termin: number;
  abschluss: number;
  /** nicht stornierter PPL-Umsatz der Leads (Neben-Kennzahl) */
  umsatz: number;
  quoten: { leadJeBesucher: number; erreichtJeBesucher: number; terminJeBesucher: number; abschlussJeBesucher: number; umsatzJeBesucher: number };
  tests: { key: string; titel: string; aktiv: boolean; a: TestZeile; b: TestZeile }[];
};

type TestZeile = { besucher: number; leads: number; reif: number; erreicht: number };

const q = (z: number, n: number) => (n > 0 ? z / n : 0);

export async function funnelKennzahlen(funnel = PKV_BEITRAG.key, tage = 30, now = new Date()): Promise<FunnelKennzahlen> {
  const f = funnelDef(funnel) ?? PKV_BEITRAG;
  const seit = new Date(now.getTime() - tage * DAY);
  const besuche = await prisma.funnelBesuch.findMany({ where: { funnel: f.key, createdAt: { gte: seit } }, select: { id: true, poolLeadId: true } });
  const ereignisse = await prisma.funnelEreignis.groupBy({
    by: ["schritt", "art", "grund"],
    where: { funnel: f.key, createdAt: { gte: seit } },
    _count: { _all: true },
  });
  const zahl = (schritt: string, art: string) => ereignisse.filter((e) => e.schritt === schritt && e.art === art).reduce((n, e) => n + e._count._all, 0);
  const abbruch = (grund: string) => ereignisse.filter((e) => e.art === "abbruch" && e.grund === grund).reduce((n, e) => n + e._count._all, 0);

  const mitLead = besuche.filter((b) => b.poolLeadId);
  const fakten = await ladeLeadFakten(mitLead.map((b) => b.poolLeadId!));
  let geliefert = 0, mitRueckmeldung = 0, rueckmeldungDa = 0, erreicht = 0, termin = 0, abschluss = 0, umsatz = 0;
  for (const b of mitLead) {
    const e = fakten.get(b.poolLeadId!);
    if (!e) continue;
    const w = bewerteLead(e.fakten);
    if (w.geliefert) geliefert++;
    if (w.umsatz) umsatz += e.umsatz;
    if (!w.rueckmeldungMoeglich) continue;
    mitRueckmeldung++;
    if (w.rueckmeldung) rueckmeldungDa++;
    if (w.erreicht) erreicht++;
    if (w.termin) termin++;
    if (w.abschluss) abschluss++;
  }
  const besucher = besuche.length;
  const unbekannt = geliefert - mitRueckmeldung;
  const bekannt = besucher - unbekannt;

  // A/B-Tests der Funnel-Schritte (Fassung je Besucher): Besucher, Leads (sofort), Ergebnis nur reife Besucher
  const keys = [...new Set(f.schritte.map((s) => s.test?.experiment).filter((k): k is string => !!k))];
  const saved = await prisma.experiment.findMany({ where: { key: { in: keys } } });
  const tests = await Promise.all(
    keys.map(async (key) => {
      const d = (EXPERIMENTE as Record<string, ExperimentDef>)[key];
      const [leadsS, reifS] = await Promise.all([experimentStats(key, { ziel: "funnel_lead", ohneReife: true }), experimentStats(key)]);
      const zeile = (v: "a" | "b"): TestZeile => ({ besucher: leadsS[v].n, leads: leadsS[v].ziel, reif: reifS[v].n, erreicht: reifS[v].ziel });
      return { key, titel: d?.titel ?? key, aktiv: d ? laeuft(d, saved.find((s) => s.key === key)) : false, a: zeile("a"), b: zeile("b") };
    }),
  );

  return {
    funnel: f.key,
    tage,
    besucher,
    schritte: ablauf(f).map((s) => ({ id: s.id, name: SCHRITT_NAME[s.id] ?? s.id, angesehen: zahl(s.id, "angesehen"), beantwortet: zahl(s.id, s.art === "absenden" ? "abgeschickt" : "beantwortet") })),
    abbrueche: { gesetzlich: abbruch("gesetzlich"), unter_650: abbruch("unter_650"), debeka: abbruch("debeka"), beamte: abbruch("beamte") },
    leads: mitLead.length,
    geliefert,
    mitRueckmeldung,
    rueckmeldungDa,
    unbekannt,
    erreicht,
    termin,
    abschluss,
    umsatz: Math.round(umsatz * 100) / 100,
    quoten: {
      leadJeBesucher: q(mitLead.length, besucher),
      erreichtJeBesucher: q(erreicht, bekannt),
      terminJeBesucher: q(termin, bekannt),
      abschlussJeBesucher: q(abschluss, bekannt),
      umsatzJeBesucher: q(umsatz, besucher),
    },
    tests,
  };
}

/** Diagnose q=funnel[&tage=30] (nur Zahlen). */
export async function funnelDiagnose(p: URLSearchParams) {
  const tage = Math.min(365, Math.max(1, Math.round(Number(p.get("tage") ?? 30)) || 30));
  const k = await funnelKennzahlen(p.get("funnel") ?? PKV_BEITRAG.key, tage);
  const pct = (x: number) => Math.round(x * 1000) / 10;
  return {
    regeln: {
      hauptKennzahl: "ppl_erreicht je Besucher (Abnehmer hat den Lead erreicht); Leads an Abnehmer ohne Rückmeldung in der App zählen nicht (unbekannt)",
      nebenKennzahlen: ["funnel_lead", "ppl_termin", "ppl_abschluss", "ppl_umsatz (verkauft, 14 Tage nicht storniert)"],
      reife: "Bewertung 14 Tage nach Eingang, Nachprüfung bis 60 Tage; Tests zählen nur Besucher mit Zuteilung vor mindestens 14 Tagen",
      datenschutz: "Nur Anzahlen, keine Besucher- oder Lead-IDs.",
    },
    ...k,
    quotenProzent: {
      leadJeBesucher: pct(k.quoten.leadJeBesucher),
      erreichtJeBesucher: pct(k.quoten.erreichtJeBesucher),
      terminJeBesucher: pct(k.quoten.terminJeBesucher),
      abschlussJeBesucher: pct(k.quoten.abschlussJeBesucher),
      anteilMitRueckmeldung: pct(q(k.rueckmeldungDa, k.mitRueckmeldung)),
    },
    umsatzJeBesucherEuro: Math.round(k.quoten.umsatzJeBesucher * 100) / 100,
  };
}
