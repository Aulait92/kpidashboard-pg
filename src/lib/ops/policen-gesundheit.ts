// Diagnose-Abfrage „policen-gesundheit“ (Ole, 21.11.2026): nur lesend. Je Kunde, ob Kranken-, BU- und Lebenspolicen
// angenommen werden (lib/policen/regeln.ts gesundheitFreigegeben): AVV-Ergänzung (b) in aktueller Fassung zugestimmt,
// Datenschutzhinweis-URL (https) hinterlegt, Ausnahme intern/Test. Ohne Inhalte, nur Ja/Nein und Datum.
//   GET /api/ops/diagnose?q=policen-gesundheit[&kunde=<Kunden-ID>]

import { prisma } from "@/lib/prisma";
import { AVV_POLICEN_VERSION, gesundheitFreigegeben, GESUNDHEIT_FREIGABE_SELECT } from "@/lib/policen/regeln";

export async function policenGesundheit(p: URLSearchParams) {
  const id = (p.get("kunde") ?? "").trim();
  const rows = await prisma.customer.findMany({
    where: id ? { id } : { archived: false, isTest: false },
    select: { id: true, name: true, ...GESUNDHEIT_FREIGABE_SELECT },
    orderBy: { name: "asc" },
    take: 200,
  });
  return {
    avvVersionAktuell: AVV_POLICEN_VERSION,
    kunden: rows.map((c) => ({
      id: c.id,
      name: c.name,
      freigegeben: gesundheitFreigegeben(c),
      avvZugestimmtAm: c.policenAvvZugestimmtAt?.toISOString().slice(0, 10) ?? null,
      avvVersionAktuell: c.policenAvvVersion === AVV_POLICEN_VERSION,
      datenschutzUrlHttps: /^https:\/\/\S+$/i.test((c.policenDatenschutzUrl ?? "").trim()),
      intern: !!c.policenIntern || !!c.isTest,
    })),
  };
}
