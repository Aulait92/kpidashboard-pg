// Gesprächszusammenfassung / Beratungsdokumentation (Ole, 14.11.2026; §§ 61, 62 VVG: Wünsche und Bedürfnisse,
// Rat und Gründe, in Textform vor Vertragsschluss). Vorbefüllt aus Formular und Qualifizierung des Assistenten,
// der Vermittler prüft und ergänzt. Keine KI-Formulierung, kein Rat durch die App. Rein (ohne Datenbank).

import { isHealthAnswer } from "@/lib/gesundheitsdaten";
import { a, type Ansprache } from "@/lib/ansprache";
import { qualificationPoints } from "@/lib/whatsapp/qualification";
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
