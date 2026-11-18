// Datumseingabe am Handy (Ole, 18.11.2026, Maklervollmacht am iPhone): Die Zifferntastatur hat keinen Punkt. Ziffern
// werden deshalb beim Tippen automatisch zu TT.MM.JJJJ ergänzt (22111990 → 22.11.1990); Eingaben mit Punkt (Desktop,
// Einfügen) bleiben erlaubt. Rein, ohne Abhängigkeiten.

/** Formatiert die Eingabe während des Tippens zu TT.MM.JJJJ. */
export function datumBeimTippen(roh: string): string {
  const s = roh.replace(/[^\d.]/g, "");
  if (s.includes(".")) {
    // Mit Punkten getippt bzw. eingefügt: Teile auf 2/2/4 Ziffern begrenzen, nicht umformen
    const [t = "", m = "", j = ""] = s.split(".");
    const teile = [t.slice(0, 2), m.slice(0, 2), j.slice(0, 4)];
    return s.split(".").length > 2 ? teile.join(".") : s.split(".").length > 1 ? `${teile[0]}.${teile[1]}` : teile[0];
  }
  const z = s.slice(0, 8);
  if (z.length <= 2) return z;
  if (z.length <= 4) return `${z.slice(0, 2)}.${z.slice(2)}`;
  return `${z.slice(0, 2)}.${z.slice(2, 4)}.${z.slice(4)}`;
}

/** Gültiges Datum TT.MM.JJJJ (auch T.M.JJJJ)? Liefert das Datum oder null. */
export function datumGueltig(text: string, opts: { min?: number; max?: number } = {}): Date | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [t, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(j, mo - 1, t));
  if (d.getUTCFullYear() !== j || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== t) return null;
  if (opts.min !== undefined && j < opts.min) return null;
  if (opts.max !== undefined && j > opts.max) return null;
  return d;
}
