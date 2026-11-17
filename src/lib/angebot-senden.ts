// Angebot nach dem Termin senden und nachfassen (Paket P3, Ole 17.11.2026; docs/plan-lead-verlauf.md Punkt 8, B und C).
// Rein, ohne Datenbank, getestet (tests/unit/angebot-senden.test.ts). Datenbank und Versand: lib/angebot-senden-server.ts.
//
// Zwei Wege nach dem Termin (auf „Heute“, im Blatt „Wie lief der Termin?“, am Kontakt und in der Terminvorbereitung,
// Schritt 4):
//   app     „Über die App senden“: PDF der Gesellschaft hochladen bzw. das abgelegte wählen (liegt unter Dokumente am
//           Kontakt), optional der Kundenlink zur Beratungspräsentation. Versand per WhatsApp UND E-Mail im Namen des
//           Vermittlers (lib/mail/lead-versand.ts). Danach startet das Nachfassen (lib/lead-sequences.ts „offer“).
//   selbst  „Habe ich selbst gesendet“: ein Tipp, Upload optional. Nachfassen nur per WhatsApp und Anruf
//           („offer_selbst“: „das Angebot, das Herr Kannapinn Ihnen geschickt hat“), keine Angebots-Mail von uns.
// Das Nachfassen startet erst mit einem der beiden Wege, nie schon mit dem Status „Angebot gesendet“.
// Kombi-Rabatt nur, wenn die App ihn für die Auswahl wirklich berechnet (lib/kombi-rabatt.ts über beitragAus).
// Texte an Leads in beiden Fassungen (a(an, du, sie)), ohne Gedankenstriche; Vermittler-Oberfläche in Sie-Form.

import { blattUrl } from "@/lib/abschluss";
import { a, anredeName, type AnredeKontakt, type Ansprache } from "@/lib/ansprache";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";
import { fuelle, werteFuer, type Werte } from "@/lib/mail/platzhalter";
import type { VermittlerName } from "@/lib/whatsapp/gespraech";

export type AngebotWeg = "app" | "selbst";

/** Heute-Aufgabe nach dem Termin und ihr Hinweis (Sie-Form, Ole 17.11.2026). */
export const ANGEBOT_AUFGABE = "Angebot ablegen und senden";
export const ANGEBOT_HINWEIS = "Das Nachfassen zum Angebot startet erst, wenn Sie es hier senden.";
/** „Habe ich selbst gesendet“: Upload freiwillig. */
export const SELBST_UPLOAD_HINWEIS = "Freiwillig, hilft bei Ihren Zahlen.";

/** Notiz der klassischen Wiedervorlage (lib/lead-followup.ts), die mit dem Versand entfällt. */
export const ANGEBOT_WIEDERVORLAGE = "Angebot nachfassen";
/** Aufgabe nach „Rückruf wünschen“ (Minimalseite /rueckruf/<token>). */
export const RUECKRUF_NOTIZ = "Rückruf gewünscht (Angebot)";

/** Gültigkeit des Links auf das Angebots-PDF. */
export const ANGEBOT_LINK_TAGE = 60;

