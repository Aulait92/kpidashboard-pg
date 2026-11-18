// Diagnose der Investoren-Kennzahlen (Geld › Auswertung, Plan K0): GET /api/ops/diagnose?q=investoren[&sicht=gesamt].
// Nur lesend, ohne Namen: Datenlücken (Anzahlen), Historie, Kennzahlen, KI-Kosten je Monat und die Gegenprobe gegen die
// Übersicht (zahlen.ts), damit eine Abweichung zwischen beiden Seiten sofort auffällt.

import { loadInvestoren, parseInvestorSicht } from "@/lib/investoren/server";
import { gegenprobe } from "@/lib/investoren/kennzahlen";
import { loadZahlen } from "@/lib/zahlen";

export async function investorenDiagnose(params: URLSearchParams) {
  const now = new Date();
  const sicht = parseInvestorSicht(params.get("sicht"));
  const [d, z] = await Promise.all([loadInvestoren(now, sicht), loadZahlen(now, sicht)]);
  const k = d.k;
  const abgleich = gegenprobe(k, z);
  return {
    sicht,
    stand: { laufenderMonat: k.current, letzterAbgeschlossen: k.lastComplete, monateMitUmsatz: k.historie, ersterMonat: k.totals[0]?.month ?? null },
    datenluecken: d.luecken.map((l) => ({ key: l.key, anzahl: l.anzahl ?? null, text: l.text })),
    kennzahlen: {
      mrr: k.mrr,
      arr: k.arr,
      wachstum: k.wachstum,
      aktiveKunden: k.aktiveKunden,
      bindung: k.bindung.map((b) => ({ monate: b.monate, basis: b.basis, kunden: b.kunden, gehalten: b.gehalten, kundenBindung: b.kundenBindung, nrr: b.nrr, grr: b.grr, ab: b.ab })),
      kuendigung: k.kuendigung,
      cac: k.cac,
      clv: k.clv,
      marge: { letzter: k.marge.letzter, kiAnteil: k.marge.kiAnteil },
      kohorten: { gezeigt: k.kohorten.gezeigt.length, ausgeblendet: k.kohorten.ausgeblendet, groesste: k.kohorten.groesste },
      stroeme: k.stroeme,
    },
    kiKostenJeMonat: Object.fromEntries(d.kiJeMonat.map((c) => [c.month, c.ki])),
    gegenprobe: { stimmt: abgleich.every((a) => a.gleich), abweichungen: abgleich.filter((a) => !a.gleich), alle: abgleich },
  };
}
