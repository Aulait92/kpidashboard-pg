// Datenschutz und Recht im Vertrieb (Ole, 19.11.2026): Prozess für Datenschutzanfragen und Abmahnungen aus der
// Kaltakquise. Reine Funktionen ohne Datenbank (Tests); Ablauf mit Datenbank, Instantly und Push in
// lib/vertrieb/datenschutz-recht-server.ts.
//
//   Erkennen: lib/vertrieb/nie-kontaktieren.ts (dsgvoAusAntwort) liefert den Befund, hier wird daraus die Unterart:
//     abmahnung (Abmahnung, Anwalt, Kanzlei im Drohkontext, Schadensersatz, Aufsicht, § 7 UWG) vor auskunft
//     (Art. 15, Herkunft, Einwilligungsnachweis, Datenschutz mit eigenem Bezug) vor loeschung (Art. 17) vor
//     widerspruch (Art. 21, Werbung ohne Einwilligung, Unterlassen …). Reine Austragung ist kein Rechtsfall.
//   Frist: Auskunft, Löschung, Widerspruch 7 Tage; Abmahnung sofort (Push an die Admins).
//   Domain-Sperre (Ole: „nur eigene Domains“): eigene Agentur-Domain zusätzlich sperren, nie Freemail und nie
//     Konzern- bzw. Portal-Domains (feste Liste oder mehr als 3 Vertriebskontakte mit der Domain): dort nur die Person.
//   Antwortvorlagen (a) Widerspruch, (b) Löschung, (c) Auskunft nach Art. 15: Sie-Form, ohne Gedankenstriche, nur als
//     Entwurf, den ein Admin prüft und sendet.

import { PROVIDER } from "@/lib/legal-texts";
import { FREEMAIL, INSURER } from "@/lib/vertrieb/dubletten";
import { mailDomain } from "@/lib/vertrieb/mischen";
import { AUSKUNFT_AUFGABE, auskunftsFrist, datumDe, type DsgvoBefund } from "@/lib/vertrieb/nie-kontaktieren";

export const RECHTS_ARTEN = ["auskunft", "loeschung", "widerspruch", "abmahnung"] as const;
export type RechtsArt = (typeof RECHTS_ARTEN)[number];
export const istRechtsArt = (a: unknown): a is RechtsArt => typeof a === "string" && (RECHTS_ARTEN as readonly string[]).includes(a);

export const RECHTS_ART_LABEL: Record<RechtsArt, string> = {
  auskunft: "Auskunft",
  loeschung: "Löschung",
  widerspruch: "Widerspruch",
  abmahnung: "Abmahnung",
};

/** Kategorie in der Einordnung der Antworten und in der Instantly-Auswertung (nie „neutral“). */
export { KATEGORIE_RECHT } from "@/lib/vertrieb/instantly-auswertung";

/** Unterart aus dem Befund einer Antwort oder null (kein Rechtsfall, z. B. reine Austragung). */
export function rechtsArtAusBefund(b: DsgvoBefund): RechtsArt | null {
  if (b.abmahnung) return "abmahnung";
  if (b.grund === "datenschutz") return "auskunft";
  if (b.loeschen) return "loeschung";
  if (b.grund === "widerspruch") return "widerspruch";
  return null;
}

/** Frist: Abmahnung sofort (= Eingang), sonst 7 Tage ab Eingang. */
export function rechtsFrist(art: RechtsArt, eingang: Date): Date {
  return art === "abmahnung" ? new Date(eingang) : auskunftsFrist(eingang);
}

/** Titel-Anfang der Aufgabe je Art (Auskunft wie bisher „Auskunft nach Art. 15 beantworten“). */
export const RECHT_AUFGABE: Record<RechtsArt, string> = {
  auskunft: AUSKUNFT_AUFGABE,
  loeschung: "Löschung bestätigen (Art. 17)",
  widerspruch: "Widerspruch bestätigen",
  abmahnung: "Abmahnung bzw. rechtliche Drohung",
};

/** Titel der Aufgabe an Ole, z. B. „Widerspruch bestätigen, Frist 26.11.2026“ bzw. „Abmahnung bzw. rechtliche Drohung: sofort prüfen“. */
export function rechtsAufgabeTitel(art: RechtsArt, eingang: Date): string {
  if (art === "abmahnung") return `${RECHT_AUFGABE.abmahnung}: sofort prüfen`;
  return `${RECHT_AUFGABE[art]}, Frist ${datumDe(rechtsFrist(art, eingang))}`;
}

