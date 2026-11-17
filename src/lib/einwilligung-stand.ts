// Einwilligung im Kontakt auf einen Blick (Ole, 17.11.2026): vollständig = kleines Etikett „Einwilligung“ am Namen,
// sonst ein Hinweis mit der Folge im Klartext (Gelb: eingeschränkt, Rot: keine bzw. widerrufen).
// Leitet nur aus der bestehenden Logik ab, nichts Neues:
//   - Häkchen im Meta-Leadformular (Lead.waConsent, lib/einwilligung-leadformular.ts): "ja" | "nein" | null
//     (null mit Meta-Lead bzw. Nachweis = Formular ohne Häkchen, Einwilligung nicht nachgewiesen; WhatsApp läuft weiter)
//   - „STOPP“ bzw. bei WhatsApp abbestellt (Conversation.optedOutAt, lib/whatsapp/stopp.ts): kein WhatsApp mehr
//   - Sperrliste des Vermittlers (BestandOptOut, Abmeldelink): scope "email" = keine E-Mail-Werbung,
//     scope "all" = auch kein WhatsApp
// Ohne Meta-Formular, Nachweis und Abmeldung gibt es nichts zu zeigen (wie bisher).
// Rein (ohne Datenbank), Tests: tests/unit/einwilligung-stand.test.ts

import type { ConsentNachweis } from "@/lib/einwilligung-leadformular";

export type Kanal = "WhatsApp" | "E-Mail" | "Telefon";
export const ALLE_KANAELE: Kanal[] = ["WhatsApp", "E-Mail", "Telefon"];

/** vollstaendig: Etikett; eingeschraenkt: gelber Hinweis; keine/widerrufen: roter Hinweis; ohne: nichts zeigen */
export type EinwilligungsStufe = "vollstaendig" | "eingeschraenkt" | "keine" | "widerrufen" | "ohne";

export type EinwilligungEingabe = {
  waConsent: string | null | undefined;
  /** Lead.consentData (Nachweis aus dem Leadformular) */
  consentData?: unknown;
  /** Lead kam direkt aus einem Meta-Formular (Lead.externalId) */
  meta: boolean;
  /** „STOPP“ bzw. bei WhatsApp abbestellt (Conversation.optedOutAt) */
  whatsappStoppAt?: Date | null;
  /** Abmeldung von E-Mail-Werbung (Sperrliste, scope "email") */
  mailAbgemeldetAt?: Date | null;
  /** Abmeldung von allen Kanälen (Sperrliste, scope "all") */
  alleAbgemeldetAt?: Date | null;
};

export type EinwilligungStand = {
  stufe: EinwilligungsStufe;
  /** Je Einschränkung ein Satz mit Folge im Klartext (leer bei vollständig bzw. ohne) */
  hinweise: string[];
  /** Kanäle mit Einwilligung nach Abzug von STOPP und Abmeldungen */
  kanaele: Kanal[];
  nachweis: { at: string | null; formId: string | null; textVersion: string | null; text: string | null } | null;
};

const tag = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

function nachweisAus(raw: unknown): EinwilligungStand["nachweis"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const n = raw as Partial<ConsentNachweis>;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const out = { at: s(n.at), formId: s(n.formId), textVersion: s(n.textVersion), text: s(n.text) };
  return out.at || out.text ? out : null;
}

export function einwilligungStand(e: EinwilligungEingabe): EinwilligungStand {
  const nachweis = nachweisAus(e.consentData);
  const hinweise: string[] = [];
  const ohneHaken = e.waConsent !== "ja" && e.waConsent !== "nein";
  // Ausgangslage aus dem Leadformular
  let kanaele: Kanal[] = e.waConsent === "ja" ? [...ALLE_KANAELE] : [];
  let stufe: EinwilligungsStufe = e.waConsent === "ja" ? "vollstaendig" : "ohne";
  if (e.waConsent === "nein") {
    stufe = "keine";
    hinweise.push("Keine Einwilligung für WhatsApp: Der Assistent schreibt nicht, bitte per E-Mail oder Telefon melden.");
  } else if (ohneHaken && (e.meta || nachweis)) {
    stufe = "keine";
    hinweise.push("Keine Einwilligung gespeichert: Das Formular hatte kein Häkchen, der Assistent schreibt trotzdem per WhatsApp.");
  }
  // Widerruf und Abmeldungen schränken weiter ein
  const widerruf = (h: string, weg: Kanal[]) => {
    hinweise.push(h);
    kanaele = kanaele.filter((k) => !weg.includes(k));
    stufe = "widerrufen";
  };
  if (e.alleAbgemeldetAt) {
    widerruf(`Abgemeldet am ${tag(e.alleAbgemeldetAt)}: keine Werbung per WhatsApp oder E-Mail.`, ["WhatsApp", "E-Mail"]);
  } else if (e.whatsappStoppAt) {
    widerruf(`WhatsApp widerrufen am ${tag(e.whatsappStoppAt)} („STOPP“): Der Assistent schreibt nicht mehr.`, ["WhatsApp"]);
  }
  if (e.mailAbgemeldetAt && !e.alleAbgemeldetAt) {
    hinweise.push(`Abgemeldet am ${tag(e.mailAbgemeldetAt)}: keine Werbung per E-Mail.`);
    kanaele = kanaele.filter((k) => k !== "E-Mail");
    if (stufe === "vollstaendig" || stufe === "ohne") stufe = "eingeschraenkt";
  }
  return { stufe, hinweise, kanaele, nachweis };
}

/** Farbe des Hinweises: Gelb bei eingeschränkt, Rot bei keiner bzw. widerrufener Einwilligung. */
export function einwilligungTon(stufe: EinwilligungsStufe): "gelb" | "rot" | null {
  if (stufe === "eingeschraenkt") return "gelb";
  if (stufe === "keine" || stufe === "widerrufen") return "rot";
  return null;
}
