// Produktfilter der Kontakte (Ole, 26.11.2026): „Produkt“ neben „Phase“, nur wenn der Kunde mindestens zwei
// verschiedene Produkte hat. Produkt = Lead.source, so wie die Liste es neben der Zeit zeigt (displayProduct).
// Gleichartige Bezeichnungen laufen zusammen: gleiche Anzeige (z. B. „Wechsel“ und „Tarifoptimierung“) und alle
// Kfz-Varianten (istKfzProdukt, z. B. „Kfz-Versicherung“, „Kfz Wechsel“, „Autoversicherung“).
import { displayProduct } from "@/lib/products";
import { istKfzProdukt } from "@/lib/whatsapp/produkt-fragen";

export type ProduktGruppe = {
  /** Wert im URL-Parameter ?produkt= (Anzeige der häufigsten Bezeichnung der Gruppe) */
  value: string;
  label: string;
  /** Alle Lead.source-Werte dieser Gruppe */
  sources: string[];
  anzahl: number;
};

const gruppenSchluessel = (source: string) => (istKfzProdukt(source) ? "kfz" : displayProduct(source).trim().toLowerCase());

/** Gruppen aus „source → Anzahl“, häufigste zuerst. */
export function produktGruppen(quellen: { source: string | null; anzahl: number }[]): ProduktGruppe[] {
  const map = new Map<string, { sources: { source: string; anzahl: number }[]; anzahl: number }>();
  for (const q of quellen) {
    const source = q.source?.trim() ? q.source : null;
    if (!source || q.anzahl <= 0) continue;
    const key = gruppenSchluessel(source);
    const g = map.get(key) ?? { sources: [], anzahl: 0 };
    g.sources.push({ source, anzahl: q.anzahl });
    g.anzahl += q.anzahl;
    map.set(key, g);
  }
  return [...map.values()]
    .map((g) => {
      const haeufigste = [...g.sources].sort((a, b) => b.anzahl - a.anzahl)[0].source;
      const label = displayProduct(haeufigste).trim();
      return { value: label, label, sources: g.sources.map((s) => s.source), anzahl: g.anzahl };
    })
    .sort((a, b) => b.anzahl - a.anzahl || a.label.localeCompare(b.label, "de"));
}

/** Gewählte Gruppe zu ?produkt= (Gruppenwert oder ein einzelner Lead.source-Wert, z. B. aus „Warum Leads verloren gehen“). */
export function gewaehlteGruppe(gruppen: ProduktGruppe[], wunsch: string | null | undefined): ProduktGruppe | null {
  if (!wunsch) return null;
  return gruppen.find((g) => g.value === wunsch) ?? gruppen.find((g) => g.sources.includes(wunsch)) ?? null;
}

/** Prisma-Bedingung für die gewählte Gruppe (leer = alle Produkte). */
export function produktWhere(gruppe: ProduktGruppe | null): { source?: { in: string[] } } {
  return gruppe ? { source: { in: gruppe.sources } } : {};
}
