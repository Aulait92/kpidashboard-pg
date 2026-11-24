// Texte der Mail-Strecke für Leads ohne WhatsApp (Ole, 18.11.2026, docs/plan-mailstrecke-dsgvo-investoren.md E0 bis E4,
// E7). Rein, ohne Datenbank, getestet (tests/unit/mail-strecke.test.ts). Du und Sie (Customer.leadAddress), keine
// Gedankenstriche, Vermittler als Person („Herrn Kannapinn“, lib/vermittler-nennung.ts).
//
// Erstmail wie die WhatsApp-Erstnachricht v8 (lib/whatsapp/erstanschreiben.ts): Dank mit Thema, „digitaler
// KI-Assistent von …“ (KI-VO Art. 50), eine Öffnungsfrage mit 2 bis 3 Knöpfen, dazu zwei freie Zeiten und „Andere Zeit“,
// Erstinformation als PDF im Anhang, Impressum, Datenschutz und Abmeldelink. Jeder Knopf ist ein Link auf die
// Antwortseite /t/<token>; gespeichert wird dort erst mit einem Klick im Browser (Link-Scanner rufen Links nur ab).

import { vermittlerBeruf } from "@/lib/vermittler-nennung";
import { a, type AnredeKontakt, type Ansprache } from "@/lib/ansprache";
import { erstanschreibenZweck, frageplan, outreachProdukt, v8Thema, type ErstanschreibenZweck, type FormAntwort } from "@/lib/whatsapp/erstanschreiben";
import { erstanschreibenThema } from "@/lib/whatsapp/erstanschreiben";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";
import type { LeadSignatur } from "@/lib/mail/lead-absender";
import type { VermittlerName } from "@/lib/vermittler-nennung";
import type { QualificationKey } from "@/lib/whatsapp/qualification";

export type Ausloeser = "kein_whatsapp" | "keine_nummer" | "festnetz" | "keine_einwilligung";

export const AUSLOESER_LABEL: Record<Ausloeser, string> = {
  kein_whatsapp: "Nummer nicht bei WhatsApp",
  keine_nummer: "Keine Telefonnummer",
  festnetz: "Festnetznummer",
  keine_einwilligung: "Keine Einwilligung in WhatsApp",
};

/** Öffnungsfrage der Erstmail mit 2 bis 3 Antworten (Knöpfe). feld = wohin die Antwort geht (Lead.needData). */
export type Oeffnungsfrage = { key: string; feld: QualificationKey | "wunsch"; text: string; knoepfe: string[] };

/** Knöpfe für Fragen, die im Chat frei beantwortet werden (in der Mail braucht jede Frage 2 bis 3 Antworten). */
const MAIL_KNOEPFE: Record<string, string[]> = {
  vorhanden: ["Schon versichert", "Wäre neu", "Teils, teils"],
  tkv_alter: ["Jünger als 2 Jahre", "2 bis 6 Jahre", "Älter als 6 Jahre"],
  tkv_umfang: ["Nur Operationen", "Auch Tierarztbesuche", "Weiß noch nicht"],
  pkv_status: ["Gesetzlich", "Privat"],
  zahn_gkv: ["Ja", "Nein, privat"],
  privat_wer: ["Nur ich", "Mit Partner", "Ganze Familie"],
};

/**
 * Öffnungsfrage für die Erstmail (rein): die erste offene Frage des Frageplans (nichts fragen, was das Formular schon
 * beantwortet) mit ihren Knöpfen; ohne Produkt bzw. wenn alles bekannt ist: „Wie möchten Sie am liebsten sprechen?“.
 */
export function oeffnungsfrage(source: string | null | undefined, formular: FormAntwort[] | null | undefined, an: Ansprache): Oeffnungsfrage {
  const plan = frageplan(source, formular);
  const p = plan.produkt;
  const f = plan.offen[0];
  if (p && f) {
    const text = a(an, f.du, f.sie);
    let knoepfe: string[] = f.key === "frage1" ? [...p.knoepfe] : [];
    if (!knoepfe.length) {
      if (f.key === "vorhanden") knoepfe = MAIL_KNOEPFE.vorhanden;
      else if (p.purpose === "outreach_tkv") knoepfe = f.key === "frage1" ? MAIL_KNOEPFE.tkv_alter : MAIL_KNOEPFE.tkv_umfang;
      else if (p.purpose === "outreach_pkv") knoepfe = MAIL_KNOEPFE.pkv_status;
      else if (p.purpose === "outreach_zahn") knoepfe = MAIL_KNOEPFE.zahn_gkv;
      else if (p.purpose === "outreach_privatschutz") knoepfe = MAIL_KNOEPFE.privat_wer;
    }
    if (knoepfe.length >= 2) return { key: f.key, feld: f.feld as QualificationKey, text, knoepfe: knoepfe.slice(0, 3) };
  }
  return { key: "wunsch", feld: "wunsch", text: a(an, "Wie möchtest du am liebsten sprechen?", "Wie möchten Sie am liebsten sprechen?"), knoepfe: ["Per Video", "Per Telefon"] };
}

