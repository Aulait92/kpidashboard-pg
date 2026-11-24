// Gewünschter Umfang bei der Tierkrankenversicherung (Ole, 19.11.2026; Test Katze: Lead wählt „OPeration“, der Bot
// bestätigt den OP-Schutz und schreibt im selben Satz „was eine Krankenversicherung für Minka kostet“).
//   op    = nur OP-Schutz (Operationen, auch „Unfall und OP“)
//   voll  = Krankenversicherung, also auch Tierarztbehandlungen ohne OP
//   offen = beides vergleichen bzw. noch unentschieden
// Gespeichert am Lead (Lead.tkvUmfang) und als lesbarer Text in angaben.tarifwunsch (Chat-Angaben). Daraus folgen alle
// Texte an den Lead (Terminvorschlag, Erinnerungen, Mail-Strecke) und die Vorauswahl der Tarifvariante in der
// Terminvorbereitung (lib/terminvorbereitung-neu.ts). Rein, ohne Datenbank.

import { qualificationPoints } from "@/lib/whatsapp/qualification";

export type TkvUmfang = "op" | "voll" | "offen";

export const TKV_UMFAENGE: readonly TkvUmfang[] = ["op", "voll", "offen"];

/** Text für angaben.tarifwunsch (Seitenleiste im Chat, Zusammenfassung, Beratungsdokumentation). */
export const TKV_WUNSCH_TEXT: Record<TkvUmfang, string> = {
  op: "nur OP-Schutz",
  voll: "volle Krankenversicherung (auch Tierarztbehandlung)",
  offen: "OP- und Krankenschutz vergleichen",
};

/** Kurz für den Vermittler („Wunsch: OP-Schutz“). */
export const TKV_WUNSCH_KURZ: Record<TkvUmfang, string> = {
  op: "OP-Schutz",
  voll: "Krankenversicherung (auch Behandlungen)",
  offen: "OP- und Krankenschutz vergleichen",
};

const NUR_OP = /\bnur\s+(die\s+|eine\s+|für\s+)?(ops?\b|op-|operation)/;
const OHNE_VOLL = /\b(keine?n?|nicht|ohne)\s+(die\s+|eine\s+)?(volle?n?\s+|ganze?n?\s+)?(kranken|voll|tierarzt|behandlung)/;
const OFFEN = /\b(beides|beide|weiß (ich )?nicht|weiss (ich )?nicht|weiß noch nicht|keine ahnung|mal sehen|mal schauen|schauen wir|unsicher|unentschieden|egal|offen|vergleich\w*|sowohl|nicht sicher)\b/;
const OP = /\bops?\b|\bop-|operation/;
const VOLL = /voll|kranken|\balles\b|tierarzt|behandlung|komplett|rundum|ambulant/;

/**
 * Freitext bzw. Knopf auf den Umfang abbilden, Groß- und Kleinschreibung egal: „OPeration“, „op“, „nur OP“,
 * „Operationen“, „Unfall und OP“, „OP-Schutz“ → op; „voll“, „Vollschutz“, „Krankenversicherung“, „alles“,
 * „Tierarzt auch“ → voll; „beides“, „weiß nicht“, „mal sehen“ → offen. null = nicht erkennbar.
 */
