// „Ihrer Anfrage zur Kfz-Versicherung“ für die Erinnerung an Leads, die nicht antworten (Ole, 24.11.2026, Zweck
// followup_nudge): Die Sparte kommt aus dem Produkt des Leads (Lead.source) bzw. bei Privatschutz aus dem Interesse im
// Leadformular, mit passendem Artikel (lib/thema-artikel.ts mitThema). Rein, ohne Datenbank.
//
// Sparten-Treue (Lehre aus dem Produktionsfehler vom 24.11.2026, docs/firma/ab-tests.md): nie eine Sparte nennen, die der
// Lead nicht angefragt hat, und nie raten. Unbekanntes Produkt, „Privatschutz“ ohne Interesse im Formular, mehr als drei
// Sparten oder ein Thema ohne sicheren Artikel: ohne Sparte, also „Ihrer Anfrage“ bzw. „deiner Anfrage“.

import { a, type Ansprache } from "@/lib/ansprache";
import { displayProduct } from "@/lib/products";
import { artikelBekannt, mitThema } from "@/lib/thema-artikel";
import { interesseAusFormular } from "@/lib/interesse-formular";
import { tkvUmfangVon } from "@/lib/tkv-umfang";
import { istKfzProdukt } from "@/lib/whatsapp/produkt-fragen";
import { outreachProdukt, spartenWoerter, tierNamen, type FormAntwort } from "@/lib/whatsapp/erstanschreiben";

export type AnfrageLead = {
  /** Produkt des Leads (Lead.source) */
  source?: string | null;
  /** Angaben aus dem Leadformular (Lead.formData), für das Interesse bei Privatschutz und den Tiernamen */
  formular?: unknown;
  /** Gewünschter Umfang bei der Tierkrankenversicherung (Lead.tkvUmfang, lib/tkv-umfang.ts) */
  tkvUmfang?: string | null;
};

/** Sparte als Hauptwort („Kfz-Versicherung“) und ein Zusatz dahinter („für Minka“). */
export type Sparte = { wort: string; zusatz?: string };

/** formData-JSON defensiv als Label/Wert-Paare. */
function felder(raw: unknown): FormAntwort[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => (x && typeof x === "object" && typeof x.label === "string" && typeof x.value === "string" ? [{ label: x.label, value: x.value }] : []));
}

/**
 * Sparte der Anfrage eines Leads, oder null (dann nennt die Nachricht keine Sparte).
 *   Kfz                       → „Kfz-Versicherung“
 *   Tierkranken               → „Tierkrankenversicherung“ (nur OP gewünscht: „Tier-OP-Versicherung“), mit Tiername „für Minka“
 *   Zahnzusatz                → „Zahnzusatzversicherung“
 *   private Krankenvers.      → „privaten Krankenversicherung“ (Dativ, steht nur nach „zur“)
 *   Privatschutz              → die gewählten Sparten: eine „Hausratversicherung“, zwei bis drei „Haftpflicht und Hausrat“
 *   sonstiges Produkt         → der Produktname, wenn der Artikel sicher ist („Sterbegeld“), sonst null
 */
export function sparteDerAnfrage(lead: AnfrageLead): Sparte | null {
  const source = (lead.source ?? "").trim();
  if (!source) return null;
  if (istKfzProdukt(source)) return { wort: "Kfz-Versicherung" };
  const formular = felder(lead.formular);
  const p = outreachProdukt(source);
  if (p?.purpose === "outreach_tkv") {
    const nurOp = tkvUmfangVon({ gespeichert: lead.tkvUmfang, source }) === "op";
    const namen = tierNamen(formular);
    return { wort: nurOp ? "Tier-OP-Versicherung" : "Tierkrankenversicherung", ...(namen ? { zusatz: `für ${namen}` } : {}) };
  }
  if (p?.purpose === "outreach_zahn") return { wort: "Zahnzusatzversicherung" };
  if (p?.purpose === "outreach_pkv") return { wort: "privaten Krankenversicherung" };
  if (p?.purpose === "outreach_privatschutz") {
    // Interesse aus dem Formular; ohne Formularangabe nur, wenn das Produkt selbst die Sparte nennt („Hausrat“)
    const interesse = interesseAusFormular(formular) ?? (/privatschutz/i.test(source) ? null : source);
    // Nennt das Interesse auch etwas, das wir nicht sicher benennen können („Kfz, Hausrat“, „Haftpflicht,
    // Tierkrankenversicherung“, „Alles in einem Paket“), bleibt es neutral statt nur einen Teil der Anfrage zu nennen
    const teile = (interesse ?? "").split(/\s*(?:,|;|\/|&|\+|\bund\b|\boder\b)\s*/i).filter((t) => t.trim());
    if (teile.some((t) => !spartenWoerter(t).length)) return null;
    const w = spartenWoerter(interesse);
    if (w.length === 1) return { wort: `${w[0]}versicherung` };
    if (w.length === 2 || w.length === 3) return { wort: `${w.slice(0, -1).join(", ")} und ${w.at(-1)}` };
    return null;
  }
  const name = displayProduct(source).trim();
  return artikelBekannt(name) ? { wort: name } : null;
}

/**
 * „Ihrer Anfrage zur Kfz-Versicherung“, „deiner Anfrage zur Tierkrankenversicherung für Minka“, „Ihrer Anfrage zu
 * Haftpflicht und Hausrat“; ohne Sparte „Ihrer Anfrage“ bzw. „deiner Anfrage“. Steht hinter „mit“ („Sollen wir mit …
 * weitermachen?“) und ist der Wert des Platzhalters der Vorlage followup_nudge (nie leer).
 */
export function anfrageMitSparte(an: Ansprache, lead: AnfrageLead | null | undefined): string {
  const basis = a(an, "deiner Anfrage", "Ihrer Anfrage");
  const s = lead ? sparteDerAnfrage(lead) : null;
  if (!s) return basis;
  return `${basis} ${mitThema("zu", s.wort)}${s.zusatz ? ` ${s.zusatz}` : ""}`;
}
