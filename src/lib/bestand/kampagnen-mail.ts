// E-Mail-Fassung der Bestandskampagnen (Ole, 14.11.2026): Betreff und Text je Anlass, Anrede wie im
// Du/Sie-Auftrag (Bestandskunden werden gesiezt, Texte liegen trotzdem in beiden Fassungen vor), ohne
// Gedankenstriche. Unter jeder Mail automatisch: Abmeldelink (ein Klick, ohne Login) und Pflichtangaben
// bzw. Impressum des Vermittlers. Text plus schlichtes HTML, ohne Tracking-Pixel und ohne Bilder.
// Rein, ohne Datenbank (auch für die Vorschau im Browser).

import { a, anredeZeile, type AnredeKontakt, type Ansprache } from "@/lib/ansprache";
import type { Occasion } from "@/lib/bestand/campaigns";

/** Platzhalter im eigenen Text des Vermittlers. */
export const MAIL_PLATZHALTER = ["{anrede}", "{thema}", "{terminlink}", "{datum}", "{anzahl}", "{empfehlungslink}", "{meinname}"] as const;
export type PlatzhalterKey = "anrede" | "thema" | "terminlink" | "datum" | "anzahl" | "empfehlungslink" | "meinname";

/**
 * Platzhalter im Editor als lesbare Chips bzw. „[Anrede]“ statt roher „{anrede}“ (Paket 2: nirgends rohe {…}). Beim
 * Speichern werden sie zurückübersetzt (platzhalterAusAnzeige).
 */
export const PLATZHALTER_LABEL: Record<PlatzhalterKey, string> = {
  anrede: "Anrede",
  thema: "Thema",
  terminlink: "Terminlink",
  datum: "Datum",
  anzahl: "Anzahl Verträge",
  empfehlungslink: "Empfehlungslink",
  meinname: "Mein Name",
};

/** Welche Platzhalter je Anlass sinnvoll sind (Chips im Editor). */
export function platzhalterFuer(o: Occasion): PlatzhalterKey[] {
  const base: PlatzhalterKey[] = ["anrede", "meinname"];
  switch (o) {
    case "cross_sell":
      return ["anrede", "thema", "terminlink", "meinname"];
    case "review":
      return ["anrede", "anzahl", "terminlink", "meinname"];
    case "renewal":
      return ["anrede", "thema", "datum", "terminlink", "meinname"];
    case "empfehlung":
      return ["anrede", "empfehlungslink", "meinname"];
    default:
      return base;
  }
}

/** {anrede} → [Anrede] (Anzeige im Editor). */
export function platzhalterZuAnzeige(s: string): string {
  return s.replace(/\{(anrede|thema|terminlink|datum|anzahl|empfehlungslink|meinname)\}/g, (_m, k: PlatzhalterKey) => `[${PLATZHALTER_LABEL[k]}]`);
}

/** [Anrede] → {anrede} (beim Speichern des eigenen Texts). Unbekanntes bleibt, wie es ist. */
export function platzhalterAusAnzeige(s: string): string {
  let out = s;
  for (const [k, label] of Object.entries(PLATZHALTER_LABEL)) out = out.split(`[${label}]`).join(`{${k}}`);
  return out;
}

/**
 * Personenversicherungen (Kranken, Leben, BU, Unfall, Pflege, Altersvorsorge): Im Betreff und in WhatsApp-Platzhaltern
 * steht die Sparte nicht, sondern neutral „Ihr Vertrag“ (Recht, 19.11.2026: Rückschluss auf Gesundheit vermeiden).
 */
export function istPersonenversicherung(thema: string | null | undefined): boolean {
  return /kranken|leben|berufsunf|\bbu\b|unfall|pflege|vorsorge|risikoleben|zahn/i.test(thema ?? "");
}

const JA_MAIL = (an: Ansprache) => a(an, "Oder antworte einfach mit Ja auf diese E-Mail.", "Oder antworten Sie einfach mit Ja auf diese E-Mail.");
const GRUSS = "\n\nViele Grüße\n{meinname}";

