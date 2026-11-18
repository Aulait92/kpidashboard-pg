// Maklervollmacht: Texte nach docs/rechtstexte/maklervollmacht-2026-11-18.md (Anwalts-Agent, Ole 18.11.2026).
// Rein, ohne Datenbank. Keine Gedankenstriche, kein „Garantie“, keine Versprechen (Test: tests/unit/maklervollmacht.test.ts).
// Dokumente: a) Maklervollmacht (Ich-Form, geht an Versicherer), b) Maklerauftrag Kurzfassung (Makler und Kunde),
// c) Einwilligung Gesundheitsdaten (nur mit eigenem Häkchen), d) Übertragungsschreiben je Versicherer, Protokoll.

import { a, type Ansprache } from "@/lib/ansprache";
import { sparteLabel, gesundheitNoetig, type VvDaten, type VvVertrag } from "@/lib/maklervollmacht/regeln";

export const VV_TEXT_VERSION = "maklervollmacht-2026-11-18";

export type VvMakler = { name: string; firma: string | null; anschrift: string | null; registernummer: string | null; email: string | null; telefon: string | null };

export type VvKontext = {
  makler: VvMakler;
  kunde: VvDaten;
  vertraege: VvVertrag[];
  datum: string; // TT.MM.JJJJ (Berlin)
  uhrzeit: string; // HH:MM (Berlin)
  dokumentId: string;
};

export type VvAbschnitt = { titel: string; absaetze: string[]; unterschrift: boolean };

const pick = <T,>(an: Ansprache, du: T, sie: T): T => (an === "du" ? du : sie);
const firma = (m: VvMakler) => m.firma || m.name;
export const kundeName = (k: Pick<VvDaten, "vorname" | "nachname">) => `${k.vorname} ${k.nachname}`.trim();
export const kundeAnschrift = (k: Pick<VvDaten, "strasse" | "plz" | "ort">) => `${k.strasse}, ${k.plz} ${k.ort}`;
const maklerZeile = (m: VvMakler) => [m.name, m.firma && m.firma !== m.name ? m.firma : null, m.anschrift].filter(Boolean).join(", ");

export const vertragZeile = (v: VvVertrag) => `${v.versicherer}, ${sparteLabel(v.sparte)}${v.vertragsnummer ? `, Nr. ${v.vertragsnummer}` : ", Vertragsnummer folgt"}`;

const unterschriftZeile = (c: VvKontext) => `${c.kunde.ort}, ${c.datum}. Elektronisch unterschrieben von ${kundeName(c.kunde)} am ${c.datum} um ${c.uhrzeit} Uhr, Dokument-ID ${c.dokumentId}.`;

/** a) Maklervollmacht (Ich-Form des Kunden, in Sie- und Du-Fassung gleich) */
export function vollmacht(c: VvKontext): VvAbschnitt {
  const m = c.makler;
  return {
    titel: "Maklervollmacht",
    absaetze: [
      // Ein Satz in einem Absatz (im PDF sonst drei abgerissene Zeilen)
      `Ich, ${kundeName(c.kunde)}, geboren am ${c.kunde.geburtsdatum}, wohnhaft ${kundeAnschrift(c.kunde)}, bevollmächtige ${maklerZeile(m)}, Versicherungsmakler mit Erlaubnis nach § 34d Abs. 1 GewO${m.registernummer ? `, Registernummer ${m.registernummer}` : ""}, mich gegenüber Versicherern in allen Angelegenheiten meiner Versicherungsverträge zu vertreten. Das gilt für die unten aufgeführten Verträge und für Verträge, die ich künftig über den Makler abschließe.`,
      "Die Vollmacht umfasst insbesondere:",
      "1. Auskünfte zu meinen Verträgen einzuholen und Kopien von Vertragsunterlagen anzufordern. Insoweit entbinde ich die Versicherer von ihrer Schweigepflicht. Für Gesundheitsdaten gilt nur meine gesonderte Einwilligung.",
      "2. Erklärungen für mich abzugeben, insbesondere Anträge zu stellen, Verträge zu ändern, abzuschließen und zu kündigen, sowie Schäden und Leistungsfälle zu melden.",
      "3. Schreiben der Versicherer für mich entgegenzunehmen. Der Makler leitet sie mir unverzüglich weiter.",
      "4. Untervollmacht an seine Mitarbeiter zu erteilen.",
      "Zahlungen an mich darf der Makler nicht entgegennehmen. Ich bitte die Versicherer, Schriftverkehr zu meinen Verträgen künftig über den Makler zu führen.",
      "Die Vollmacht gilt bis zum Ende des Maklerauftrags. Ich kann sie jederzeit widerrufen; eine Nachricht per E-Mail oder Brief an den Makler oder den Versicherer genügt.",
      "Verträge:",
      ...c.vertraege.map((v) => `• ${vertragZeile(v)}`),
      unterschriftZeile(c),
    ],
    unterschrift: true,
  };
}