export function tkvUmfangAusText(text: string | null | undefined): TkvUmfang | null {
  const t = (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (NUR_OP.test(t) || (OP.test(t) && OHNE_VOLL.test(t))) return "op";
  if (OFFEN.test(t)) return "offen";
  const op = OP.test(t);
  const voll = VOLL.test(t);
  // „OP und Tierarzt“: auch Behandlungen, also die volle Krankenversicherung
  if (voll) return "voll";
  if (op) return "op";
  return null;
}

/** Gespeicherter Wert (Lead.tkvUmfang) oder null. */
export function alsTkvUmfang(x: unknown): TkvUmfang | null {
  return typeof x === "string" && (TKV_UMFAENGE as readonly string[]).includes(x) ? (x as TkvUmfang) : null;
}

/**
 * Umfang eines Leads: gespeichert (Lead.tkvUmfang), sonst aus angaben.tarifwunsch, sonst ein OP-Produkt („Tier-OP“).
 * null = noch nicht gefragt.
 */
export function tkvUmfangVon(o: { gespeichert?: unknown; angaben?: unknown; source?: string | null }): TkvUmfang | null {
  const g = alsTkvUmfang(o.gespeichert);
  if (g) return g;
  const q = qualificationPoints(o.angaben);
  const ausWunsch = tkvUmfangAusText(q.find((p) => p.key === "tarifwunsch")?.value);
  if (ausWunsch) return ausWunsch;
  const ausTier = tkvUmfangAusTier(q.find((p) => p.key === "tier")?.value);
  if (ausTier) return ausTier;
  return /\bop\b|op-|operation/i.test(o.source ?? "") ? "op" : null;
}

/**
 * Umfang aus angaben.tier (Privatschutz-Weg, z. B. „Katze, nur OP“ bzw. „Katze, Krankenversicherung“). Nur bei einem
 * ausdrücklichen Wort zu OP bzw. Kranken; Angaben zur Gesundheit („beim Tierarzt“) zählen hier nicht.
 */
export function tkvUmfangAusTier(text: string | null | undefined): TkvUmfang | null {
  const t = (text ?? "").toLowerCase();
  const op = /\bop\b|op-schutz|op-versicherung|nur op|operation/.test(t);
  const kranken = /kranken|vollschutz|volle?n? schutz/.test(t);
  if (/beides|op und kranken|op- und kranken/.test(t) && op && kranken) return "offen";
  if (op && !kranken) return "op";
  if (kranken) return "voll";
  return null;
}

/** Tierkranken als Baustein im Privatschutz-Nutzensatz: „Tier-OP-Versicherung“, „Tierkrankenversicherung“, „Tier-OP- und Krankenschutz“. */
export function tkvBaustein(u: TkvUmfang | null): string {
  return u === "op" ? "Tier-OP-Versicherung" : u === "offen" ? "Tier-OP- und Krankenschutz" : "Tierkrankenversicherung";
}

/**
 * Nutzen im Terminvorschlag: „was eine OP-Versicherung für Minka kostet“, „was eine Krankenversicherung für Minka
 * kostet“, „was OP- und Krankenschutz für Minka kosten“. Ohne Angabe wie bisher die Krankenversicherung.
 */
export function tkvWasKostet(u: TkvUmfang | null, tier: string): string {
  if (u === "op") return `was eine OP-Versicherung für ${tier} kostet`;
  if (u === "offen") return `was OP- und Krankenschutz für ${tier} kosten`;
  return `was eine Krankenversicherung für ${tier} kostet`;
}

/** angaben.tarifwunsch lesbar machen: erkannter Umfang als fester Text, sonst unverändert. */
export function tarifwunschText(text: string): string {
  const u = tkvUmfangAusText(text);
  return u ? TKV_WUNSCH_TEXT[u] : text;
}

/**
 * Neue Angaben des Assistenten (record_qualification) bei Tierkranken: tarifwunsch als festen Text, dazu der Umfang
 * zum Speichern am Lead. Andere Angaben bleiben unverändert.
 */
export function tkvAngabenNormal(angaben: unknown): { angaben: unknown; umfang: TkvUmfang | null } {
  if (!angaben || typeof angaben !== "object" || Array.isArray(angaben)) return { angaben, umfang: null };
  const w = (angaben as Record<string, unknown>).tarifwunsch;
  if (typeof w !== "string") return { angaben, umfang: null };
  const umfang = tkvUmfangAusText(w);
  return { angaben: umfang ? { ...(angaben as Record<string, unknown>), tarifwunsch: TKV_WUNSCH_TEXT[umfang] } : angaben, umfang };
}

/** Frage nach dem Umfang (Frage 2 des Erstanschreibens bzw. Tierfrage nach der Buchung) in einer Nachricht von uns. */
export const TKV_UMFANG_FRAGE_RE = /Operation abgesichert sein/;

/**
 * Antwort des Leads auf die Frage nach dem Umfang aus dem Verlauf (Sicherheitsnetz, falls der Assistent sie nicht
 * festgehalten hat): die Nachrichten des Leads direkt nach unserer letzten Frage danach. null = nicht gefragt bzw. unklar.
 */
export function tkvUmfangAusVerlauf(verlauf: { direction: string; body: string | null }[]): TkvUmfang | null {
  let i = verlauf.length - 1;
  while (i >= 0 && !(verlauf[i].direction === "outbound" && TKV_UMFANG_FRAGE_RE.test(verlauf[i].body ?? ""))) i--;
  if (i < 0) return null;
  const danach = verlauf.slice(i + 1);
  const ende = danach.findIndex((m) => m.direction === "outbound");
  const antwort = (ende < 0 ? danach : danach.slice(0, ende))
    .filter((m) => m.direction === "inbound")
    .map((m) => m.body ?? "")
    .join(" ");
  return tkvUmfangAusText(antwort);
}
