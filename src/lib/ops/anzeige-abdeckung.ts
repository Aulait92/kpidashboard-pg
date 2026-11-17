// Diagnose q=anzeige-abdeckung (Ole, 17.11.2026, nur lesend): Wie gut ist die Anzeige am Lead befüllt und gibt es
// Meta-Kosten je Anzeige? Je Kunde ab seinem Startdatum (lib/kunden-start.ts): Leads, Anteil mit Anzeigen-ID,
// Kampagne und Formular, Meta-Leads (Lead-ID von Meta) mit Anzeige, Kostenzeilen ja/nein. Nur Zahlen, Kunden-ID und
// Name, keine Personendaten. Ohne Testleads, Testkunden und interne Kunden.
//   &rueckfuellung=1  Vorschau der Rückfüllung (Trockenlauf ohne Meta-Abruf, schreibt nichts)

import { prisma } from "@/lib/prisma";
import { ladeKundenStarts } from "@/lib/kunden-start";

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export async function anzeigeAbdeckung(params: URLSearchParams) {
  const kunden = await ladeKundenStarts();
  const zeilen = [];
  const summe = { leads: 0, mitAnzeigeId: 0, mitKampagne: 0, mitFormular: 0, metaLeads: 0, metaLeadsMitAnzeige: 0, kundenMitKosten: 0 };
  for (const k of kunden) {
    if (!k.start) continue;
    const where = { customerId: k.id, isTest: false, createdAt: { gte: k.start.start } };
    const [leads, mitAnzeigeId, mitKampagne, mitFormular, metaLeads, metaLeadsMitAnzeige, kosten] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.count({ where: { ...where, adId: { not: null } } }),
      prisma.lead.count({ where: { ...where, adCampaignId: { not: null } } }),
      prisma.lead.count({ where: { ...where, adFormId: { not: null } } }),
      // Leads mit Meta-Lead-ID (Perspective „perspective:…“ zählt nicht, Airtable hat keine)
      prisma.lead.count({ where: { ...where, externalId: { not: null }, NOT: { externalId: { contains: ":" } } } }),
      prisma.lead.count({ where: { ...where, externalId: { not: null }, NOT: { externalId: { contains: ":" } }, adId: { not: null } } }),
      prisma.adSpendDaily.aggregate({
        where: { customerId: k.id },
        _count: { _all: true },
        _sum: { spend: true },
        _min: { date: true },
        _max: { date: true },
      }),
    ]);
    const kostenZeilen = kosten._count._all;
    summe.leads += leads;
    summe.mitAnzeigeId += mitAnzeigeId;
    summe.mitKampagne += mitKampagne;
    summe.mitFormular += mitFormular;
    summe.metaLeads += metaLeads;
    summe.metaLeadsMitAnzeige += metaLeadsMitAnzeige;
    if (kostenZeilen) summe.kundenMitKosten++;
    zeilen.push({
      kundeId: k.id,
      name: k.name,
      start: ymd(k.start.start),
      startQuelle: k.start.quelle,
      eigenesWerbekonto: !!k.metaAdAccountId,
      ruhend: k.dormant,
      leads,
      mitAnzeigeId: { n: mitAnzeigeId, pct: pct(mitAnzeigeId, leads) },
      mitKampagne: { n: mitKampagne, pct: pct(mitKampagne, leads) },
      mitFormular: { n: mitFormular, pct: pct(mitFormular, leads) },
      metaLeads: { n: metaLeads, mitAnzeige: metaLeadsMitAnzeige, pct: pct(metaLeadsMitAnzeige, metaLeads) },
      kosten: kostenZeilen
        ? { vorhanden: true, zeilen: kostenZeilen, von: ymd(kosten._min.date), bis: ymd(kosten._max.date), summe: Number(kosten._sum.spend ?? 0) }
        : { vorhanden: false },
    });
  }
  const ohneKunde = await prisma.adSpendDaily.aggregate({ where: { customerId: null }, _count: { _all: true }, _sum: { spend: true } });
  const out: Record<string, unknown> = {
    hinweis: "Je Kunde nur Leads ab Startdatum (frühester von Go-live, Vertragsstart, Retainer-Start, Produktstart).",
    gesamt: {
      kunden: zeilen.length,
      ohneStartdatum: kunden.filter((k) => !k.start).map((k) => ({ kundeId: k.id, name: k.name })),
      leads: summe.leads,
      mitAnzeigeId: { n: summe.mitAnzeigeId, pct: pct(summe.mitAnzeigeId, summe.leads) },
      mitKampagne: { n: summe.mitKampagne, pct: pct(summe.mitKampagne, summe.leads) },
      mitFormular: { n: summe.mitFormular, pct: pct(summe.mitFormular, summe.leads) },
      metaLeads: { n: summe.metaLeads, mitAnzeige: summe.metaLeadsMitAnzeige, pct: pct(summe.metaLeadsMitAnzeige, summe.metaLeads) },
      kundenMitKosten: summe.kundenMitKosten,
      kostenOhneKunde: { zeilen: ohneKunde._count._all, summe: Number(ohneKunde._sum.spend ?? 0) },
    },
    kunden: zeilen,
  };
  if (params.get("rueckfuellung") === "1") {
    const { fuelleAnzeigenNach } = await import("@/lib/anzeige-rueckfuellung");
    const v = await fuelleAnzeigenNach({ dryRun: true });
    out.rueckfuellungVorschau = {
      leads: v.leads,
      einsendungen: v.einsendungen,
      metaAbfragen: v.meta.abfragen,
      aelterAls90Tage: v.meta.aelterAls90Tage,
      quellen: v.quellen,
      kunden: v.kunden.filter((k) => k.aktualisiert > 0 || k.ohneAnzeige > 0).map((k) => ({ kundeId: k.customerId, ohneAnzeige: k.ohneAnzeige, ausDatenbank: k.aktualisiert })),
    };
  }
  return out;
}
