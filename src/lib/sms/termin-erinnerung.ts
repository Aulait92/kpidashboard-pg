// SMS-Ersatz für WhatsApp-Terminerinnerungen an Leads (Ole, 25.11.2026, Auswertung Kunde Lohmann), reiner Teil:
// Zwecke, auslösende Fehler und Text. Datenbank-Teil: lib/sms/termin-erinnerung-server.ts. Getestet in
// tests/unit/sms-termin-erinnerung.test.ts.
//
// Text in beiden Ansprachen (Customer.leadAddress), ohne Gedankenstriche, ohne KI-Hinweis (Ole: feste Nachricht, kein
// Gespräch), mit Datum, Uhrzeit, Art und Link zum Termin (Verwalten-Seite /book/manage/<token>: verschieben, absagen).
// Höchstens 2 SMS-Teile: zu lang, fällt erst die Adresse (vor Ort), dann der Name in der Anrede weg, dann wird der
// Wochentag gekürzt.

import { a, type Ansprache } from "@/lib/ansprache";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";
import { MAX_SEGMENTE, smsSegmente } from "@/lib/mail-strecke/nur-sms";
import { NO_WHATSAPP_CODES, isWhatsAppOptOutCode, type Zustellfehler } from "@/lib/whatsapp/zustellfehler";

/** Erinnerungen vor einem Termin (lib/whatsapp/reminders.ts): Vortag, 1 Stunde vorher (Rückfall „reminder“), 15 Minuten vorher. */
export const TERMIN_ERINNERUNG_ZWECKE: ReadonlySet<string> = new Set(["reminder", "reminder_soon", "reminder_start"]);

export function istTerminErinnerung(purpose: string | null | undefined): boolean {
  return !!purpose && TERMIN_ERINNERUNG_ZWECKE.has(purpose);
}

/**
 * Laut Meta nicht zustellbar (die Erinnerung kommt nicht an, ein anderer Kanal hilft): 131026 bzw. 1013 (Nummer nicht
 * per WhatsApp erreichbar, veraltete App, Nutzungsbedingungen), 131049 (Meta stellt zum Schutz des Ökosystems nicht zu),
 * 130472 (Meta-Experiment) und jeder Fehler mit „undeliverable“ im Titel. Nicht bei 131050 (Abmeldung) und nicht bei
 * Fehlern auf unserer Seite (Vorlage, Konto, Limits): dort hilft eine SMS nicht bzw. wäre nicht gewollt.
 */
export function smsBeiZustellfehler(f: Pick<Zustellfehler, "code" | "title">): boolean {
  if (isWhatsAppOptOutCode(f.code)) return false;
  if (f.code != null && (NO_WHATSAPP_CODES.has(f.code) || f.code === 131049 || f.code === 130472)) return true;
  return /undeliverable|nicht zustellbar/i.test(f.title ?? "");
}

const TZ = "Europe/Berlin";

/** „Donnerstag, 27.11., um 14:30 Uhr“ bzw. kurz „Do., 27.11., 14:30 Uhr“. */
export function smsWann(d: Date, kurz = false): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: kurz ? "short" : "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  const wd = kurz ? `${String(p.weekday).replace(/\.$/, "")}.` : p.weekday;
  return kurz ? `${wd}, ${p.day}.${p.month}., ${p.hour}:${p.minute} Uhr` : `${wd}, ${p.day}.${p.month}., um ${p.hour}:${p.minute} Uhr`;
}

/** Art des Termins für die SMS. */
export function smsArt(mode: string): string {
  return mode === "video" ? "per Video" : mode === "onsite" ? "vor Ort" : "per Telefon";
}

export type TerminSmsInput = {
  an: Ansprache;
  /** „Guten Tag Frau Becker,“ bzw. „Hallo Anna,“ (anredeZeile) */
  hi: string;
  /** Grußzeile ohne Namen, falls es zu lang wird („Guten Tag,“) */
  hiKurz: string;
  /** Vermittler im Dativ („Herrn Kannapinn“, Du „Ole“) */
  personDat: string;
  startsAt: Date;
  mode: string;
  ort?: string | null;
  /** Verwalten-Seite des Termins (bzw. bei Video ohne Verwalten-Link der Videoraum), null = ohne Link */
  link: string | null;
  /** true: Link ist der Videoraum, nicht die Verwalten-Seite */
  linkIstVideo?: boolean;
};

/** SMS-Text der Terminerinnerung (rein). */
export function terminErinnerungSmsText(o: TerminSmsInput): string {
  const an = o.an;
  const linkSatz = !o.link
    ? ""
    : o.linkIstVideo
      ? ` ${a(an, "Dein Link zum Videoraum", "Ihr Link zum Videoraum")}: ${o.link}`
      : ` ${a(an, "Verschieben oder absagen kannst du hier", "Verschieben oder absagen können Sie hier")}: ${o.link}`;
  const bau = (mitOrt: boolean, mitName: boolean, kurz: boolean) => {
    const ort = mitOrt && o.mode === "onsite" && o.ort?.trim() ? ` (${o.ort.replace(/\s+/g, " ").trim()})` : "";
    const kern = `${mitName ? o.hi : o.hiKurz} ${a(an, "kurze Erinnerung an deinen Termin", "kurze Erinnerung an Ihren Termin")} mit ${o.personDat} am ${smsWann(o.startsAt, kurz)} ${smsArt(o.mode)}${ort}.`;
    return ohneGedankenstriche(`${kern}${linkSatz}`.replace(/\s{2,}/g, " ").trim());
  };
  const varianten = [bau(true, true, false), bau(false, true, false), bau(false, false, false), bau(false, false, true)];
  return varianten.find((t) => smsSegmente(t).segmente <= MAX_SEGMENTE) ?? varianten[varianten.length - 1];
}

/** Für den Verlauf beim Lead: ohne den persönlichen Link. */
export function terminSmsFuerVerlauf(text: string): string {
  return text.replace(/https?:\/\/\S+/g, "(Link)");
}