export const ABMAHNUNG_HINWEIS = "Keine Unterlassungserklärung unterschreiben. Zur Prüfung an Claude geben.";
/** Abmahnung löscht nie automatisch, auch bei ausdrücklichem Löschverlangen (Ole, 19.11.2026). */
export const ABMAHNUNG_LOESCHUNG = "Löschung erst nach Prüfung per Knopf (Belege sichern).";

/** Notiz der Aufgabe (ohne Inhalte der Mail). */
export function rechtsAufgabeNotiz(art: RechtsArt): string {
  const vorlage = "Kontaktakte → Datenschutz und Recht: Vorlage prüfen und senden.";
  switch (art) {
    case "abmahnung":
      return `${ABMAHNUNG_HINWEIS} ${ABMAHNUNG_LOESCHUNG} Nicht selbst antworten, keine Zahlung zusagen. Der Kontakt ist gesperrt (App und Instantly).`;
    case "auskunft":
      return `Auskunft (Art. 15) schicken: ${vorlage} Der Kontakt ist gesperrt.`;
    case "loeschung":
      return `Löschung bestätigen: ${vorlage} Die App hat gelöscht, sofern keine Ausnahme vorliegt (dann eigene Aufgabe).`;
    case "widerspruch":
      return `Widerspruch bestätigen: ${vorlage} Der Kontakt ist gesperrt.`;
  }
}

// ─── Domain-Sperre nur für eigene Domains ───────────────────────────────────────────────────────────────────

/**
 * Konzern- und Portal-Domains (Ole, 19.11.2026): Adressen dort gehören einzelnen Vermittlern eines Konzerns bzw.
 * Vertriebs. Bei einem Rechtsfall wird nur die Person gesperrt, nie die Domain. Dazu die Versicherer-Domains aus dem
 * Dubletten-Abgleich. Unterdomains zählen mit (a-baum.lvm.de → lvm.de).
 */
export const KONZERN_DOMAINS: readonly string[] = [
  ...new Set([
    "dvag.de", "dvag.com", "allfinanz.ag", "ergo.de", "signal-iduna.net", "signal-iduna.de", "lvm.de", "tecis.de", "axa.de", "mecklenburgische.com",
    "telis-finanz.de", "provinzial.de", "provinzial.com", "hdi.de", "ovb.de", "allianz.de", "allianz-agentur.de", "generali.de", "ruv.de", "huk.de",
    "debeka.de", "devk.de", "zurich.de", "swisslife.de", "horbach.de", "nuernberger.de", "sparkassenversicherung.de", "sv-sachsen.de", "lippische.de",
    "mlp.de", "swisslife-select.de", "bonnfinanz.de", "plansecur.de", "axa-betreuer.de", "signal-iduna-agentur.de", "r-v.de", "wuerttembergische.de",
    "hallesche.de", "dkv.de", "arag.de", "vhv.de",
    ...INSURER,
  ]),
];

/** Ab so vielen verschiedenen Vertriebskontakten mit der Domain ist sie ein Konzern bzw. Portal (mehr als 3). */
export const KONZERN_AB_KONTAKTEN = 4;

const imListe = (host: string, liste: readonly string[] | Set<string>) => [...liste].some((d) => host === d || host.endsWith(`.${d}`));

/** Feste Konzern- bzw. Portal-Domain (ohne Zählung)? */
export function istKonzernDomainFest(domain: string): boolean {
  return imListe(domain.trim().toLowerCase(), KONZERN_DOMAINS);
}

/**
 * Domain, die zusätzlich zur Person gesperrt wird, oder null: nur eine eigene Agentur-Domain (nicht Freemail, nicht
 * Konzern bzw. Portal, keine Platzhalter). `kontakteMitDomain` = verschiedene Vertriebskontakte mit dieser Domain
 * (ohne Hüllen); mehr als 3 → Portal, nur die Person.
 */