/** „Haftpflicht und Hausrat“ bzw. „Haftpflicht, Hausrat und Unfall“ aus den gewählten Sparten, sonst das Thema des Leads. */
export function angebotThema(sparten: string[], fallback: string): string {
  const s = [...new Set(sparten.map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 4);
  if (!s.length) return fallback;
  return s.length === 1 ? s[0] : `${s.slice(0, -1).join(", ")} und ${s.at(-1)}`;
}

/**
 * Satz zum Kombi-Rabatt, nur wenn die App ihn berechnet (rabatt aus beitragAus, sonst null). Neutral, ohne Betrag und
 * ohne Versprechen: „Für Haftpflicht und Hausrat zusammen gilt ein Kombi-Rabatt von 10 %.“
 */
export function kombiSatz(rabatt: { prozent: number } | null | undefined, thema: string): string | null {
  if (!rabatt || !(rabatt.prozent > 0)) return null;
  return `Für ${thema} zusammen gilt ein Kombi-Rabatt von ${rabatt.prozent.toLocaleString("de-DE")} %.`;
}

export type AngebotText = {
  an: Ansprache;
  kontakt: AnredeKontakt | null;
  thema: string;
  /** Link auf das Angebots-PDF (/ihr-angebot/<token>) */
  link: string;
  /** Kundenlink zur Beratungspräsentation (/beratung/<token>), optional */
  kundenlink?: string | null;
  /** kombiSatz(), nur wenn berechnet */
  kombi?: string | null;
};

/**
 * WhatsApp an den Lead (Freitext im offenen 24-h-Fenster), Oles Wortlaut: „Vielen Dank für das Gespräch, Frau Becker!
 * Wie besprochen hier Ihr Angebot für Haftpflicht und Hausrat: [Angebot ansehen]. Bei Fragen schreiben Sie mir einfach
 * hier.“ Der Link steht in einer eigenen Zeile (sonst hängt WhatsApp den Punkt an den Link).
 */
export function angebotWhatsAppText(o: AngebotText): string {
  const name = anredeName(o.an, o.kontakt);
  const teile = [
    `Vielen Dank für das Gespräch${name ? `, ${name}` : ""}! ${a(o.an, `Wie besprochen hier dein Angebot für ${o.thema}:`, `Wie besprochen hier Ihr Angebot für ${o.thema}:`)}\n${o.link}`,
    o.kombi ?? null,
    o.kundenlink ? `${a(o.an, "Deine Beratung zum Nachlesen:", "Ihre Beratung zum Nachlesen:")}\n${o.kundenlink}` : null,
    a(o.an, "Bei Fragen schreib mir einfach hier.", "Bei Fragen schreiben Sie mir einfach hier."),
  ];
  return ohneGedankenstriche(teile.filter(Boolean).join("\n\n"));
}

/** Parameter der vorbereiteten Vorlage offer_send (Name, Thema, Link); Kombi-Satz und Kundenlink nur im Freitext. */
export function angebotVorlageParams(o: { firstName: string; thema: string; link: string }): string[] {
  return [o.firstName, o.thema, o.link];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const knopf = (href: string, label: string, primary = true) =>
  `<a href="${esc(href)}" style="display:inline-block;margin:4px 6px 4px 0;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;${
    primary ? "background:#2563eb;color:#ffffff" : "border:1px solid #d6dde8;color:#0b1220"
  }">${esc(label)}</a>`;
const absatz = (t: string) => `<p style="margin:0 0 14px">${esc(t)}</p>`;
const rahmen = (inhalt: string, sigHtml: string) =>
  `<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0b1220;font-size:15px;line-height:1.5">${inhalt}${sigHtml}</div>`;

export type MailInhalt = { subject: string; text: string; html: string };
export type MailVorlageText = { subject: string; body: string };
export type MailKnopf = { label: string; href: string; primary?: boolean };

const SIG = "\u0000SIGNATUR\u0000";

/**
 * Leere Aufzählung nach dem Füllen aufräumen (rein): Zeilen nur mit „•“ fallen weg, ebenso ein Satz mit Doppelpunkt am
 * Zeilenende, dem keine Aufzählung mehr folgt („Das Wichtigste für Sie:“ ohne Vorteile).
 */
export function leereListeWeg(text: string): string {
  const zeilen = text.split("\n").filter((z) => !/^\s*[•*]\s*$/.test(z));
  const out: string[] = [];
  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i];
    const naechste = zeilen[i + 1] ?? "";
    if (/:\s*$/.test(z) && !/^\s*•/.test(naechste)) {
      const ohne = z.replace(/(^|[.!?]\s+)[^.!?]*:\s*$/, "$1").trimEnd();
      if (ohne) out.push(ohne);
      continue;
    }
    out.push(z);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * E-Mail aus einer Vermittler-Vorlage (lib/mail/vorlagen.ts, Platzhalter lib/mail/platzhalter.ts). Im Code bleibt nur der
 * Rahmen: Knöpfe (nur für Links, die nicht schon im Text stehen), Signatur an der Stelle von {signatur} bzw. darunter.
 */
export function vorlagenMail(o: { vorlage: MailVorlageText; werte: Werte; knoepfe: MailKnopf[]; signatur: { text: string; html: string } }): MailInhalt {
  const subject = fuelle(o.vorlage.subject, { ...o.werte, signatur: "" }).replace(/\s+/g, " ").trim();
  const voll = fuelle(o.vorlage.body, { ...o.werte, signatur: SIG });
  const [vorSig, nachSig = ""] = voll.includes(SIG) ? voll.split(SIG) : [voll, ""];
  const inhalt = leereListeWeg(vorSig).trim();
  const knoepfe = o.knoepfe.filter((k) => k.href && !inhalt.includes(k.href));
  const text = [inhalt, knoepfe.map((k) => `${k.label}: ${k.href}`).join("\n"), o.signatur.text.trim(), nachSig.trim()].filter(Boolean).join("\n\n");
  const html = rahmen(
    [
      ...inhalt.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`),
      knoepfe.length ? `<p style="margin:0 0 14px">${knoepfe.map((k) => knopf(k.href, k.label, k.primary !== false)).join("")}</p>` : "",
    ].join(""),
    o.signatur.html + (nachSig.trim() ? absatz(nachSig.trim()) : ""),
  );
  return { subject: ohneGedankenstriche(subject), text: ohneGedankenstriche(text), html: ohneGedankenstriche(html) };
}

/** Platzhalter-Werte für Mails an einen Lead aus Kontakt, Thema (als {produkt}) und Vermittler. */
export function mailWerte(o: { an: Ansprache; kontakt: AnredeKontakt | null; thema: string; meinname: string; now?: Date; extra?: Partial<Werte> }): Werte {
  const k: AnredeKontakt = o.kontakt ?? {};
  const w = werteFuer(
    { name: k.fullName ?? null, source: o.thema, firstName: k.firstName ?? null, lastName: k.lastName ?? null, salutation: k.salutation ?? null },
    o.meinname,
    { ansprache: o.an, now: o.now },
  );
  return { ...w, produkt: o.thema, ...o.extra };
}

/**
 * {vorteil_1} bis {vorteil_3} der Vorlage „Angebot“ aus der Auswahl im Termin: je Versicherung Tarif und Beitrag, der
 * Kombi-Rabatt nur, wenn die App ihn berechnet (dann als erster Punkt). Ohne Auswahl leer (die Aufzählung entfällt).
 */
export function angebotVorteile(items: { sparte: string; gesellschaft: string | null; tarif: string | null; beitrag: number | null }[], kombi: string | null): Partial<Werte> {
  const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  const zeilen = [
    ...(kombi ? [kombi.replace(/\.$/, "")] : []),
    ...items.map((i) => {
      const tarif = [i.gesellschaft, i.tarif].filter(Boolean).join(" ");
      return `${i.sparte}${tarif ? `: ${tarif}` : ""}${i.beitrag != null ? `, ${eur(i.beitrag)} im Monat` : ""}`;
    }),
  ].slice(0, 3);
  return { vorteil_1: zeilen[0] ?? "", vorteil_2: zeilen[1] ?? "", vorteil_3: zeilen[2] ?? "" };
}

/**
 * E-Mail mit dem Angebot (Weg „app“): Text aus der Vorlage „Angebot“ (Kunden-Vorlage, sonst Standard), Rahmen mit
 * [Angebot ansehen] und optional [Beratung ansehen]; das PDF liegt im Anhang (lib/angebot-senden-server.ts).
 */
export function angebotMail(o: { vorlage: MailVorlageText; werte: Werte; link: string; kundenlink?: string | null; signatur: { text: string; html: string } }): MailInhalt {
  return vorlagenMail({
    vorlage: o.vorlage,
    werte: o.werte,
    knoepfe: [{ label: "Angebot ansehen", href: o.link }, ...(o.kundenlink ? [{ label: "Beratung ansehen", href: o.kundenlink, primary: false }] : [])],
    signatur: o.signatur,
  });
}

/**
 * Nachfass-Mail Tag 5 (nur Weg „app“): Text aus der Vorlage „Nachfassen Angebot“, {rueckruf_link} verfügbar; Rahmen mit
 * [Angebot ansehen] (falls das PDF noch da ist) und [Rückruf wünschen].
 */
export function nachfassMail(o: { vorlage: MailVorlageText; werte: Werte; angebotLink: string | null; rueckrufLink: string; signatur: { text: string; html: string } }): MailInhalt {
  return vorlagenMail({
    vorlage: o.vorlage,
    werte: { ...o.werte, rueckruf_link: o.rueckrufLink },
    knoepfe: [...(o.angebotLink ? [{ label: "Angebot ansehen", href: o.angebotLink, primary: false }] : []), { label: "Rückruf wünschen", href: o.rueckrufLink }],
    signatur: o.signatur,
  });
}

/** Push an den Vermittler am Tag 3 des Nachfassens (Ole: „Frau Becker anrufen: Fragen zum Angebot?“). */
export function angebotAnrufPush(o: { leadId: string; name: string }) {
  return {
    title: `${o.name} anrufen: Fragen zum Angebot?`,
    body: "Tippen Sie, um direkt anzurufen.",
    url: `/buyer?anrufen=${encodeURIComponent(o.leadId)}#anrufen`,
    tag: `angebot-anruf:${o.leadId}`,
  };
}

// Berlin-Zeit ohne Datenbank (rein): Tag, Stunde, Wochentag eines Zeitpunkts und „18 Uhr an einem Berliner Tag“.
const TZ = "Europe/Berlin";
function berlinTeile(d: Date): { tag: string; stunde: number; sonntag: boolean } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { tag: `${g("year")}-${g("month")}-${g("day")}`, stunde: Number(g("hour")), sonntag: g("weekday") === "Sun" };
}
/** Zeitpunkt „Stunde h an diesem Berliner Tag (YYYY-MM-DD)“, Sommer- und Winterzeit beachtet. */
function berlinUm(tag: string, h: number): Date {
  const guess = new Date(`${tag}T${String(h).padStart(2, "0")}:00:00Z`);
  const bh = berlinTeile(guess).stunde;
  const diff = (bh - h + 24) % 24;
  return new Date(guess.getTime() - (diff > 12 ? diff - 24 : diff) * 60 * 60 * 1000);
}
const HOUR_MS = 60 * 60 * 1000;

/**
 * Wann ein automatischer Schritt (WhatsApp oder E-Mail) frühestens rausgeht: wie runSequences nur Mo bis Sa 9 bis 19 Uhr
 * (lib/lead-sequences.ts inSendWindow). Ab `at` die nächste volle Stunde im Fenster, sonst `at` selbst.
 */
export function naechsterVersand(at: Date): Date {
  const imFenster = (d: Date) => {
    const t = berlinTeile(d);
    return !t.sonntag && t.stunde >= 9 && t.stunde < 19;
  };
  if (imFenster(at)) return at;
  let d = new Date(Math.ceil(at.getTime() / HOUR_MS) * HOUR_MS);
  for (let i = 0; i < 72 && !imFenster(d); i++) d = new Date(d.getTime() + HOUR_MS);
  return d;
}

/** Vorab-Check (Ole, 17.11.2026): Push an den Vermittler um 18 Uhr am Vorabend des Versands. */
export const VORAB_CHECK_STUNDE = 18;
export function vorabCheckZeit(versand: Date): Date {
  const vortag = new Date(berlinUm(berlinTeile(versand).tag, 12).getTime() - 24 * HOUR_MS);
  return berlinUm(berlinTeile(vortag).tag, VORAB_CHECK_STUNDE);
}
/** Pushes nur zu Tageszeiten (8 bis 21 Uhr Berlin), nachts wartet der Vorab-Check nicht, er entfällt. */
export function vorabCheckFaellig(o: { now: Date; versand: Date }): boolean {
  const zeit = vorabCheckZeit(o.versand);
  const h = berlinTeile(o.now).stunde;
  return o.now.getTime() >= zeit.getTime() && o.now.getTime() < o.versand.getTime() && h >= 8 && h < 21;
}

/**
 * Vorab-Check-Push vor jedem automatischen Nachfassen zum Angebot (Ole, 17.11.2026, Ergänzung C): Der Vermittler sieht
 * am Vorabend, dass die App nachfasst, und trägt im Blatt mit einem Tipp den Abschluss ein oder pausiert das Nachfassen.
 */
export function vorabCheckPush(o: { leadId: string; name: string; kanal: "whatsapp" | "email"; versand: Date; now: Date }) {
  const tagVersand = berlinTeile(o.versand).tag;
  const morgen = berlinTeile(new Date(berlinUm(berlinTeile(o.now).tag, 12).getTime() + 24 * HOUR_MS)).tag;
  const wann =
    tagVersand === berlinTeile(o.now).tag
      ? "Heute"
      : tagVersand === morgen
        ? "Morgen"
        : `Am ${new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long" }).format(o.versand)}`;
  // P4 (Ole, 17.11.2026): derselbe Push ist die Abschluss-Frage am Vorabend, mit Deep-Link auf das Entscheidungsblatt
  // „Hat Frau Becker abgeschlossen?“ (Ja, abgeschlossen · Noch nicht · Nachfassen pausieren), lib/abschluss.ts
  return {
    title: `Hat ${o.name} abgeschlossen?`,
    body: `${wann} fasst die App ${o.kanal === "email" ? "per E-Mail" : "per WhatsApp"} zum Angebot nach. Mit einem Tipp eintragen oder pausieren.`,
    url: blattUrl([o.leadId]),
    tag: `angebot-vorab:${o.leadId}`,
  };
}

/** {anruf_tag} der Angebots-Mail: Wochentag der Anruf-Aufgabe im Nachfassen (Tag 3), sonntags der Montag. */
export function angebotAnrufTag(now: Date, tage = 3): string {
  let d = new Date(berlinUm(berlinTeile(now).tag, 12).getTime() + tage * 24 * HOUR_MS);
  if (berlinTeile(d).sonntag) d = new Date(d.getTime() + 24 * HOUR_MS);
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long" }).format(d);
}

/** Push an den Vermittler, wenn der Lead auf der Rückruf-Seite „Rückruf wünschen“ getippt hat. */
export function rueckrufPush(o: { leadId: string; name: string }) {
  return {
    title: `${o.name} wünscht einen Rückruf`,
    body: "Zum Angebot. Tippen Sie, um direkt anzurufen.",
    url: `/buyer?anrufen=${encodeURIComponent(o.leadId)}#anrufen`,
    tag: `rueckruf:${o.leadId}`,
  };
}

/** Texte der Rückruf-Seite (an den Lead). */
export function rueckrufSeite(an: Ansprache, person: VermittlerName) {
  return {
    titel: "Rückruf wünschen",
    text: a(an, `${person.nom} ruft dich gern an und beantwortet deine Fragen zum Angebot.`, `${person.nom} ruft Sie gern an und beantwortet Ihre Fragen zum Angebot.`),
    knopf: "Ja, bitte anrufen",
    danke: a(an, `Danke! ${person.nom} meldet sich bei dir.`, `Danke! ${person.nom} meldet sich bei Ihnen.`),
  };
}

/** „Angebot gesendet am 17.11.“ bzw. „selbst gesendet am 17.11.“ / „abgelegt am 17.11.“ für Terminvorbereitung und Kontakt. */
export function angebotStandText(s: { abgelegtAt: Date | string | null; gesendetAt: Date | string | null; versand: string | null; kanaele?: string | null }): string | null {
  const tag = (d: Date | string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "numeric" }).format(new Date(d));
  if (s.gesendetAt) {
    if (s.versand === "selbst") return `Angebot selbst gesendet am ${tag(s.gesendetAt)}`;
    const k = (s.kanaele ?? "").split(",").filter(Boolean);
    const wie = k.length === 2 ? " per WhatsApp und E-Mail" : k[0] === "whatsapp" ? " per WhatsApp" : k[0] === "email" ? " per E-Mail" : "";
    return `Angebot gesendet am ${tag(s.gesendetAt)}${wie}`;
  }
  if (s.abgelegtAt) return `Angebot abgelegt am ${tag(s.abgelegtAt)}`;
  return null;
}