/** b) Maklerauftrag (Kurzfassung, nur Makler und Kunde) */
export function maklerauftrag(c: VvKontext): VvAbschnitt {
  const m = c.makler;
  return {
    titel: "Maklerauftrag",
    absaetze: [
      `zwischen ${kundeName(c.kunde)}, ${kundeAnschrift(c.kunde)} (Kunde), und ${maklerZeile(m)}${m.registernummer ? `, Registernummer ${m.registernummer}` : ""} (Makler).`,
      "1. Auftrag. Der Kunde beauftragt den Makler, die unten aufgeführten Versicherungsverträge zu betreuen und ihm auf Wunsch neuen Versicherungsschutz zu vermitteln. Weitere Verträge oder Sparten kommen hinzu, wenn der Kunde sie dem Makler zur Betreuung nennt.",
      "2. Leistungen. Der Makler berät den Kunden nach §§ 60, 61 VVG, prüft den Bedarf zu den betreuten Verträgen, hilft bei Schäden und Leistungsfällen und dokumentiert die Beratung. Verträge schließt, ändert oder kündigt er nur nach Absprache mit dem Kunden.",
      "3. Mitwirkung. Der Kunde informiert den Makler über Änderungen, die für seinen Versicherungsschutz wichtig sind, zum Beispiel Umzug, Heirat oder einen neuen Beruf, und leitet ihm Schreiben der Versicherer weiter, die er direkt erhält.",
      "4. Vergütung. Der Makler erhält seine Vergütung (Courtage) von den Versicherern. Dem Kunden entstehen durch diesen Auftrag keine Kosten.",
      "5. Laufzeit. Der Auftrag gilt unbefristet. Der Kunde kann ihn jederzeit kündigen, der Makler mit einer Frist von einem Monat. Eine Nachricht per E-Mail oder Brief genügt. Mit dem Ende des Auftrags endet auch die Maklervollmacht.",
      "6. Datenschutz. Der Makler verarbeitet die Daten des Kunden zur Erfüllung dieses Auftrags. Einzelheiten stehen in seinen Datenschutzhinweisen.",
      "Die Erstinformation des Maklers nach § 15 VersVermV hat der Kunde vorab erhalten.",
      "Betreute Verträge:",
      ...c.vertraege.map((v) => `• ${vertragZeile(v)}`),
      unterschriftZeile(c),
      `Für den Makler: ${m.name} (bestätigt mit Versand dieses Dokuments).`,
    ],
    unterschrift: true,
  };
}