export function sperrDomainVon(email: string | null | undefined, kontakteMitDomain: number): string | null {
  const host = String(email ?? "").trim().toLowerCase().split("@")[1] ?? "";
  if (!host.includes(".") || /\.(invalid|local)$/.test(host)) return null;
  const d = mailDomain(`x@${host}`);
  if (FREEMAIL.has(host) || FREEMAIL.has(d) || imListe(host, KONZERN_DOMAINS)) return null;
  if (kontakteMitDomain >= KONZERN_AB_KONTAKTEN) return null;
  return d;
}

// ─── Antwortvorlagen ─────────────────────────────────────────────────────────────────────────────────────

export type Vorlage = { betreff: string; text: string };
export const VORLAGEN = ["widerspruch", "loeschung", "auskunft"] as const;
export type VorlagenArt = (typeof VORLAGEN)[number];
export const VORLAGE_LABEL: Record<VorlagenArt, string> = { widerspruch: "Widerspruch bestätigen", loeschung: "Löschung bestätigen", auskunft: "Auskunft (Art. 15)" };
export const istVorlagenArt = (a: unknown): a is VorlagenArt => typeof a === "string" && (VORLAGEN as readonly string[]).includes(a);

const GRUSS = `Freundliche Grüße\n${PROVIDER.manager}\n${PROVIDER.name}\n${PROVIDER.street}, ${PROVIDER.city}`;

/** (a) Widerspruch: keine Werbung mehr, Adresse gesperrt. `anrede` z. B. „Guten Tag Herr Muster,“. */
export function vorlageWiderspruch(anrede: string): Vorlage {
  return {
    betreff: "Ihr Widerspruch: keine Werbung mehr",
    text: [
      anrede,
      "Ihren Widerspruch haben wir erhalten und sofort umgesetzt. Ihre E-Mail-Adresse ist bei uns gesperrt, Sie erhalten von uns keine Werbung mehr.",
      "Bitte entschuldigen Sie die Störung.",
      GRUSS,
    ].join("\n\n"),
  };
}

/** (b) Löschung: Löschdatum und Sperrvermerk (verschlüsselter Abgleichwert), damit nie wieder Werbung kommt. */
export function vorlageLoeschung(anrede: string, geloeschtAm: Date): Vorlage {
  return {
    betreff: "Ihre Daten sind gelöscht",
    text: [
      anrede,
      `Ihre Daten haben wir am ${datumDe(geloeschtAm)} gelöscht. Sie erhalten von uns keine Werbung mehr.`,
      "Gespeichert bleibt nur ein Sperrvermerk: ein verschlüsselter Abgleichwert Ihrer E-Mail-Adresse, nicht die Adresse selbst. Er dient allein dazu, dass Sie nie wieder Werbung von uns erhalten.",
      "Bitte entschuldigen Sie die Störung.",
      GRUSS,
    ].join("\n\n"),
  };
}

/** Daten aus der Akte für die Auskunft (lib/ops/vertrieb-auskunft.ts vertriebAuskunftDaten). */
export type AuskunftAkte = {
  /** Bezeichnung → Wert (gespeicherte Felder) */
  felder: Record<string, unknown>;
  herkunft: {
    art: string;
    quelle?: unknown;
    gesellschaft?: unknown;
    emailQuelle?: unknown;
    quelleUrl?: unknown;
    abgerufenAm?: unknown;
    importiertAm?: unknown;
    angelegt?: string | null;
    /** Anlage in Instantly (YYYY-MM-DD), bei direkt in Instantly hochgeladenen Kontakten */
    inInstantlySeit?: string | null;
    verlauf?: { datum: string | null; notiz: string | null }[];
  };
  /** google | kalender | whatsapp (Instantly und Hosting stehen immer drin) */
  weitereEmpfaenger: ("google" | "kalender" | "whatsapp")[];
  /** Mails an den Kontakt (Datum, Weg) */
  mailsAnIhn: { datum: string | null; weg: string }[];
  /** Datum der Antworten des Kontakts */
  antwortenVonIhm: (string | null)[];
  /** gesperrt seit (YYYY-MM-DD) */
  gesperrtSeit: string | null;
};

