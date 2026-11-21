// Hypothesen der laufenden A/B-Tests für die Admin-Seite Liefern › A/B-Tests (Ole, 19.11.2026). Quelle und Lehren:
// docs/firma/ab-tests.md (A/B-Test-Labor). Neuer Test = Hypothese hier und im Lernbuch eintragen. Rein, ohne Datenbank.

/** Je Vorlagen-Zweck mit B-Fassung (TEMPLATE_BODY_B): was die B-Fassung zeigen soll. */
export const VORLAGEN_HYPOTHESE: Record<string, string> = {
  outreach: "Steht die Frage direkt hinter der Anrede, ist sie in Benachrichtigung und Chatliste sichtbar und es antworten mehr Leads.",
  outreach_tkv: "Steht die Frage direkt hinter der Anrede, ist sie in Benachrichtigung und Chatliste sichtbar und es antworten mehr Leads.",
  outreach_zahn: "Steht die Frage direkt hinter der Anrede, ist sie in Benachrichtigung und Chatliste sichtbar und es antworten mehr Leads.",
  outreach_pkv: "Steht die Frage direkt hinter der Anrede, ist sie in Benachrichtigung und Chatliste sichtbar und es antworten mehr Leads.",
  outreach_privatschutz: "Steht die Frage direkt hinter der Anrede, ist sie in Benachrichtigung und Chatliste sichtbar und es antworten mehr Leads.",
  outreach_hausrat: "Steht die Frage direkt hinter der Anrede, ist sie in Benachrichtigung und Chatliste sichtbar und es antworten mehr Leads.",
  // Kfz-Einstiegsfrage (A/B-Test-Labor 21.11.2026, docs/firma/ab-tests.md): gleiche Hypothese, eigener Test je Anlass
  outreach_kfz: "Kfz: Steht die Einstiegsfrage (jetziges oder neues Auto) direkt hinter der Anrede, sehen Kfz-Leads sie schon in der Benachrichtigung und antworten öfter.",
  outreach_kfz_wechsel: "Kfz: Steht die Einstiegsfrage (wann läuft der jetzige Vertrag aus) direkt hinter der Anrede, sehen Kfz-Leads sie schon in der Benachrichtigung und antworten öfter.",
  outreach_kfz_neu: "Kfz: Steht die Einstiegsfrage (ist das neue Auto schon da) direkt hinter der Anrede, sehen Kfz-Leads sie schon in der Benachrichtigung und antworten öfter.",
  followup_last: "Eine rücksichtsvolle Frage („Ich möchte Sie nicht weiter stören“) holt mehr Rückmeldungen als ein weiteres Nachfassen.",
  campaign_cross_sell: "Ein konkretes, kleines Angebot („in 10 Minuten kurz prüfen“) bringt mehr Antworten.",
};

/** Je Splittest (lib/experimente.ts). */
export const SPLITTEST_HYPOTHESE: Record<string, string> = {
  komplettcheck_text: "Der Hinweis, dass viele doppelt für dieselbe Absicherung zahlen, weckt mehr Interesse als „sparen“.",
  terminvorschlag_kostenlos: "Das Wort „kostenlos“ senkt die Hürde zum Termin.",
  buchungsseite_kompakt: "Weniger Hürden (nächste Tage zuerst, Datenschutz als Hinweis) bringen mehr Buchungen.",
  praesentation: "Einstieg mit dem Anliegen und Wahl zwischen zwei Paketen erhöhen die Zusage im Termin.",
  // Freigabe Ole 20.11.2026, gebaut (lib/experimente.ts termin_zusage, bot.ts, termin-strecke.ts)
  // Erster Test im eigenen PKV-Funnel (A/B-Test-Labor, Freigabe Ole 20.11.2026; lib/experimente.ts funnel_pkv_anlass)
  funnel_pkv_anlass:
    "Eine Überschrift mit dem konkreten Anlass (Beitragserhöhung zum 1. Januar) spricht Betroffene direkt an: Es fragen eher Leute mit echtem Anliegen an, die der Experte auch erreicht.",
  // A/B-Test-Labor 20.11.2026 (lib/experimente.ts buchung_erinnerung, Wortlaut lib/policen/regeln.ts)
  buchung_erinnerung:
    "Steht das freiwillige Häkchen als hervorgehobene Karte statt als grauer Kleindruck da, wird es wahrgenommen und öfter angehakt (gleicher Wortlaut, nie vorausgewählt).",
  // Ole 20.11.2026 (lib/experimente.ts buchungslink_andere_zeit, Texte lib/whatsapp/buchungslink.ts)
  buchungslink_andere_zeit:
    "Steht nach dem zweiten „Andere Zeit“ der Wunschtag im Chat vorn und der Buchungslink nur als Alternative am Ende, bleibt der Lead im Gespräch und bucht öfter als mit dem Link zuerst.",
  termin_zusage: "Endet die Buchungsbestätigung mit der Zusage-Frage „Kann Herr Kannapinn fest mit Ihnen rechnen?“ [Ja, sicher] [Lieber andere Zeit], erscheinen mehr Leads zum Termin.",
};