/**
 * Standardtext je Anlass ({anrede} = „Guten Tag Frau Muster,“). Paket 2 (20.11.2026): persönlich, ohne unbelegte
 * Behauptungen, Ende mit Terminlink oder „einfach mit Ja antworten“ (die Zeile mit {terminlink} entfällt ohne
 * Buchungsseite). Nie Euro, nie „Garantie“, ohne Gedankenstriche.
 */
export function defaultCampaignMail(o: Occasion, an: Ansprache = "sie"): { subject: string; body: string } {
  const termin = `\n\nTermin wählen: {terminlink}\n${JA_MAIL(an)}`;
  switch (o) {
    case "cross_sell":
      return {
        subject: a(an, "{thema}: Bist du schon versorgt?", "{thema}: Sind Sie schon versorgt?"),
        body:
          a(
            an,
            "{anrede}\n\nzum Thema {thema} habe ich bei dir noch keinen Vertrag notiert. Soll ich kurz prüfen, ob du dort gut versorgt bist?",
            "{anrede}\n\nzum Thema {thema} habe ich bei Ihnen noch keinen Vertrag notiert. Soll ich kurz prüfen, ob Sie dort gut versorgt sind?",
          ) +
          termin +
          GRUSS,
      };
    case "review":
      return {
        subject: a(an, "Dein Jahrescheck: 15 Minuten", "Ihr Jahrescheck: 15 Minuten"),
        body:
          a(
            an,
            "{anrede}\n\ndu hast {anzahl} Verträge bei mir. Einmal im Jahr lohnt ein kurzer Blick, ob Beitrag und Leistung noch zu deiner Situation passen. 15 Minuten am Telefon reichen.",
            "{anrede}\n\nSie haben {anzahl} Verträge bei mir. Einmal im Jahr lohnt ein kurzer Blick, ob Beitrag und Leistung noch zu Ihrer Situation passen. 15 Minuten am Telefon reichen.",
          ) +
          termin +
          GRUSS,
      };
    case "birthday":
      // Nur gratulieren: ohne Produkt, ohne Altersaussage und ohne Frage nach Veränderungen (Persona-Abnahme 20.11.2026)
      return {
        subject: "Herzlichen Glückwunsch zum Geburtstag",
        body:
          a(
            an,
            "{anrede}\n\nherzlichen Glückwunsch zum Geburtstag! Ich wünsche dir einen schönen Tag und alles Gute für das neue Lebensjahr.",
            "{anrede}\n\nherzlichen Glückwunsch zum Geburtstag! Ich wünsche Ihnen einen schönen Tag und alles Gute für das neue Lebensjahr.",
          ) + GRUSS,
      };
    case "renewal":
      return {
        subject: a(an, "Dein Vertrag {thema} verlängert sich am {datum}", "Ihr Vertrag {thema} verlängert sich am {datum}"),
        body:
          a(
            an,
            "{anrede}\n\ndein Vertrag {thema} verlängert sich am {datum}. Bis dahin kann man Beitrag und Leistung noch gut vergleichen. Soll ich das kurz für dich prüfen?",
            "{anrede}\n\nIhr Vertrag {thema} verlängert sich am {datum}. Bis dahin kann man Beitrag und Leistung noch gut vergleichen. Soll ich das kurz für Sie prüfen?",
          ) +
          termin +
          GRUSS,
      };
    case "empfehlung":
      return {
        subject: "Eine kleine Bitte",
        body: a(
          an,
          "{anrede}\n\nkennst du jemanden, dem ich genauso weiterhelfen kann? Über deinen persönlichen Link kann die Person ganz einfach selbst Kontakt mit mir aufnehmen: {empfehlungslink}\n\nVielen Dank und viele Grüße\n{meinname}",
          "{anrede}\n\nkennen Sie jemanden, dem ich genauso weiterhelfen kann? Über Ihren persönlichen Link kann die Person ganz einfach selbst Kontakt mit mir aufnehmen: {empfehlungslink}\n\nVielen Dank und viele Grüße\n{meinname}",
        ),
      };
  }
}