const iso = (v: unknown) => {
  const m = typeof v === "string" ? v.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : typeof v === "string" ? v : null;
};
const wert = (v: unknown): string => {
  if (Array.isArray(v)) return v.map(wert).join(", ");
  if (typeof v === "number") return v.toLocaleString("de-DE");
  if (typeof v === "boolean") return v ? "ja" : "nein";
  const s = String(v ?? "").trim();
  return iso(s) && /^\d{4}-\d{2}-\d{2}/.test(s) ? iso(s)! : s;
};
const ohneStriche = (s: string) => s.replace(/\s*[–—]\s*/g, ", ");

const EMPFAENGER_TEXT: Record<AuskunftAkte["weitereEmpfaenger"][number], string> = {
  google: "Google (Abgleich öffentlicher Firmenangaben über Google Places)",
  kalender: "Calendly bzw. Ihr Kalenderanbieter (Terminbuchung)",
  whatsapp: "360dialog (WhatsApp-Nachrichten über unsere Support-Nummer)",
};

/** Platzhalter für die Herkunft, die Ole vor dem Senden ersetzen muss (rechtsVorlageSenden prüft das). */
export const HERKUNFT_PLATZHALTER = "[HERKUNFT ERGÄNZEN: konkrete Quelle, z. B. Website bzw. Verzeichnis mit Adresse und Abrufdatum, oder Anbieter der Liste]";
export const hatPlatzhalter = (text: string) => /\[[A-ZÄÖÜ ]{6,}ERGÄNZEN:/.test(text);

/** Herkunft in einem Satz: Quelle, Quell-URL, Abrufdatum. */
export function herkunftSatz(h: AuskunftAkte["herkunft"]): string {
  if (h.art === "öffentliche Vermittlerliste") {
    const teile = [
      h.quelle ? `Quelle: ${wert(h.quelle)}` : null,
      h.gesellschaft ? `Gesellschaft: ${wert(h.gesellschaft)}` : null,
      h.emailQuelle ? `Fundstelle der E-Mail-Adresse: ${wert(h.emailQuelle)}` : null,
      h.quelleUrl ? `Quell-URL: ${wert(h.quelleUrl)}` : null,
      h.abgerufenAm ? `abgerufen am ${iso(h.abgerufenAm) ?? wert(h.abgerufenAm)}` : null,
    ].filter(Boolean);
    return `Ihre Daten stammen aus einem öffentlich zugänglichen Vermittlerverzeichnis (${teile.join("; ")}).`;
  }
  const seit = iso(h.angelegt);
  const notizen = (h.verlauf ?? []).map((v) => v.notiz?.trim()).filter(Boolean);
  // Ohne belegte Quelle (z. B. direkt in Instantly hochgeladen): deutlicher Platzhalter, Senden ist gesperrt, bis Ole die
  // konkrete Quelle einträgt (Art. 15 Abs. 1 lit. g verlangt „alle verfügbaren Informationen über die Herkunft“)
  // Direkt in Instantly hochgeladen: Die Listen wurden aus öffentlichen Angaben im Internet KI-gestützt recherchiert
  // (Ole, 24.11.2026: „die kontakte wurden alle von claude gescraped“). Fundstelle und Abrufdatum wurden nicht
  // gespeichert; Art. 15 Abs. 1 lit. g verlangt die verfügbaren Informationen, das sagt der Text offen.
  if (h.art.startsWith("Instantly") || h.art === "laut Verlauf") {
    const instantly = iso(h.inInstantlySeit);
    return [
      "Ihre Daten (Name und geschäftliche E-Mail-Adresse) stammen aus öffentlich zugänglichen Angaben im Internet, zum Beispiel Webseiten, Impressum sowie Berater- und Vermittlerprofile. Wir haben sie mit KI-Unterstützung recherchiert.",
      "Die genaue Fundstelle und das Abrufdatum haben wir dabei nicht gespeichert.",
      `Für den Versand haben wir sie ${instantly ? `am ${instantly} ` : ""}in unser E-Mail-System (Instantly) übernommen${seit ? `; in unserer Anwendung sind sie seit ${seit} gespeichert` : ""}.`,
    ].join(" ");
  }
  return `Ihre Daten sind bei uns${seit ? ` seit ${seit}` : ""} gespeichert. Herkunft laut unseren Unterlagen: ${h.art}${notizen.length ? ` (${notizen.join("; ")})` : ""}.`;
}

/** Herkunft mit Quelle bzw. Quell-URL und Abrufdatum? Sonst muss Ole sie vor dem Senden ergänzen (Art. 15 Abs. 1 g). */
export function herkunftVollstaendig(h: AuskunftAkte["herkunft"]): boolean {
  return h.art === "öffentliche Vermittlerliste" && !!(h.quelleUrl || h.quelle) && !!h.abgerufenAm;
}

/** (c) Auskunft nach Art. 15 DSGVO, vollständig aus der Akte. */
export function vorlageAuskunft(anrede: string, akte: AuskunftAkte): Vorlage {
  const felder = Object.entries(akte.felder).map(([k, v]) => `- ${k}: ${wert(v)}`);
  const mails = akte.mailsAnIhn.filter((m) => m.datum);
  const daten = [
    ...felder,
    mails.length ? `- E-Mails von uns an Sie: ${mails.length} (${[...new Set(mails.map((m) => iso(m.datum)))].join(", ")})` : null,
    akte.antwortenVonIhm.length ? `- Ihre Antworten an uns: ${akte.antwortenVonIhm.length} (${akte.antwortenVonIhm.map(iso).join(", ")})` : null,
    akte.gesperrtSeit ? `- Sperrvermerk (keine Werbung mehr) seit ${iso(akte.gesperrtSeit)}` : null,
  ].filter(Boolean);
  const empfaenger = [
    "- Instantly (Versand unserer E-Mails), Anbieter in den USA; die Übermittlung erfolgt auf Grundlage von Standardvertragsklauseln der EU-Kommission",
    "- Railway (Betrieb unserer Anwendung und Datenbank, Speicherort in der EU)",
    // Vertrieb nutzt Claude direkt bei Anthropic (lib/kampagnen/llm.ts), nicht über Bedrock in der EU (Ole, 24.11.2026)
    "- Anthropic (KI-gestützte Auswertung Ihrer Antworten an uns, z. B. Erkennen von Abmeldewünschen), Anbieter in den USA; die Übermittlung erfolgt auf Grundlage von Standardvertragsklauseln der EU-Kommission",
    ...akte.weitereEmpfaenger.map((e) => `- ${EMPFAENGER_TEXT[e]}`),
  ];
  const text = [
    anrede,
    "Sie haben Auskunft über Ihre bei uns gespeicherten Daten verlangt (Art. 15 DSGVO). Hier ist sie.",
    `1. Gespeicherte Daten\n${daten.join("\n")}`,
    `2. Herkunft\n${herkunftSatz(akte.herkunft)}`,
    "3. Zweck\nGeschäftliche Ansprache für unsere eigene Dienstleistung (Gewinnung von Kunden für unsere Leistungen für Versicherungsvermittler).",
    "4. Rechtsgrundlage\nArt. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der geschäftlichen Ansprache).",
    `5. Empfänger\n${empfaenger.join("\n")}`,
    // Zusage ohne Unterlassungserklärung und Löschung auf Wunsch (Ole, 24.11.2026; Rechtsprüfung docs/recht/)
    `6. Werbung und Speicherdauer\nWir werden Sie nicht mehr zu Werbezwecken kontaktieren; Ihre Adresse ist ${akte.gesperrtSeit ? `seit ${iso(akte.gesperrtSeit)} ` : ""}gesperrt. Auf Ihren Wunsch löschen wir Ihre Daten. Dauerhaft bleibt dann nur ein Sperrvermerk in nicht lesbarer Form (ein Prüfwert Ihrer E-Mail-Adresse), damit Sie auch künftig keine Werbung von uns erhalten.`,
    "7. Ihre Rechte\nSie können Berichtigung (Art. 16), Löschung (Art. 17) und Einschränkung der Verarbeitung (Art. 18) verlangen und der Verarbeitung widersprechen (Art. 21 DSGVO). Außerdem können Sie sich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO). Eine automatisierte Entscheidungsfindung findet nicht statt.",
    `8. Verantwortlicher\n${PROVIDER.name}, ${PROVIDER.street}, ${PROVIDER.city}, ${PROVIDER.email}\nWir haben keinen Datenschutzbeauftragten bestellt. Ansprechpartner: ${PROVIDER.manager}`,
    GRUSS,
  ].join("\n\n");
  return { betreff: "Auskunft nach Art. 15 DSGVO", text: ohneStriche(text) };
}
