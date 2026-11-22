// Marken der eigenen Funnels (Ole, 20.11.2026): Name, Anbieterzeile, Farben, Logo-Dateien und Bilder je Marke.
// Vorgabe pkv-tarife.com: docs/funnel/pkv-tarife-ci.md (Petrol, Seite #F8F7F4, Feldrand #7C8C9A, Tippfläche ≥ 56 px).
// Statische Dateien unter public/marken/<key>/ (auf der Funnel-Adresse über /marken freigegeben, lib/funnel/host.ts).
// Rein, ohne Imports: läuft im Browser (Funnel-Seite) und auf dem Server (Metadata, Partnerliste).

export type MarkeFarben = {
  /** Petrol 700: Knopf, Fortschritt, gewählte Option, Links */
  primaer: string;
  /** Petrol 800: Hover, Wortmarke */
  primaerDunkel: string;
  /** Petrol 50: gewählte Option */
  primaerHell: string;
  /** Mint: nur Deko */
  deko: string;
  seite: string;
  karte: string;
  karteRand: string;
  text: string;
  textLeise: string;
  /** Grau der Marke (.com in der Wortmarke) */
  grau: string;
  feldRand: string;
  optionRand: string;
  /** Platzhalter in Feldern (Kontrast mindestens 4,5 : 1, visual.md M7) */
  platzhalter: string;
  /** Spur des Fortschrittsbalkens (visual.md M7) */
  spur: string;
  fehler: string;
  erfolg: string;
};

export type Bild = { src: string; breite: number; hoehe: number; alt: string; sizes: string; symbolbild?: boolean };

export type Marke = {
  key: string;
  /** Wortmarke vorn (fett) und hinten (grau), z. B. „pkv-tarife“ + „.com“ */
  wort: [string, string];
  /** Name für Texte, aria-label und Titel */
  name: string;
  /** Anbieterzeile der Fußzeile (L6) */
  anbieter: string;
  farben: MarkeFarben;
  /** Pfade unter public/ */
  dateien: { favicon: string; appleIcon: string; logoHell: string; logoDunkel: string };
  bilder: { start?: Bild; zwischenseite?: Bild };
};

const BASIS = "/marken/pkv-tarife";

export const PKV_TARIFE: Marke = {
  key: "pkv-tarife",
  wort: ["pkv-tarife", ".com"],
  name: "pkv-tarife.com",
  anbieter:
    "pkv-tarife.com ist ein Angebot der Ole Kannapinn UG (haftungsbeschränkt). Wir vermitteln keine Versicherungen, sondern bringen dich mit einem PKV-Experten zusammen.",
  farben: {
    primaer: "#0E5F68",
    primaerDunkel: "#0B4A52",
    primaerHell: "#EAF4F3",
    deko: "#A9D6D0",
    seite: "#F8F7F4",
    karte: "#FFFFFF",
    karteRand: "#E3E1DA",
    text: "#0F172A",
    textLeise: "#475569",
    grau: "#5B6B78",
    feldRand: "#7C8C9A",
    optionRand: "#CFD6DC",
    platzhalter: "#6B7785",
    spur: "#D9E6E4",
    fehler: "#B42318",
    erfolg: "#047857",
  },
  dateien: { favicon: `${BASIS}/favicon.svg`, appleIcon: `${BASIS}/apple-touch-icon.png`, logoHell: `${BASIS}/logo-hell.svg`, logoDunkel: `${BASIS}/logo-dunkel.svg` },
  bilder: {
    // Quelle 12:5; am Handy 16:9 mit Ausschnitt aufs Paar (Advertorial, nach dem ersten Absatz), Desktop 12:5
    start: { src: `${BASIS}/hero.webp`, breite: 1152, hoehe: 480, alt: "Paar am Küchentisch prüft Unterlagen", sizes: "(max-width: 640px) calc(100vw - 32px), 576px" },
    // 16:9, höchstens 160 px hoch (Symbolbild)
    zwischenseite: { src: `${BASIS}/fast-fertig.webp`, breite: 568, hoehe: 320, alt: "PKV-Experte am Telefon", sizes: "284px" },
  },
};

export const MARKEN: Record<string, Marke> = { [PKV_TARIFE.key]: PKV_TARIFE };

export const markeFuer = (key: string | null | undefined): Marke => (key && Object.hasOwn(MARKEN, key) ? MARKEN[key] : PKV_TARIFE);

/** CSS-Variablen der Marke für den Funnel-Rahmen (style={…}). */
export function markeCssVars(m: Marke): Record<string, string> {
  const f = m.farben;
  return {
    "--m-primaer": f.primaer,
    "--m-primaer-dunkel": f.primaerDunkel,
    "--m-primaer-hell": f.primaerHell,
    "--m-deko": f.deko,
    "--m-seite": f.seite,
    "--m-karte": f.karte,
    "--m-karte-rand": f.karteRand,
    "--m-text": f.text,
    "--m-text-leise": f.textLeise,
    "--m-grau": f.grau,
    "--m-feld-rand": f.feldRand,
    "--m-option-rand": f.optionRand,
    "--m-platzhalter": f.platzhalter,
    "--m-spur": f.spur,
    "--m-fehler": f.fehler,
    "--m-erfolg": f.erfolg,
  };
}