/** c) Einwilligung Gesundheitsdaten und Schweigepflichtentbindung (nur Verträge der betroffenen Sparten; Ich-Form, in Sie- und Du-Fassung gleich) */
export function einwilligungGesundheit(c: VvKontext): VvAbschnitt {
  const m = c.makler;
  const betroffen = c.vertraege.filter((v) => gesundheitNoetig([v]));
  return {
    titel: "Einwilligung in die Verarbeitung von Gesundheitsdaten und Entbindung von der Schweigepflicht",
    absaetze: [
      "Bei den folgenden Verträgen können die Unterlagen Angaben zu meiner Gesundheit enthalten, zum Beispiel Gesundheitsfragen, Risikozuschläge, Leistungsausschlüsse oder Leistungsanträge:",
      ...betroffen.map((v) => `• ${vertragZeile(v)}`),
      `1. Ich willige ein, dass ${firma(m)} meine Gesundheitsdaten zu diesen Verträgen verarbeitet, soweit das für die Beratung, die Betreuung der Verträge und die Unterstützung im Leistungsfall erforderlich ist. Das gilt auch für Fotos von Versicherungsscheinen, die ich hochlade.`,
      "2. Ich entbinde die genannten Versicherer und ihre Mitarbeiter von ihrer Schweigepflicht, soweit sie dem Makler zu diesen Zwecken Gesundheitsdaten und andere geschützte Angaben zu meinen Verträgen übermitteln. Ich willige in diese Übermittlung ein.",
      "3. Der Makler gibt meine Gesundheitsdaten nur an Versicherer weiter, wenn das für einen Antrag oder einen Leistungsfall nötig ist und ich vorher zugestimmt habe.",
      "4. Meine Gesundheitsdaten werden bei einem Dienstleister des Maklers gespeichert, der sie nur nach dessen Weisung verarbeitet.",
      `Diese Einwilligung ist freiwillig. Ohne sie bleibt die Maklervollmacht wirksam; der Makler erhält dann aber keine Gesundheitsdaten zu diesen Verträgen und kann mich dazu nur eingeschränkt beraten. Ich kann die Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen${m.email ? `, per E-Mail an ${m.email}` : ""}${m.anschrift ? ` oder per Brief an ${m.anschrift}` : ""}.`,
      unterschriftZeile(c),
    ],
    unterschrift: true,
  };
}

/** „Ihre Kundin Frau Wolf … ihrer“, „Ihr Kunde Herr Wolf … seiner“, ohne Anrede neutral „Ihr Versicherungsnehmer Katrin Wolf … der“. */
export function beauftragtSatz(k: Pick<VvDaten, "vorname" | "nachname" | "anrede">): string {
  if (k.anrede === "Frau") return `Ihre Kundin Frau ${k.nachname} hat uns mit der Betreuung ihrer Versicherungsverträge beauftragt und uns bevollmächtigt.`;
  if (k.anrede === "Herr") return `Ihr Kunde Herr ${k.nachname} hat uns mit der Betreuung seiner Versicherungsverträge beauftragt und uns bevollmächtigt.`;
  return `Ihr Versicherungsnehmer ${kundeName(k)} hat uns mit der Betreuung der Versicherungsverträge beauftragt und uns bevollmächtigt.`;
}

