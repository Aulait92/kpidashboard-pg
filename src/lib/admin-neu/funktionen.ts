// Funktionen des Admins mit neuem Ort (Admin v2): Grundlage für „Was wo ist“ und die Suche ⌘K über alle Funktionen
// (Paket A3). Quelle: docs/ux/admin-neu/funktionsinventar.json (jede Funktion mit Ansicht, Rolle, Ort-Text).
// Reine Daten (nur navigation.ts), auch in Tests nutzbar.

import { BEREICHE, NEU, SEITEN, type BereichId } from "./navigation";

export type InventarEintrag = { id: string; funktion: string; heute: string; neu: string; demo_view: string; bereich: string; status_neu: string };

const ohneId = SEITEN.filter((s) => !s.pfad.includes("["));

/** Bereichsnamen der ersten Fassung, die im Ort durch die Rolle (Admin v2) ersetzt werden. Marketing bleibt als Unterpunkt. */
const ALTE_BEREICHE = new Set(["Heute", "Vertrieb", "Kunden", "Leads & Kampagnen", "Zahlen", "Einstellungen"]);

/** Neuer Ort mit Rolle vorne, z. B. „Zahlen › Qualität & Nutzung“ → „Betreuen › Qualität & Nutzung“. */
export function ortText(neu: string, view: string, bereich: string): string {
  const teile = neu.split(" › ");
  // Rahmen (Seitenleiste, Suche, Push …) gehört zu keiner Rolle
  if (["heute", "mehr", "landkarte"].includes(view) && teile[0] !== "Heute") return neu;
  const rolle = BEREICHE.find((b) => b.id === bereich)?.label;
  if (!rolle) return neu;
  if (ALTE_BEREICHE.has(teile[0])) teile.shift();
  return [rolle, ...teile.filter((t, i) => !(i === 0 && t === rolle))].join(" › ");
}

/** Link und ggf. Hinweis „über …“ für eine Demo-Ansicht. */
export function ort(view: string, bereich: string): { href: string; ueber: string | null } {
  const seiten = SEITEN.filter((s) => s.view === view);
  const direkt = seiten.find((s) => !s.pfad.includes("["));
  if (direkt) return { href: direkt.pfad, ueber: null };
  const detail = seiten[0];
  if (detail) {
    // Nächste Seite ohne [id] darüber, z. B. /admin/neu/vertrieb/kontakte/[id]/angebot → /admin/neu/vertrieb/kontakte
    let p = detail.pfad.slice(0, detail.pfad.indexOf("[")).replace(/\/$/, "");
    while (p.length > NEU.length && !ohneId.some((s) => s.pfad === p)) p = p.slice(0, p.lastIndexOf("/"));
    const liste = ohneId.find((s) => s.pfad === p);
    if (liste) return { href: liste.pfad, ueber: `in jedem Eintrag unter ${liste.titel}` };
  }
  const b = BEREICHE.find((x) => x.id === (bereich as BereichId)) ?? BEREICHE[0];
  return { href: b.pfad, ueber: null };
}

export type SuchFunktion = { id: string; titel: string; ort: string; href: string; suchtext: string };

/** Kleinbuchstaben ohne Umlaute, damit „gebuhr“ auch „Gebühr“ findet. */
export const normSuche = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss");

/** Index für ⌘K: jede Funktion mit Oberfläche (ohne „bleibt“: reine Schnittstellen, ohne „entfernt“), Ort und Ziel-Link. */
export function suchIndex(inventar: InventarEintrag[]): SuchFunktion[] {
  return inventar
    .filter((e) => e.status_neu !== "bleibt" && e.status_neu !== "entfernt")
    .map((e) => {
      const o = ort(e.demo_view, e.bereich);
      const text = ortText(e.neu, e.demo_view, e.bereich);
      return { id: e.id, titel: e.funktion, ort: o.ueber ? `${text} (${o.ueber})` : text, href: o.href, suchtext: normSuche(`${e.funktion} ${text} ${e.heute}`) };
    });
}

/** Treffer: alle Wörter kommen vor; Funktionen, deren Name mit dem ersten Wort beginnt, zuerst. */
export function sucheFunktionen(index: SuchFunktion[], term: string, max = 6): SuchFunktion[] {
  const woerter = normSuche(term).split(/\s+/).filter(Boolean);
  if (!woerter.length) return [];
  const treffer = index.filter((f) => woerter.every((w) => f.suchtext.includes(w)));
  const vorne = (f: SuchFunktion) => (normSuche(f.titel).startsWith(woerter[0]) ? 0 : normSuche(f.titel).includes(woerter[0]) ? 1 : 2);
  return treffer
    .map((f, i) => ({ f, i }))
    .sort((a, b) => vorne(a.f) - vorne(b.f) || a.i - b.i)
    .slice(0, max)
    .map((x) => x.f);
}
