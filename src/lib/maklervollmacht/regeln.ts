// Maklervollmacht digital (Ole, 18.11.2026): reine Regeln ohne Datenbank, getestet in tests/unit/maklervollmacht.test.ts.
// Sparten, Prüfung der Eingaben auf der öffentlichen Seite, wann die Gesundheits-Einwilligung nötig ist, Platzhalter füllen.
// Texte: lib/maklervollmacht/texte.ts (Grundlage docs/rechtstexte/maklervollmacht-2026-11-18.md).

export type VvSparte = { key: string; label: string; gesundheit: boolean };

/** Sparten für bestehende Verträge. gesundheit: Unterlagen enthalten typischerweise Gesundheitsdaten (Art. 9 DSGVO). */
export const VV_SPARTEN: VvSparte[] = [
  { key: "kranken", label: "Krankenversicherung (auch Zusatz)", gesundheit: true },
  { key: "pflege", label: "Pflegeversicherung", gesundheit: true },
  { key: "leben", label: "Lebens- oder Rentenversicherung", gesundheit: true },
  { key: "bu", label: "Berufsunfähigkeit oder Grundfähigkeit", gesundheit: true },
  { key: "unfall", label: "Unfallversicherung", gesundheit: true },
  { key: "haftpflicht", label: "Privathaftpflicht", gesundheit: false },
  { key: "hausrat", label: "Hausrat", gesundheit: false },
  { key: "wohngebaeude", label: "Wohngebäude", gesundheit: false },
  { key: "kfz", label: "Kfz", gesundheit: false },
  { key: "rechtsschutz", label: "Rechtsschutz", gesundheit: false },
  { key: "tier", label: "Tierversicherung", gesundheit: false },
  { key: "sonstige", label: "Sonstige", gesundheit: false },
];

const SPARTE = new Map(VV_SPARTEN.map((s) => [s.key, s]));
export const sparteLabel = (key: string) => SPARTE.get(key)?.label ?? key;

export type VvVertrag = { versicherer: string; sparte: string; vertragsnummer: string | null };
export type VvDaten = { vorname: string; nachname: string; strasse: string; plz: string; ort: string; geburtsdatum: string; email: string | null };

/** Gesundheits-Einwilligung und Schweigepflichtentbindung nur, wenn mindestens ein Vertrag aus einer solchen Sparte dabei ist. */
export const gesundheitNoetig = (vertraege: Pick<VvVertrag, "sparte">[]) => vertraege.some((v) => SPARTE.get(v.sparte)?.gesundheit);

/** Versicherer, je einmal (für die Übertragungsschreiben), in der Reihenfolge der Eingabe. */
export function versichererListe(vertraege: VvVertrag[]): { versicherer: string; vertraege: VvVertrag[] }[] {
  const out = new Map<string, { versicherer: string; vertraege: VvVertrag[] }>();
  for (const v of vertraege) {
    const key = v.versicherer.trim().toLowerCase();
    const e = out.get(key) ?? { versicherer: v.versicherer.trim(), vertraege: [] };
    e.vertraege.push(v);
    out.set(key, e);
  }
  return [...out.values()];
}