/** d) Übertragungsschreiben des Maklers an einen Versicherer (Betreuungswechsel, Bitte um Bestandsübertragung) */
export function uebertragungsschreiben(c: VvKontext, versicherer: string, vertraege: VvVertrag[], mitGesundheit: boolean): VvAbschnitt {
  const m = c.makler;
  return {
    titel: "Betreuungswechsel und Bitte um Bestandsübertragung",
    absaetze: [
      [firma(m), m.anschrift].filter(Boolean).join(" · "),
      `An ${versicherer}`,
      `${c.datum}`,
      `Versicherungsnehmer: ${kundeName(c.kunde)}, geboren am ${c.kunde.geburtsdatum}, ${kundeAnschrift(c.kunde)}`,
      "Verträge:",
      ...vertraege.map((v) => `• ${sparteLabel(v.sparte)}${v.vertragsnummer ? `, Nr. ${v.vertragsnummer}` : ", Vertragsnummer bitte aus Ihrem Bestand"}`),
      "Sehr geehrte Damen und Herren,",
      `${beauftragtSatz(c.kunde)} Eine Kopie der Maklervollmacht liegt bei.`,
      "Wir bitten Sie,",
      "1. die oben genannten Verträge in unsere Betreuung zu übernehmen und Schriftverkehr künftig über uns zu führen,",
      "2. die Verträge unserer Vermittlung zuzuordnen und die Courtage ab der nächsten Fälligkeit an uns zu zahlen,",
      "3. uns eine Kopie des aktuellen Versicherungsscheins und der Vertragsbedingungen zu senden.",
      "Bitte bestätigen Sie uns die Übertragung und teilen Sie uns mit, ab wann sie wirkt.",
      "Mit freundlichen Grüßen",
      m.name,
      [firma(m), m.registernummer ? `Registernummer ${m.registernummer}` : null, m.telefon, m.email].filter(Boolean).join(" · "),
      `Anlage: Maklervollmacht vom ${c.datum}${mitGesundheit ? ", Einwilligung und Schweigepflichtentbindung zu Gesundheitsdaten" : ""}`,
    ],
    unterschrift: false,
  };
}

/** e) Hinweis über der Unterschrift (Kopie per E-Mail nur, wenn eine Adresse angegeben ist) und Text des Pflicht-Häkchens */
export const hinweisUnterschrift = (an: Ansprache, maklerName: string, mitKopie: boolean) =>
  a(
    an,
    `Mit deiner Unterschrift beauftragst du ${maklerName} mit der Betreuung der aufgeführten Verträge und erteilst dafür eine Vollmacht. Du kannst beides jederzeit beenden.${mitKopie ? " Eine Kopie aller Dokumente bekommst du sofort per E-Mail." : ""}`,
    `Mit Ihrer Unterschrift beauftragen Sie ${maklerName} mit der Betreuung der aufgeführten Verträge und erteilen dafür eine Vollmacht. Sie können beides jederzeit beenden.${mitKopie ? " Eine Kopie aller Dokumente erhalten Sie sofort per E-Mail." : ""}`,
  );
export const ZUSTIMMUNG_TEXT = "Ich habe die Maklervollmacht, den Maklerauftrag und die Erstinformation gelesen und bin einverstanden.";
export const GESUNDHEIT_HAEKCHEN = "Ich willige in die Verarbeitung meiner Gesundheitsdaten ein und entbinde die Versicherer insoweit von der Schweigepflicht (freiwillig).";

/** f) E-Mail an den Kunden mit der Kopie */
export function kopieMail(an: Ansprache, kunde: Pick<VvDaten, "vorname" | "nachname">, m: VvMakler, datum: string): { subject: string; text: string } {
  const gruss = ["Viele Grüße", m.name, [firma(m), m.telefon].filter(Boolean).join(" · ")].join("\n");
  return pick(
    an,
    {
      subject: `Deine Maklervollmacht für ${firma(m)}`,
      text: `Hallo ${kunde.vorname},\n\nvielen Dank für dein Vertrauen. Im Anhang findest du deine unterschriebenen Dokumente vom ${datum}. Wir informieren jetzt deine Versicherer und melden uns, sobald die Übertragung bestätigt ist.\n\nFragen oder Änderungswünsche? Antworte einfach auf diese E-Mail.\n\n${gruss}`,
    },
    {
      subject: `Ihre Maklervollmacht für ${firma(m)}`,
      text: `Guten Tag ${kundeName(kunde)},\n\nvielen Dank für Ihr Vertrauen. Im Anhang finden Sie Ihre unterschriebenen Dokumente vom ${datum}. Wir informieren jetzt Ihre Versicherer und melden uns, sobald die Übertragung bestätigt ist.\n\nFragen oder Änderungswünsche? Antworten Sie einfach auf diese E-Mail.\n\n${gruss}`,
    },
  );
}