/** „ zur Zahnzusatzversicherung“ bzw. „ zum Thema …“ bzw. leer (wie v8); nur Hausrat: „ zu Ihrer Hausratversicherung“. */
export function anfrageThema(source: string | null | undefined, an: Ansprache = "sie", formular?: FormAntwort[] | null): string {
  const p = outreachProdukt(source);
  if (p) return v8Thema(erstanschreibenZweck(source, formular) as ErstanschreibenZweck, an);
  const s = (source ?? "").trim();
  return s ? ` zum Thema ${erstanschreibenThema(source)}` : "";
}

export type MailLink = { label: string; url: string };

/** Art der Mail im Takt (Ole, 18.11.2026): Tag 1 Erstmail, Tag 2 neue Zeiten, Tag 6 Nutzen und Zeiten, Tag 10 schließen. */
export type MailArtStrecke = "erst" | "zeiten" | "nutzen" | "schliessen";

export type ErstmailInput = {
  an: Ansprache;
  /** Anrede-Zeile ohne Komma („Guten Tag Frau Becker“, „Hallo Julia“, „Guten Tag“) */
  anrede: string;
  /** Name für den Betreff („Frau Becker“) oder null */
  betreffName: string | null;
  person: VermittlerName;
  source: string | null;
  /** Angaben aus dem Leadformular (nur Hausrat angefragt: „zu Ihrer Hausratversicherung“) */
  formular?: FormAntwort[] | null;
  ausloeser: Ausloeser;
  frage: Oeffnungsfrage | null;
  /** Links der Antwort-Knöpfe (gleiche Reihenfolge wie frage.knoepfe) */
  antwortLinks: string[];
  /** Zwei Zeiten (Beschriftung und Link); leer ohne Kalender */
  zeiten: MailLink[];
  andereZeit: string | null;
  /** Antwortseite ohne Vorauswahl */
  seite: string;
  erstinfoPdf: boolean;
  erstinfoUrl: string | null;
  impressumUrl: string | null;
  datenschutzUrl: string | null;
  abmeldeUrl: string;
  signatur: LeadSignatur;
  /** Standard „erst“ */
  art?: MailArtStrecke;
  /** Nutzensatz für Tag 6 (lib/whatsapp/gespraech.ts terminNutzenSatz) */
  nutzen?: string | null;
};

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const btn = (k: MailLink, art: "haupt" | "neben") =>
  `<a href="${esc(k.url)}" style="display:inline-block;margin:4px 6px 4px 0;padding:11px 16px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;${
    art === "haupt" ? "background:#2563eb;color:#ffffff" : "border:1px solid #c9d3e3;color:#0b1220;background:#ffffff"
  }">${esc(k.label)}</a>`;

/** Einleitung je Auslöser (nur bei „kein WhatsApp“ ein Satz, warum per E-Mail). */
function warumMail(an: Ansprache, ausloeser: Ausloeser): string | null {
  if (ausloeser !== "kein_whatsapp") return null;
  return a(an, "Per WhatsApp kam meine Nachricht leider nicht an, darum schreibe ich dir hier.", "Per WhatsApp kam meine Nachricht leider nicht an, darum schreibe ich Ihnen hier.");
}

/** Satz für Tag 10 (Ole, 18.11.2026), beide Fassungen. */
export function schliessenSatz(an: Ansprache): string {
  return a(
    an,
    "Soll ich deine Anfrage schließen? Ein Klick genügt, wenn du doch noch einen Termin möchtest.",
    "Soll ich Ihre Anfrage schließen? Ein Klick genügt, wenn Sie doch noch einen Termin möchten.",
  );
}

/**
 * Mail der Strecke (rein): Betreff, Text und HTML. Keine Gedankenstriche, keine Minutenangaben.
 */
