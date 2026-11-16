// Lead-Mail „Standard maschinenlesbar“ (z. B. für einen Make-Mailhook):
//   Betreff fest „Neuer Lead: {Produkt} ({Lead-ID})“, Text mit festen Zeilen „Feld: Wert“
//   (jede Zeile immer vorhanden, leer wenn unbekannt), danach alle Funnel-Antworten als
//   „Frage: Antwort“, am Ende eine Zeile „JSON: {…}“ und dasselbe als Anhang lead.json.
// Dazu Hilfen für mehrere Lieferadressen. Reine Funktionen (ohne Datenbank).

import { ohneGedankenstriche } from "@/lib/gedankenstriche";
import { templateValues } from "@/lib/ppl/template";

export type MachineLead = {
  id: string;
  /** Eingang bzw. Lieferung */
  date: Date;
  product: string;
  name: string | null;
  /** international ohne +, z. B. 4915112345678 */
  phone: string | null;
  email: string | null;
  answers: { label: string; value: string }[];
  consentText: string | null;
  consentAt: Date | null;
  test?: boolean;
};

export type MachineMail = { subject: string; text: string; json: Record<string, unknown>; attachment: { filename: string; content: string } };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
/** Antworten, die schon als feste Zeile erscheinen (nicht doppelt aufführen). */
const FIXED = new Set(["anrede", "salutation", "vorname", "firstname", "nachname", "lastname", "plz", "postleitzahl", "zip", "zipcode", "postalcode", "ort", "stadt", "city", "wohnort"].map(norm));

/** Ein Wert pro Zeile: Zeilenumbrüche raus, keine Gedankenstriche. */
const clean = (v: string | null | undefined) => ohneGedankenstriche((v ?? "").replace(/\s*[\r\n]+\s*/g, " ").trim());

/** Telefon im Format E.164 (+4915112345678). */
export function e164(phone: string | null | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "");
  return d ? `+${d.startsWith("00") ? d.slice(2) : d}` : "";
}

export function machineMail(l: MachineLead): MachineMail {
  const tv = templateValues({ id: l.id, name: l.name, phone: l.phone, email: l.email, answers: l.answers });
  const answers = l.answers.filter((a) => a?.label && a?.value && !FIXED.has(norm(a.label))).map((a) => ({ frage: clean(a.label), antwort: clean(a.value) }));
  const fixed: [string, string][] = [
    ["Lead-ID", l.id],
    ["Datum", l.date.toISOString()],
    ["Produkt", clean(l.product)],
    ["Anrede", clean(tv.anrede)],
    ["Vorname", clean(tv.vorname)],
    ["Nachname", clean(tv.nachname)],
    ["Telefon", e164(l.phone)],
    ["E-Mail", clean(l.email)],
    ["PLZ", clean(tv.plz)],
    ["Ort", clean(tv.ort)],
  ];
  const consent: [string, string][] = [
    ["Einwilligungstext", clean(l.consentText)],
    ["Einwilligung Zeitpunkt", l.consentAt ? l.consentAt.toISOString() : ""],
  ];
  const json: Record<string, unknown> = {
    lead_id: l.id,
    datum: l.date.toISOString(),
    produkt: clean(l.product),
    anrede: clean(tv.anrede),
    vorname: clean(tv.vorname),
    nachname: clean(tv.nachname),
    telefon: e164(l.phone),
    email: clean(l.email),
    plz: clean(tv.plz),
    ort: clean(tv.ort),
    antworten: Object.fromEntries(answers.map((a) => [a.frage, a.antwort])),
    einwilligung: { text: clean(l.consentText), zeitpunkt: l.consentAt ? l.consentAt.toISOString() : "" },
    test: !!l.test,
  };
  const line = ([k, v]: [string, string]) => `${k}: ${v}`.trimEnd();
  const text = [
    ...(l.test ? ["TEST: Dies ist ein Testdatensatz, bitte nicht bearbeiten.", ""] : []),
    ...fixed.map(line),
    ...answers.map((a) => line([a.frage, a.antwort])),
    ...consent.map(line),
    "",
    `JSON: ${JSON.stringify(json)}`,
  ].join("\n");
  return {
    subject: `${l.test ? "[TEST] " : ""}Neuer Lead: ${clean(l.product)} (${l.id})`,
    text,
    json,
    attachment: { filename: "lead.json", content: JSON.stringify(json, null, 2) },
  };
}

/** Lieferadressen aus dem Feld am Bezug (Komma, Semikolon, Leerzeichen oder Zeilen), ohne Doppelte. */
export function parseAddresses(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of (raw ?? "").split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean)) {
    if (seen.has(a.toLowerCase())) continue;
    seen.add(a.toLowerCase());
    out.push(a);
  }
  return out;
}

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;

/** Ungültige Adressen (für die Prüfung beim Speichern). */
export function invalidAddresses(list: string[]): string[] {
  return list.filter((a) => !EMAIL.test(a));
}