/** Mail mit dem Link an den Kunden (vom Makler ausgelöst) */
export function linkMail(an: Ansprache, anrede: string, m: VvMakler, link: string): { subject: string; text: string } {
  return pick(
    an,
    {
      subject: `Deine Maklervollmacht: in zwei Minuten erledigt`,
      text: `${anrede}\n\nwie besprochen kümmere ich mich künftig um deine Versicherungen. Damit ich mit deinen Versicherern sprechen darf, brauche ich deine Vollmacht. Das dauert zwei Minuten: Daten prüfen, Verträge eintragen, mit dem Finger unterschreiben.\n\n${link}\n\nViele Grüße\n${m.name}`,
    },
    {
      subject: `Ihre Maklervollmacht: in zwei Minuten erledigt`,
      text: `${anrede}\n\nwie besprochen kümmere ich mich künftig um Ihre Versicherungen. Damit ich mit Ihren Versicherern sprechen darf, brauche ich Ihre Vollmacht. Das dauert zwei Minuten: Daten prüfen, Verträge eintragen, mit dem Finger unterschreiben.\n\n${link}\n\nViele Grüße\n${m.name}`,
    },
  );
}

/**
 * Kopie an den Kunden fürs Protokoll: „anhang“ = diese Datei ist der Anhang der Mail (Fassung für den Kunden),
 * „gesendet“/„fehlgeschlagen“ = Ergebnis des Versands (gespeicherte Fassung für den Makler), „keine_adresse“.
 */
export type VvKopie = { status: "keine_adresse" } | { status: "anhang" | "fehlgeschlagen"; email: string } | { status: "gesendet"; email: string; datum: string; uhrzeit: string };

export function kopieZeile(k: VvKopie): string {
  switch (k.status) {
    case "keine_adresse":
      return "Kopie per E-Mail: keine, der Kunde hat keine E-Mail-Adresse angegeben.";
    case "anhang":
      return `Kopie per E-Mail: an ${k.email}, mit diesem Dokument im Anhang.`;
    case "gesendet":
      return `Kopie per E-Mail: am ${k.datum} um ${k.uhrzeit} Uhr an ${k.email} gesendet.`;
    case "fehlgeschlagen":
      return `Kopie per E-Mail: Versand an ${k.email} fehlgeschlagen.`;
  }
}

/** Unterschriftsprotokoll (letzte Seite des Gesamt-PDFs, ohne vollständige IP) */
export function protokoll(
  c: VvKontext,
  p: { an: Ansprache; gesundheit: boolean; ipKurz: string | null; geraet: string | null; weg: string; hashes: { name: string; sha256: string }[]; kopie: VvKopie },
): VvAbschnitt {
  return {
    titel: "Unterschriftsprotokoll",
    absaetze: [
      `Dokument-ID: ${c.dokumentId}`,
      `Textversion: ${VV_TEXT_VERSION}, Ansprache: ${p.an === "du" ? "Du" : "Sie"}`,
      `Unterschrieben von: ${kundeName(c.kunde)}, geboren am ${c.kunde.geburtsdatum}`,
      `Zeitpunkt: ${c.datum}, ${c.uhrzeit} Uhr (Europe/Berlin)`,
      `Weg: ${p.weg}`,
      `Häkchen: Vollmacht, Maklerauftrag und Erstinformation bestätigt; Einwilligung Gesundheitsdaten: ${p.gesundheit ? "erteilt" : "nicht erteilt"}`,
      `Gerät: ${p.geraet ?? "unbekannt"}${p.ipKurz ? `, IP gekürzt ${p.ipKurz}` : ""}`,
      "Prüfsummen (SHA-256) der Dokumente ohne dieses Protokoll:",
      ...p.hashes.map((h) => `• ${h.name}: ${h.sha256}`),
      kopieZeile(p.kopie),
      "Unterschriftsart: einfache elektronische Signatur (Art. 3 Nr. 10 eIDAS-VO), Textform (§ 126b BGB).",
    ],
    unterschrift: false,
  };
}