export function erstmailInhalt(o: ErstmailInput): { subject: string; text: string; html: string } {
  const an = o.an;
  const thema = anfrageThema(o.source, an, o.formular);
  const art = o.art ?? "erst";
  const ki = a(an, `Hier schreibt der digitale KI-Assistent von ${o.person.dat}.`, `Hier schreibt der digitale KI-Assistent von ${o.person.dat}.`);
  const einleitung =
    art === "erst"
      ? [`${a(an, "danke für deine Anfrage", "danke für Ihre Anfrage")}${thema}! ${ki}`, warumMail(an, o.ausloeser)].filter(Boolean).join(" ")
      : art === "zeiten"
        ? a(an, `falls es noch nicht gepasst hat: Hier sind zwei neue Zeiten für dein kostenloses Gespräch mit ${o.person.dat}.`, `falls es noch nicht gepasst hat: Hier sind zwei neue Zeiten für Ihr kostenloses Gespräch mit ${o.person.dat}.`)
        : art === "nutzen"
          ? [`${a(an, "ich melde mich noch einmal wegen deiner Anfrage", "ich melde mich noch einmal wegen Ihrer Anfrage")}${thema}.`, o.nutzen ?? ""].filter(Boolean).join(" ")
          : schliessenSatz(an);
  const frage = art === "erst" && o.frage && o.frage.knoepfe.length >= 2 ? o.frage : null;
  const antworten: MailLink[] = frage ? frage.knoepfe.map((label, i) => ({ label, url: o.antwortLinks[i] })).filter((k) => !!k.url) : [];
  const mitZeiten = art !== "schliessen" && o.zeiten.length > 0;
  const zeitenTitel =
    art === "schliessen"
      ? null
      : mitZeiten
        ? art === "erst" && frage
          ? a(an, `Oder gleich einen kostenlosen Termin mit ${o.person.dat} wählen, per Video oder Telefon:`, `Oder gleich einen kostenlosen Termin mit ${o.person.dat} wählen, per Video oder Telefon:`)
          : a(an, "Wähl einfach eine Zeit, per Video oder Telefon:", "Wählen Sie einfach eine Zeit, per Video oder Telefon:")
        : a(an, `Wann passt dir ein kurzes Gespräch mit ${o.person.dat}?`, `Wann passt Ihnen ein kurzes Gespräch mit ${o.person.dat}?`);
  const zeitKnoepfe: MailLink[] =
    art === "schliessen"
      ? [{ label: "Doch noch einen Termin", url: o.seite }]
      : mitZeiten
        ? [...o.zeiten, ...(o.andereZeit ? [{ label: "Andere Zeit", url: o.andereZeit }] : [])]
        : [{ label: "Termin wünschen", url: o.seite }];
  const erstinfo =
    art !== "erst"
      ? null
      : o.erstinfoPdf
        ? a(an, `Im Anhang findest du die Erstinformation zu ${o.person.dat} als ${vermittlerBeruf(o.person.dat)} (PDF).`, `Im Anhang finden Sie die Erstinformation zu ${o.person.dat} als ${vermittlerBeruf(o.person.dat)} (PDF).`)
        : o.erstinfoUrl
          ? a(an, `Die Erstinformation zu ${o.person.dat} als ${vermittlerBeruf(o.person.dat)} findest du hier: ${o.erstinfoUrl}`, `Die Erstinformation zu ${o.person.dat} als ${vermittlerBeruf(o.person.dat)} finden Sie hier: ${o.erstinfoUrl}`)
          : null;
  // Nachfassen: KI-Kennzeichnung klein unter dem Text (KI-VO Art. 50)
  const kiZeile = art === "erst" ? null : `${ki.replace(/\.$/, "")}.`;
  const fuss = [o.impressumUrl ? `Impressum: ${o.impressumUrl}` : null, o.datenschutzUrl ? `Datenschutz: ${o.datenschutzUrl}` : null].filter(Boolean) as string[];
  const abmelden = "Keine weiteren E-Mails gewünscht? Hier abmelden:";

  const name = o.betreffName ? `${o.betreffName}, ` : "";
  const betreff =
    art === "erst"
      ? `${name}${a(an, "deine", "Ihre")} Anfrage${thema}`
      : art === "zeiten"
        ? `${a(an, "Zwei neue Zeiten für dein Gespräch", "Zwei neue Zeiten für Ihr Gespräch")} mit ${o.person.dat}`
        : art === "nutzen"
          ? `${name}${a(an, "deine", "Ihre")} Anfrage${thema}`
          : a(an, "Soll ich deine Anfrage schließen?", "Soll ich Ihre Anfrage schließen?");

  const text = [
    `${o.anrede},`,
    "",
    einleitung,
    ...(frage ? ["", frage.text, ...antworten.map((k) => `${k.label}: ${k.url}`)] : []),
    "",
    ...(zeitenTitel ? [zeitenTitel] : []),
    ...zeitKnoepfe.map((k) => `${k.label}: ${k.url}`),
    ...(erstinfo ? ["", erstinfo] : []),
    "",
    o.signatur.text,
    ...(kiZeile ? ["", kiZeile] : []),
    ...(fuss.length ? ["", fuss.join(" · ")] : []),
    "",
    `${abmelden} ${o.abmeldeUrl}`,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const p = (t: string) => `<p style="margin:0 0 14px">${esc(t).replace(/\n/g, "<br>")}</p>`;
  const html = `
<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#0b1220;font-size:15px;line-height:1.5">
  ${p(`${o.anrede},`)}
  ${p(einleitung)}
  ${frage ? `<p style="margin:18px 0 6px;font-weight:700">${esc(frage.text)}</p><p style="margin:0 0 14px">${antworten.map((k) => btn(k, "neben")).join("")}</p>` : ""}
  ${zeitenTitel ? `<p style="margin:18px 0 6px;${frage ? "" : "font-weight:700"}">${esc(zeitenTitel)}</p>` : ""}
  <p style="margin:0 0 18px">${zeitKnoepfe.map((k, i) => btn(k, !mitZeiten || i < 2 ? "haupt" : "neben")).join("")}</p>
  ${erstinfo ? `<p style="margin:0 0 14px;font-size:13px;color:#475569">${esc(erstinfo).replace(/(https?:\/\/\S+)/g, '<a href="$1" style="color:#2563eb">$1</a>')}</p>` : ""}
  ${o.signatur.html}
  ${kiZeile ? `<p style="margin:14px 0 0;font-size:12px;color:#6b7a96">${esc(kiZeile)}</p>` : ""}
  ${
    fuss.length
      ? `<p style="margin:20px 0 0;font-size:12px;color:#6b7a96">${[
          o.impressumUrl ? `<a href="${esc(o.impressumUrl)}" style="color:#6b7a96">Impressum</a>` : "",
          o.datenschutzUrl ? `<a href="${esc(o.datenschutzUrl)}" style="color:#6b7a96">Datenschutz</a>` : "",
        ]
          .filter(Boolean)
          .join(" · ")}</p>`
      : ""
  }
  <p style="margin:8px 0 0;font-size:12px;color:#6b7a96">${esc(abmelden)} <a href="${esc(o.abmeldeUrl)}" style="color:#6b7a96">abmelden</a></p>
</div>`;
  return { subject: ohneGedankenstriche(betreff), text: ohneGedankenstriche(text), html: ohneGedankenstriche(html) };
}

/** Anrede-Zeile ohne Komma (rein): wie die E-Mail-Vorlagen, Sie ohne bekannte Anrede neutral „Guten Tag“. */
export function mailAnrede(an: Ansprache, k: AnredeKontakt, anredeZeile: (an: Ansprache, k: AnredeKontakt) => string): string {
  const ohneAnrede = an === "sie" && !k.salutation;
  return (ohneAnrede ? "Guten Tag," : anredeZeile(an, k)).replace(/,$/, "");
}

// ─── SMS (Nachtrag Ole, 18.11.2026; Schalter MAIL_STRECKE_SMS, Standard aus) ───────────────

/** SMS ein? Erst nach der Ergänzung von seven.io in SUBPROCESSORS/AVV (Ole schaltet ein). */
export function smsStreckeAn(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|an|on|true|ja)$/i.test((env.MAIL_STRECKE_SMS ?? "").trim());
}