const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** „12.03.1980“ oder „1980-03-12“ → „12.03.1980“; nur plausible Geburtsdaten (16 bis 110 Jahre), sonst null. */
export function geburtsdatum(raw: string, now = new Date()): string | null {
  const s = raw.trim();
  let d: number, m: number, y: number;
  let x = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (x) [d, m, y] = [Number(x[1]), Number(x[2]), Number(x[3])];
  else if ((x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) [y, m, d] = [Number(x[1]), Number(x[2]), Number(x[3])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  const age = now.getUTCFullYear() - y;
  if (age < 16 || age > 110) return null;
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

export type VvFehler = "vorname" | "nachname" | "strasse" | "plz" | "ort" | "geburtsdatum" | "email" | "vertraege" | "versicherer" | "zustimmung" | "unterschrift";

export const FEHLER_TEXT: Record<VvFehler, string> = {
  vorname: "Bitte Ihren Vornamen eintragen.",
  nachname: "Bitte Ihren Nachnamen eintragen.",
  strasse: "Bitte Straße und Hausnummer eintragen.",
  plz: "Bitte eine fünfstellige Postleitzahl eintragen.",
  ort: "Bitte den Ort eintragen.",
  geburtsdatum: "Bitte das Geburtsdatum im Format TT.MM.JJJJ eintragen.",
  email: "Bitte eine gültige E-Mail-Adresse eintragen oder das Feld leer lassen.",
  vertraege: "Bitte mindestens einen Vertrag eintragen.",
  versicherer: "Bitte bei jedem Vertrag den Versicherer eintragen.",
  zustimmung: "Bitte bestätigen Sie die Vollmacht mit dem Häkchen.",
  unterschrift: "Bitte unterschreiben Sie im Feld.",
};

export type VvEingabe = {
  daten: VvDaten;
  vertraege: VvVertrag[];
  gesundheit: boolean;
  zustimmung: boolean;
  signaturPng: Uint8Array;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_VERTRAEGE = 30;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

/** data:image/png;base64,… → Bytes (nur PNG, 200 B bis 400 KB), sonst null. */
export function signaturAusDataUrl(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) return null;
  const bytes = Uint8Array.from(Buffer.from(m[1], "base64"));
  if (bytes.length < 200 || bytes.length > 400_000) return null;
  return PNG_MAGIC.every((b, i) => bytes[i] === b) ? bytes : null;
}

/** Eingaben der öffentlichen Seite prüfen (Feldnamen wie im Formular; Verträge als JSON-Liste). */
export function pruefeEingabe(get: (k: string) => string | null, now = new Date()): { ok: true; eingabe: VvEingabe } | { ok: false; fehler: VvFehler } {
  const vorname = clean(get("vorname"), 80);
  const nachname = clean(get("nachname"), 80);
  const strasse = clean(get("strasse"), 120);
  const plz = clean(get("plz"), 10);
  const ort = clean(get("ort"), 80);
  const geb = geburtsdatum(clean(get("geburtsdatum"), 20), now);
  const emailRaw = clean(get("email"), 160).toLowerCase();
  if (!vorname) return { ok: false, fehler: "vorname" };
  if (!nachname) return { ok: false, fehler: "nachname" };
  if (!strasse) return { ok: false, fehler: "strasse" };
  if (!/^\d{5}$/.test(plz)) return { ok: false, fehler: "plz" };
  if (!ort) return { ok: false, fehler: "ort" };
  if (!geb) return { ok: false, fehler: "geburtsdatum" };
  if (emailRaw && !EMAIL_RE.test(emailRaw)) return { ok: false, fehler: "email" };

  let rows: unknown;
  try {
    rows = JSON.parse(get("vertraege") || "[]");
  } catch {
    rows = [];
  }
  const vertraege: VvVertrag[] = (Array.isArray(rows) ? rows : [])
    .slice(0, MAX_VERTRAEGE)
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const sparte = SPARTE.has(String(o.sparte)) ? String(o.sparte) : "sonstige";
      return { versicherer: clean(o.versicherer, 80), sparte, vertragsnummer: clean(o.vertragsnummer, 40) || null };
    })
    .filter((v) => v.versicherer || v.vertragsnummer);
  if (!vertraege.length) return { ok: false, fehler: "vertraege" };
  if (vertraege.some((v) => !v.versicherer)) return { ok: false, fehler: "versicherer" };

  const gesundheit = get("gesundheit") === "ja";
  // Einwilligung Gesundheitsdaten ist freiwillig (Art. 7 Abs. 4 DSGVO): ohne sie bleibt die Vollmacht wirksam
  if (get("zustimmung") !== "ja") return { ok: false, fehler: "zustimmung" };
  const signaturPng = signaturAusDataUrl(get("unterschrift") ?? "");
  if (!signaturPng) return { ok: false, fehler: "unterschrift" };

  return {
    ok: true,
    eingabe: {
      daten: { vorname, nachname, strasse, plz, ort, geburtsdatum: geb, email: emailRaw || null },
      vertraege,
      gesundheit: gesundheitNoetig(vertraege) ? gesundheit : false,
      zustimmung: true,
      signaturPng,
    },
  };
}

/** {Platzhalter} füllen; unbekannte Platzhalter bleiben stehen (Test prüft, dass keiner übrig bleibt). */
export function fuelle(text: string, werte: Record<string, string | null | undefined>): string {
  return text.replace(/\{([A-Za-z_]+)\}/g, (m, k: string) => (werte[k] != null && werte[k] !== "" ? String(werte[k]) : m));
}
