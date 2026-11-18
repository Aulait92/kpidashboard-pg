// Gesprächszusammenfassung / Beratungsdokumentation (Ole, 14.11.2026; §§ 61, 62 VVG: Wünsche und Bedürfnisse,
// Rat und Gründe, in Textform vor Vertragsschluss). Vorbefüllt aus Formular und Qualifizierung des Assistenten,
// der Vermittler prüft und ergänzt. Kein Rat durch die App. Rein (ohne Datenbank), auch im Browser nutzbar.
//
// Paket M5 (Ole, 18.11.2026): Entwurf ohne KI auch aus der Terminvorbereitung (zusammenfassungEntwurf): Tarifauswahl
// (Tarif, Beitrag, Leistungen aus dem Katalog), „Ihr Schutz im Überblick“, offene Klärpunkte, Notizen, bestehende
// Verträge. Gründe für den Rat schreibt der Vermittler selbst (Platzhalter GRUENDE_ERGAENZEN, Senden erst ohne
// Platzhalter). Gesundheitsangaben einer Person kommen nicht in den Entwurf. KI-Formulierung optional und nur über
// die EU-KI: lib/mail/beratung-ki.ts.

import { isHealthAnswer, ohneGesundheitsangaben } from "@/lib/gesundheitsdaten";
import { a, type Ansprache } from "@/lib/ansprache";
import { qualificationPoints } from "@/lib/whatsapp/qualification";
import { vertragZeile, vorvertraegeAus } from "@/lib/whatsapp/vorvertraege";
import type { SchutzStatus } from "@/lib/schutz-ueberblick";
import type { PdfBlock } from "@/lib/mail/text-pdf";

// Formularfelder, die keine Wünsche sind (Kontaktdaten, Einwilligungen, Technik)
const OHNE = /name|telefon|handy|mobil|e-?mail|plz|postleitzahl|\bort\b|stra(ß|ss)e|adresse|hausnummer|anrede|datenschutz|einwilligung|zustimmung|sms|agb|uhrzeit|erreichbar|r[üu]ckruf|utm|quelle|kampagne/i;
// Punkte der Qualifizierung, die nicht in die Zusammenfassung gehören (Gesprächswunsch, interne Einwände)
const QUALI_OHNE = new Set(["wunsch", "einwaende"]);

/** Vorschlag für „Wünsche und Bedürfnisse“ als Liste. */
export function wuenscheVorschlag(input: { produkt?: string | null; formData?: unknown; qualificationData?: unknown; qualificationSummary?: string | null }): string {
  const lines: string[] = [];
  const produkt = (input.produkt ?? "").trim();
  if (produkt) lines.push(`Interesse an: ${produkt}`);
  if (Array.isArray(input.formData)) {
    for (const f of input.formData as { label?: unknown; value?: unknown }[]) {
      if (typeof f?.label !== "string" || typeof f?.value !== "string") continue;
      const label = f.label.trim().replace(/:$/, "");
      const value = f.value.trim();
      // Gesundheitsangaben nicht in den Vorschlag (lib/gesundheitsdaten.ts)
      if (!label || !value || OHNE.test(label) || value.length > 200 || isHealthAnswer({ label, value })) continue;
      lines.push(`${label}: ${value}`);
      if (lines.length >= 10) break;
    }
  }
  const quali = qualificationPoints(input.qualificationData).filter((p) => !QUALI_OHNE.has(p.key));
  for (const p of quali) lines.push(`${p.label}: ${p.value}`);
  if (!quali.length && input.qualificationSummary?.trim()) lines.push(input.qualificationSummary.trim());
  return [...new Set(lines)].map((l) => `• ${l}`).join("\n");
}