/** Höchstens so viele SMS je Lead (Tag 1 und Tag 4). */
export const MAX_SMS = 2;

/**
 * Absender der SMS: Name des Vermittlers, wenn er höchstens 11 Zeichen hat und nur aus Buchstaben, Ziffern und
 * Leerzeichen besteht (ohne Umlaute, das erlauben nicht alle Netze); sonst null (dann SMS_ABSENDER). Rein.
 */
export function smsAbsenderFuer(name: string | null | undefined): string | null {
  const n = (name ?? "").replace(/\s+/g, " ").trim();
  return n && n.length <= 11 && /^[A-Za-z0-9 ]+$/.test(n) && /[A-Za-z]/.test(n) ? n : null;
}

/**
 * SMS der Strecke (rein), kurz mit Link auf die Antwortseite und Abmeldelink. art „erst“ = Tag 1, „erinnerung“ = Tag 4.
 * Ohne Gedankenstriche; „KI-Assistent“ als Kennzeichnung.
 */
export function smsText(o: { an: Ansprache; anredeName: string | null; person: VermittlerName; source: string | null; link: string; abmelden: string; art: "erst" | "erinnerung"; telefon?: string | null }): string {
  const an = o.an;
  const hallo = o.anredeName ? `${a(an, "Hallo", "Hallo")} ${o.anredeName}, ` : `${a(an, "Hallo", "Guten Tag")}, `;
  const thema = anfrageThema(o.source, an);
  const kern =
    o.art === "erst"
      ? `${hallo}${a(an, "danke für deine Anfrage", "danke für Ihre Anfrage")}${thema}. Hier ist der KI-Assistent von ${o.person.dat}. ${a(an, "Termin wählen", "Termin wählen")}: ${o.link}`
      : `${hallo}${a(an, `${o.person.nom} hat noch Zeit für dich. Termin wählen`, `${o.person.nom} hat noch Zeit für Sie. Termin wählen`)}: ${o.link}`;
  // Antworten auf SMS mit Namen als Absender geht nicht (Ole, 18.11.2026): zweiter Weg ist die Nummer des Vermittlers
  const tel = (o.telefon ?? "").replace(/[^\d+ ]/g, "").replace(/\s+/g, " ").trim();
  const anrufen = tel ? ` ${a(an, "Lieber telefonieren?", "Lieber telefonieren?")} ${tel}.` : "";
  return ohneGedankenstriche(`${kern}${anrufen} Keine SMS mehr: ${o.abmelden}`);
}