export type MailWerte = {
  ansprache?: Ansprache;
  kontakt: AnredeKontakt | null;
  thema?: string | null;
  empfehlungslink?: string | null;
  meinname: string;
  /** Buchungsseite des Vermittlers (mit Zuordnung); ohne entfällt die Zeile mit {terminlink}. */
  terminlink?: string | null;
  /** Ablauf/Verlängerung, schon formatiert („01.03.2027“); ohne wird aus „am {datum}“ „bald“. */
  datum?: string | null;
  /** Zahl der Verträge; ohne (oder 0) entfällt der Satz mit {anzahl}, bei 1 „einen Vertrag“. */
  anzahl?: number | null;
};

const gross = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Zeilen mit {terminlink} entfernen, wenn es keinen Link gibt; „Oder antworten …“ danach wird „Antworten …“. */
function ohneTerminlink(s: string): string {
  const lines = s.split("\n");
  const out: string[] = [];
  let dropped = false;
  for (const l of lines) {
    if (l.includes("{terminlink}")) {
      dropped = true;
      continue;
    }
    out.push(dropped && /^Oder /.test(l) ? gross(l.slice(5)) : l);
    dropped = false;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** {anzahl}: ab 2 die Zahl, bei 1 „einen Vertrag“, sonst fällt der Satz weg. */
function mitAnzahl(s: string, n: number | null | undefined): string {
  if (n != null && n >= 2) return s.replace(/\{anzahl\}/g, String(n));
  if (n === 1) return s.replace(/\{anzahl\} Verträge/g, "einen Vertrag").replace(/\{anzahl\}/g, "1");
  return s.replace(/[^.!?\n]*\{anzahl\}[^.!?\n]*[.!?] ?/g, "");
}

/** Platzhalter füllen. Ohne Thema wird „{thema}“ neutral ersetzt. */
export function fillCampaignMail(tpl: { subject: string; body: string }, w: MailWerte): { subject: string; body: string } {
  const an = w.ansprache ?? "sie";
  const thema = w.thema?.trim() || a(an, "deine Absicherung", "Ihre Absicherung");
  const map: Record<string, string> = {
    "{anrede}": anredeZeile(an, w.kontakt),
    "{thema}": thema,
    "{empfehlungslink}": w.empfehlungslink ?? "",
    "{meinname}": w.meinname,
    "{terminlink}": w.terminlink ?? "",
    "{datum}": w.datum ?? "",
  };
  // Ohne Thema: „Ihr Vertrag {thema}“ → „Ihr Vertrag“ (statt „Ihr Vertrag Ihre Absicherung“)
  const noTopic = (s: string, ohne: boolean) => (ohne ? s.replace(/(Vertrag) \{thema\}/g, "$1") : s);
  const prep = (s: string) => {
    let t = w.terminlink ? s : ohneTerminlink(s);
    t = w.datum ? t : t.replace(/ am \{datum\}/g, " bald").replace(/\{datum\}/g, "");
    return mitAnzahl(t, w.anzahl);
  };
  const fill = (s: string) => s.replace(/\{(anrede|thema|empfehlungslink|meinname|terminlink|datum)\}/g, (m) => map[m] ?? m);
  // Betreff bei Personenversicherungen neutral: „Ihr Vertrag“ statt der Sparte
  const sensibel = istPersonenversicherung(w.thema);
  const subjectTpl = sensibel ? noTopic(prep(tpl.subject), true).replace(/\{thema\}/g, a(an, "dein Vertrag", "Ihr Vertrag")) : noTopic(prep(tpl.subject), !w.thema?.trim());
  // „Ihr Vertrag : bald …“ vermeiden, falls der Betreff ohne Thema endet
  const subject = gross(fill(subjectTpl).replace(/\s+:/g, ":").trim());
  return { subject, body: fill(noTopic(prep(tpl.body), !w.thema?.trim())).trim() };
}

/**
 * Fußzeile jeder Kampagnen-Mail: Absender, Widerspruchshinweis nach § 7 Abs. 3 Nr. 4 UWG mit Ein-Klick-Abmeldung
 * (P0-2, 19.11.2026: Hinweis in jeder Mail, auch bei Einwilligung), Pflichtangaben. Zwei Absätze plus Impressum.
 */
export function campaignMailFooter(o: { firm: string; unsubscribeUrl: string; imprint: string | null; ansprache?: Ansprache }): string {
  const an = o.ansprache ?? "sie";
  return [
    a(an, `Du bekommst diese E-Mail als Kundin bzw. Kunde von ${o.firm}.`, `Sie erhalten diese E-Mail als Kundin bzw. Kunde von ${o.firm}.`),
    "",
    a(
      an,
      `Du kannst der Nutzung deiner E-Mail-Adresse für Werbung jederzeit widersprechen, es entstehen dir dabei nur die üblichen Übermittlungskosten. Mit einem Klick abmelden: ${o.unsubscribeUrl}`,
      `Sie können der Nutzung Ihrer E-Mail-Adresse für Werbung jederzeit widersprechen, es entstehen Ihnen dabei nur die üblichen Übermittlungskosten. Mit einem Klick abmelden: ${o.unsubscribeUrl}`,
    ),
    ...(o.imprint?.trim() ? ["", o.imprint.trim()] : []),
  ].join("\n");
}

/**
 * P.S. mit persönlichem Einwilligungslink unter einer Kampagnen-Mail (Paket 3, 20.11.2026). Nur wenn
 * wantsConsentPs (lib/bestand/einwilligung.ts) gilt; nie in Double-Opt-in- oder Service-Mails. Ohne Gedankenstriche.
 */
export function consentPsLine(url: string, ansprache: Ansprache = "sie"): string {
  return a(
    ansprache,
    `P.S. Lieber per WhatsApp oder auch zu anderen Themen von mir hören? Hier legst du es mit einem Klick fest: ${url}`,
    `P.S. Lieber per WhatsApp oder auch zu anderen Themen von mir hören? Hier legen Sie es mit einem Klick fest: ${url}`,
  );
}

/** Liegen Pflichtangaben (Impressum) vor? Ohne sie geht keine Kampagnen-Mail raus (Start und Versand). */
export function hasImprint(imprint: string | null | undefined): boolean {
  return !!imprint?.trim();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linkify = (s: string) => esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`);

/** Fertige Mail: Text und schlichtes HTML (ohne Bilder, ohne Tracking-Pixel). */
export function buildCampaignMail(body: string, footer: string): { text: string; html: string } {
  const text = `${body}\n\n\n${footer}`;
  const para = (block: string, style: string) => `<p style="${style}">${linkify(block).replace(/\n/g, "<br>")}</p>`;
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111">',
    ...body.split(/\n{2,}/).map((b) => para(b, "margin:0 0 14px")),
    '<div style="margin-top:28px;border-top:1px solid #ddd;padding-top:12px;font-size:12px;color:#666">',
    ...footer.split(/\n{2,}/).map((b) => para(b, "margin:0 0 8px")),
    "</div></div>",
  ].join("");
  return { text, html };
}

/** Pflichtangaben aus dem gelesenen Impressum der Website (Onboarding.websiteInfo), sonst null. */
export function imprintFromWebsiteInfo(info: unknown): string | null {
  if (!info || typeof info !== "object") return null;
  const i = info as Record<string, unknown>;
  const s = (k: string) => (typeof i[k] === "string" && (i[k] as string).trim() ? (i[k] as string).trim() : null);
  const lines = [
    s("companyName"),
    s("representative") ? `Vertreten durch: ${s("representative")}` : null,
    s("address"),
    [s("phone") ? `Telefon: ${s("phone")}` : null, s("email") ? `E-Mail: ${s("email")}` : null].filter(Boolean).join(", ") || null,
    s("registerNumber") ? `${s("registerType") ?? "Vermittlerregister"}: ${s("registerNumber")}` : null,
    s("chamber") ? `Zuständige Kammer: ${s("chamber")}` : null,
    s("impressumUrl") ? `Impressum: ${s("impressumUrl")}` : null,
  ].filter((x): x is string => !!x);
  return lines.length ? lines.join("\n") : null;
}

/** Gedankenstriche (– und —) in Texten an Kunden vermeiden: durch Komma ersetzen (Bis-Striche zwischen Zahlen bleiben). */
export { ohneGedankenstriche } from "@/lib/gedankenstriche";
