// Kontrast nach WCAG 2.1 (Usability-Check 25.11.2026): Text auf Flächen mindestens 4,5:1 (AA, normale Schrift).
// Farben als #rrggbb. Genutzt im Test tests/unit/kontrast.test.ts für Farb-Tokens aus globals.css.

/** Relative Leuchtdichte einer Farbe #rrggbb. */
export function leuchtdichte(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Keine Farbe: ${hex}`);
  const kanal = (i: number) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanal(0) + 0.7152 * kanal(2) + 0.0722 * kanal(4);
}

/** Kontrastverhältnis zweier Farben (1 bis 21). */
export function kontrast(a: string, b: string): number {
  const [hell, dunkel] = [leuchtdichte(a), leuchtdichte(b)].sort((x, y) => y - x);
  return (hell + 0.05) / (dunkel + 0.05);
}

/** Erfüllt der Text auf der Fläche WCAG AA (normale Schrift 4,5:1, große Schrift 3:1)? */
export const erfuelltAA = (text: string, flaeche: string, gross = false) => kontrast(text, flaeche) >= (gross ? 3 : 4.5);