// ─── Takt (Nachtrag Ole, 18.11.2026): 10 Tage, Stopp bei jeder Reaktion ─────────────────────

/** Ruhezeit: nichts zwischen 20 und 8 Uhr (Europe/Berlin). */
export function sendeFenster(now: Date): boolean {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(now));
  return h >= 8 && h < 20;
}

/**
 * Schritte nach Tag 1 (Tag 1 = Erstmail sofort und SMS): Tag 2 vormittags Mail mit zwei neuen Zeiten, Tag 4 nachmittags
 * SMS mit Link, Tag 6 abends Mail mit Nutzensatz und Zeiten, Tag 10 letzte Mail „Soll ich Ihre Anfrage schließen?“.
 * Tag N = N-1 Kalendertage nach dem Start (Berlin); ab = frühestens um diese Stunde.
 */
export const TAKT: readonly { tag: number; ab: number; kanal: "email" | "sms"; art: "zeiten" | "nutzen" | "schliessen" | "erinnerung" }[] = [
  { tag: 2, ab: 9, kanal: "email", art: "zeiten" },
  { tag: 4, ab: 14, kanal: "sms", art: "erinnerung" },
  { tag: 6, ab: 18, kanal: "email", art: "nutzen" },
  { tag: 10, ab: 10, kanal: "email", art: "schliessen" },
];

const berlinYmd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Mitternacht Berlin des Tages von d plus `tage` (als YYYY-MM-DD). */
export function tagNach(d: Date, tage: number): string {
  const [y, m, t] = berlinYmd(d).split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, t + tage, 12));
  return x.toISOString().slice(0, 10);
}

/**
 * Welcher Takt-Schritt ist jetzt fällig (rein)? `stufe` = Anzahl erledigter Schritte nach Tag 1. null = keiner.
 * Fällig, sobald der Tag erreicht und die Stunde da ist; nie in der Ruhezeit.
 */
export function faelligerSchritt(o: { start: Date; stufe: number; now: Date }): (typeof TAKT)[number] | null {
  const s = TAKT[o.stufe];
  if (!s || !sendeFenster(o.now)) return null;
  const ziel = tagNach(o.start, s.tag - 1);
  const heute = berlinYmd(o.now);
  if (heute < ziel) return null;
  if (heute === ziel) {
    const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(o.now));
    if (h < s.ab) return null;
  }
  return s;
}