const tagHeute = (now: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(now);

/** Inhalt des PDFs „Beratungsdokumentation“. */
export function beratungsPdfInhalt(f: { an: Ansprache; kunde: string; produkt: string; berater: string; wuensche: string; rat: string; now?: Date }) {
  const now = f.now ?? new Date();
  const bloecke: PdfBlock[] = [
    { ueberschrift: "Wünsche und Bedürfnisse", text: f.wuensche },
    { ueberschrift: "Rat und Gründe dafür", text: f.rat },
  ];
  return {
    titel: "Beratungsdokumentation",
    kopf: [`Kunde: ${f.kunde || "ohne Namen"}`, `Thema: ${f.produkt}`, `Beraten durch: ${f.berater}`, `Datum: ${tagHeute(now)}`],
    bloecke,
    fuss: a(
      f.an,
      "Diese Zusammenfassung hält die wichtigsten Punkte unseres Gesprächs fest. Bitte prüfe die Angaben und gib mir Bescheid, wenn etwas fehlt oder nicht stimmt.",
      "Diese Zusammenfassung hält die wichtigsten Punkte unseres Gesprächs fest. Bitte prüfen Sie die Angaben und geben Sie mir Bescheid, wenn etwas fehlt oder nicht stimmt.",
    ),
  };
}

/** Dateiname ohne Sonderzeichen, z. B. „Beratungsdokumentation_Eva_Pohl_2026-11-14.pdf“. */
export function pdfDateiname(titel: string, kunde: string, now = new Date()): string {
  const tag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(now);
  const name = kunde
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return `${titel}${name ? `_${name}` : ""}_${tag}.pdf`;
}

// ─── Entwurf aus der Terminvorbereitung (Paket M5) ───────────────────────────────────────────────

/** Stelle, die der Vermittler selbst füllen muss (Gründe für den Rat); Senden und Ablegen erst ohne. */
export const GRUENDE_ERGAENZEN = "[bitte ergänzen]";
/** Enthält der Text noch eine Stelle zum Ergänzen? */
export const hatLuecke = (t: string) => t.includes(GRUENDE_ERGAENZEN);

export type AuswahlZeile = { sparte: string; gesellschaft: string | null; tarif: string | null; beitrag: number | null; leistungen?: string[] };
export type SchutzZeileKurz = { label: string; status: SchutzStatus; info: string | null; versicherer?: string | null };

export type ZusammenfassungQuellen = {
  an: Ansprache;
  /** Thema („Haftpflicht und Hausrat“) bzw. Produkt des Leads */
  produkt: string | null;
  formData?: unknown;
  qualificationData?: unknown;
  qualificationSummary?: string | null;
  /** Lead.vorvertraege (lib/whatsapp/vorvertraege.ts) */
  vorvertraege?: unknown;
  /** „Ihr Schutz im Überblick“ (offersJson.schutz) */
  schutz?: SchutzZeileKurz[];
  /** „Noch klären im Termin“: alle Punkte und die abgehakten */
  klaeren?: { punkte: string[]; erledigt: string[] };
  /** Notizen zum Kontakt (neueste zuerst) */
  notizen?: string[];
  /** Im Termin gewählte Tarife (offersJson) */
  auswahl?: AuswahlZeile[];
  /** Satz zum Kombi-Rabatt, nur wenn die App ihn berechnet */
  kombi?: string | null;
  /** Tier-Lead: Krankheitsangaben zum Tier bleiben (keine Gesundheitsdaten einer Person) */
  tier?: boolean;
};

const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const zeile = (t: string) => t.replace(/\s+/g, " ").trim();

/** Schutz-Zeile in Worten (neutral, ohne Bewertung): „Hausrat: woanders versichert (HUK)“. */
function schutzText(s: SchutzZeileKurz): string {
  const info = s.info ? ` (${zeile(s.info)})` : "";
  switch (s.status) {
    case "bei-uns":
      return `${s.label}: schon bei mir versichert${info}`;
    case "woanders":
      return `${s.label}: woanders versichert${info}`;
    case "pruefen":
      return `${s.label}: noch zu prüfen`;
    default:
      return `${s.label}: noch kein Vertrag`;
  }
}

/**
 * Entwurf der Gesprächszusammenfassung ohne KI (Paket M5). Wünsche: Formular und Assistent (wuenscheVorschlag),
 * bestehende Verträge, Schutz heute, Notizen, offene Klärpunkte. Rat: die im Termin gewählten Tarife mit Beitrag und
 * Leistungen aus dem Katalog, Kombi-Rabatt, und die Gründe als Stelle zum Ergänzen. Gesundheitsangaben einer Person
 * fallen weg (auch in Notizen), Gedankenstriche entfallen beim Versand ohnehin.
 */
export function zusammenfassungEntwurf(q: ZusammenfassungQuellen): { wuensche: string; rat: string } {
  const ohneGes = (t: string) => ohneGesundheitsangaben(zeile(t), { tier: q.tier });
  const w: string[] = [];
  const basis = wuenscheVorschlag({ produkt: q.produkt, formData: q.formData, qualificationData: q.qualificationData, qualificationSummary: q.qualificationSummary });
  for (const l of basis.split("\n")) {
    const t = ohneGes(l.replace(/^•\s*/, ""));
    // „Versicherungsinteresse: …“ aus dem Formular steht schon als „Interesse an: …“ (Thema) da
    if (t && !(q.produkt && /^(versicherungs)?interesse:/i.test(t))) w.push(`• ${t}`);
  }
  const vv = vorvertraegeAus(q.vorvertraege);
  if (vv?.liste.length) w.push(`• Bestehende Verträge: ${vv.liste.map(vertragZeile).join(", ")}`);
  else if (vv?.keine) w.push("• Bestehende Verträge: keine");
  const imAngebot = new Set((q.auswahl ?? []).map((x) => x.sparte.toLowerCase()));
  const schutz = (q.schutz ?? []).filter((s) => !imAngebot.has(s.label.toLowerCase()));
  if (schutz.length) w.push("", a(q.an, "Deine Absicherung heute:", "Ihre Absicherung heute:"), ...schutz.map((s) => `• ${schutzText(s)}`));
  const notizen = (q.notizen ?? []).map(ohneGes).filter(Boolean).slice(0, 5);
  if (notizen.length) w.push("", "Aus dem Gespräch:", ...notizen.map((n) => `• ${n}`));
  const erledigt = new Set((q.klaeren?.erledigt ?? []).map((x) => x.toLowerCase()));
  // Offene Klärpunkte (höchstens 5); „Bestehende Verträge“ entfällt, wenn der Lead sie genannt hat
  const offen = (q.klaeren?.punkte ?? [])
    .filter((p) => !erledigt.has(p.toLowerCase()) && !(vv && /^bestehende verträge/i.test(p)))
    .slice(0, 5);
  if (offen.length) w.push("", "Noch zu klären:", ...offen.map((p) => `• ${zeile(p)}`));

  const r: string[] = [];
  for (const x of q.auswahl ?? []) {
    const tarif = [x.gesellschaft, x.tarif].filter(Boolean).join(" ");
    r.push(`• ${x.sparte}${tarif ? `: ${tarif}` : ""}${x.beitrag != null ? `, ${eur(x.beitrag)} im Monat` : ""}`);
    const l = (x.leistungen ?? []).map(zeile).filter(Boolean).slice(0, 4);
    if (l.length) r.push(`Wichtige Leistungen: ${l.join(", ")}`);
  }
  if (q.kombi) r.push(`• ${zeile(q.kombi)}`);
  r.push(`${r.length ? "\n" : ""}Gründe: ${GRUENDE_ERGAENZEN}`);
  return { wuensche: w.join("\n").replace(/\n{3,}/g, "\n\n").trim(), rat: r.join("\n").trim() };
}

/** Fehlt noch etwas, bevor die Zusammenfassung rausgeht bzw. abgelegt wird? null = in Ordnung (Sie-Form). */
export function zusammenfassungFehlt(z: { wuensche: string; rat: string }): string | null {
  if (!z.wuensche.trim()) return "Bitte die Wünsche und Bedürfnisse ausfüllen.";
  if (!z.rat.trim()) return "Bitte Rat und Gründe ausfüllen.";
  if (hatLuecke(z.wuensche) || hatLuecke(z.rat)) return `Bitte die Stellen mit ${GRUENDE_ERGAENZEN} ausfüllen.`;
  return null;
}
