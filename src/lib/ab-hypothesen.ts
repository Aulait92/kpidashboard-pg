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
  followup_last: "Eine rücksichtsvolle Frage („Ich möchte Sie nicht weiter stören“) holt mehr Rückmeldungen als ein weiteres Nachfassen.",
  campaign_cross_sell: "Ein konkretes, kleines Angebot („in 10 Minuten kurz prüfen“) bringt mehr Antworten.",
};

/** Je Splittest (lib/experimente.ts). */
export const SPLITTEST_HYPOTHESE: Record<string, string> = {
  komplettcheck_text: "Der Hinweis, dass viele doppelt für dieselbe Absicherung zahlen, weckt mehr Interesse als „sparen“.",
  terminvorschlag_kostenlos: "Das Wort „kostenlos“ senkt die Hürde zum Termin.",
  buchungsseite_kompakt: "Weniger Hürden (nächste Tage zuerst, Datenschutz als Hinweis) bringen mehr Buchungen.",
  praesentation: "Einstieg mit dem Anliegen und Wahl zwischen zwei Paketen erhöhen die Zusage im Termin.",
  // Geplant (Freigabe Ole 20.11.2026), Eintrag in lib/experimente.ts folgt mit dem Bau
  termin_zusage: "Endet die Buchungsbestätigung mit der Zusage-Frage „Kann Herr Kannapinn fest mit Ihnen rechnen?“ [Ja, sicher] [Lieber andere Zeit], erscheinen mehr Leads zum Termin.",
};
