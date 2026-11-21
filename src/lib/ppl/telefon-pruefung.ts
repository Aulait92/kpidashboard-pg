// Pay-per-Lead: Telefonnummer vor der Verteilung prüfen (Ole, 16.11.2026: nur Formatprüfung,
// keine Live-Abfrage beim Netzbetreiber). Leads mit offensichtlich falscher Nummer werden nicht
// ausgeliefert (Status „invalid“), damit sie gar nicht erst als Storno „Kontaktdaten unbekannt“
// zurückkommen. Rein, ohne Datenbank; getestet in tests/unit/ppl-telefon-pruefung.test.ts.
//
// libphonenumber erkennt Land, Typ (Mobil/Festnetz) und die Mobilfunk-Längen genau, ist bei
// deutschen Festnetznummern aber sehr großzügig. Darum zusätzlich:
//   - nur deutsche Nummern (Wohnsitz im Ausland ist ein Stornogrund)
//   - Länge der Rufnummer ohne 0/+49: Festnetz 7 bis 11 Ziffern, Mobil 10 bis 11 Ziffern
//   - Fantasienummern: eine Ziffer 6-mal in Folge, auf- oder absteigende Reihen ab 6 Ziffern

import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export type TelefonPruefung = { ok: true; typ: "mobil" | "festnetz" | "sonstige" } | { ok: false; grund: string };

const REIHEN = ["0123456789", "1234567890", "9876543210", "0987654321"];

export function pruefeTelefon(raw: string | null | undefined): TelefonPruefung {
  const eingabe = (raw ?? "").trim();
  if (!eingabe) return { ok: false, grund: "keine Telefonnummer" };
  const ziffern = eingabe.replace(/\D/g, "");
  // Formular liefert teils „49151…“ ohne Plus: als international lesen
  const text = eingabe.startsWith("+") || eingabe.startsWith("00") ? eingabe : ziffern.startsWith("49") && ziffern.length >= 11 ? `+${ziffern}` : eingabe;
  const nr = parsePhoneNumberFromString(text, "DE");
  if (!nr) return { ok: false, grund: "keine gültige Telefonnummer" };
  if (nr.countryCallingCode !== "49") return { ok: false, grund: "keine deutsche Telefonnummer" };
  const nsn = nr.nationalNumber; // ohne 0 bzw. +49
  if (!nr.isValid()) return { ok: false, grund: "ungültige Rufnummer" };
  const typ = nr.getType();
  const mobil = typ === "MOBILE";
  const festnetz = typ === "FIXED_LINE" || typ === "FIXED_LINE_OR_MOBILE";
  if (mobil && (nsn.length < 10 || nsn.length > 11)) return { ok: false, grund: "Handynummer mit falscher Länge" };
  if (festnetz && (nsn.length < 7 || nsn.length > 11)) return { ok: false, grund: "Festnetznummer mit falscher Länge" };
  if (!mobil && !festnetz) {
    // Sonderrufnummern (0800, 0900, 0180, 0137 …) erreichen keinen Interessenten
    if (["TOLL_FREE", "PREMIUM_RATE", "SHARED_COST", "UAN", "VOICEMAIL", "PAGER"].includes(typ ?? "")) return { ok: false, grund: "Sonderrufnummer" };
  }
  // Rufnummer ohne Vorwahl bzw. Mobilfunk-Präfix auf Fantasie-Muster prüfen
  const teil = mobil ? nsn.slice(3) : nsn;
  if (/(\d)\1{5,}/.test(teil)) return { ok: false, grund: "Fantasienummer (gleiche Ziffern)" };
  if (REIHEN.some((r) => { for (let i = 0; i + 6 <= r.length; i++) if (teil.includes(r.slice(i, i + 6))) return true; return false; })) {
    return { ok: false, grund: "Fantasienummer (Ziffernreihe)" };
  }
  return { ok: true, typ: mobil ? "mobil" : festnetz ? "festnetz" : "sonstige" };
}

/**
 * Eindeutig falsche Nummer eines Kunden-Leads (Ole, 21.11.2026: Lohmann-Lead mit „23456789“ selbst auf „Verloren:
 * falsche Daten“ setzen). Nur sichere Fälle: Fantasienummer (Ziffernreihe, gleiche Ziffern), ungültige Rufnummer,
 * zu kurze Nummer. Ohne Nummer: null. Ausländische Nummern, Festnetz und falsche Längen bleiben offen (könnte echt sein). Erwartet die Nummer
 * wie gespeichert (international ohne „+“, z. B. „4930123456“). Grund oder null.
 */
export function offensichtlichFalscheNummer(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (!d) return null; // ohne Nummer (z. B. Empfehlung nur mit E-Mail) nicht aussortieren
  if (d.length < 5) return "keine gültige Telefonnummer";
  const raw = (phone ?? "").trim();
  const text = raw.startsWith("+") || raw.startsWith("00") || raw.startsWith("0") ? raw : `+${d}`;
  const p = pruefeTelefon(text);
  if (p.ok) return null;
  return /^Fantasienummer|^ungültige Rufnummer|^keine gültige/.test(p.grund) ? p.grund : null;
}
