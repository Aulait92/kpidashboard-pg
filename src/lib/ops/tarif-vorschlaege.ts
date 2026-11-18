// Diagnose (nur lesend, Ole 18.11.2026): Tarifkatalog lernt aus Einträgen der Vermittler (lib/tarif-vorschlaege*.ts).
// Nur Anzahlen: Vorschläge je Status und Quelle, verschiedene Vermittler, offene Gruppen (Tarif und Merkmal), davon
// ungeprüft und „Empfohlen“, übernommene Werte in der Überlagerung. Keine Werte, keine Kunden- oder Personendaten.
//   GET /api/ops/diagnose?q=tarif-vorschlaege

import { prisma } from "@/lib/prisma";
import { EMPFOHLEN_AB, TARIF_MERKMAL, wertNorm } from "@/lib/tarif-vorschlaege";

export async function tarifVorschlaegeDiagnose() {
  const [jeStatus, jeQuelle, vermittler, offen, ueberlagerung, neueTarife, letzte] = await Promise.all([
    prisma.tarifVorschlag.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.tarifVorschlag.groupBy({ by: ["quelle"], _count: { _all: true } }),
    prisma.tarifVorschlag.findMany({ distinct: ["customerId"], select: { customerId: true } }),
    prisma.tarifVorschlag.findMany({ where: { status: "offen" }, select: { tarifId: true, merkmal: true, neuerWert: true, customerId: true, ungeprueft: true }, take: 20000 }),
    prisma.tarifKatalogWert.count({ where: { NOT: { merkmal: { startsWith: TARIF_MERKMAL } } } }),
    prisma.tarifKatalogWert.count({ where: { merkmal: { startsWith: TARIF_MERKMAL } } }),
    prisma.tarifVorschlag.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const gruppen = new Map<string, { ungeprueft: boolean; werte: Map<string, Set<string>> }>();
  for (const r of offen) {
    const key = `${r.tarifId}|${r.merkmal}`;
    const g = gruppen.get(key) ?? { ungeprueft: false, werte: new Map<string, Set<string>>() };
    g.ungeprueft ||= r.ungeprueft;
    const n = wertNorm(r.neuerWert);
    g.werte.set(n, (g.werte.get(n) ?? new Set<string>()).add(r.customerId));
    gruppen.set(key, g);
  }
  const liste = [...gruppen.values()];
  return {
    vorschlaege: Object.fromEntries(jeStatus.map((s) => [s.status, s._count._all])),
    jeQuelle: Object.fromEntries(jeQuelle.map((s) => [s.quelle, s._count._all])),
    verschiedeneVermittler: vermittler.length,
    offeneGruppen: liste.length,
    offenUngeprueft: liste.filter((g) => g.ungeprueft).length,
    offenEmpfohlen: liste.filter((g) => g.ungeprueft && [...g.werte.values()].some((s) => s.size >= EMPFOHLEN_AB)).length,
    uebernommeneWerte: ueberlagerung,
    vorgemerkteTarifnamen: neueTarife,
    letzterVorschlag: letzte?.createdAt ?? null,
  };
}
