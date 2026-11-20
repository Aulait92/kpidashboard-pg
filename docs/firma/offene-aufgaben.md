# Offene Aufgaben und Übergabe

Für jede Sitzung und jedes Konto, das hier weiterarbeitet. Erledigtes streichen (mit Datum und Commit), Neues mit
Ziel, Frist, Verantwortlichem eintragen. Branches: `claude/whatsapp-crm` = Staging, `claude/facebook-ad-media-buyer-GdTgt` = live.
Vor jedem Push: fetch, beide Branches mergen, Tests grün. Andere Sitzungen pushen parallel.

## Heute / nächste Tage (Technik)

| Aufgabe | Stand | Wer |
|---|---|---|
| Tierversicherung Katze: Text je Umfang (OP, voll, offen) statt immer „OP-Versicherung“ | Teilarbeit Branch `tkv-umfang` | CTO |
| Keine neuen Terminvorschläge, wenn der Lead schon einen künftigen Termin hat | offen | CTO |
| Einrichtung: Allianz-Online-Kalender nur bei Versicherer Allianz zeigen (W2) | Teilarbeit Branch `golive-auflagen` | CTO / UX |
| Einrichtung: „Mein Versicherer erlaubt das nicht“ bei Maklern ausblenden (W3) | Teilarbeit Branch `golive-auflagen` | CTO / UX |
| Go-live-Auflagen W1, W4 bis W7 und Kleinpunkte | Branch `golive-auflagen` | CTO |
| Lead-Name-Rangfolge | Branch `lead-name-rangfolge` | CTO |
| Terminsuche 7 Tage: Wiedervorlage nur bei Wunsch über 7 Tage; ab 3. Runde Rückfrage plus Buchungslink; Kalender voll → Aufgabe und Hinweis, dass Herr Kannapinn sich meldet | Branch `terminsuche-7-tage` | CTO |
| Freitext verstehen (z. B. Vorerkrankung Tier) | Branch `freitext-verstehen` | CTO |
| Policen-Bitte nennt die genannten Sparten | Branch `policen-bitte-sparten` | CTO |
| Terminvorbereitung „Was hat … schon?“: Zweck „Cross-Selling-Folie“ und Zähler im Kopf, Hinweis am Hauptknopf (ungecommittet im Arbeitsverzeichnis, 19.11.2026); nach Freigabe committen. Danach messen: Anteil Präsentationen mit Folie `ueberblick` und „Mit anschauen“ (Ereignis fehlt noch) | wartet auf Ole | UX / CPO |
| Policen-Formular: nach Oles Test `POLICEN_FLOW_KUNDEN` leeren (für alle); optional Dateiname vor Einwilligung neutral | wartet auf Test | CTO |
| Admin-Umbau Nacht 19./20.11.: Umbauliste je Bereich (SUS-Ist 65 bis 74, Ziel 90) in `docs/ux/admin-neu/umbau-2026-11-19.md`; Airtable nur aus der Oberfläche, Abgleich bleibt; Abschalten des alten Admins ist Stufe A | läuft (Team der Nacht) | UX/UI / CTO |
| Erklärvideos „Kurz“, „Ausführlich“, „WhatsApp verbinden“ neu aufnehmen; nur außerhalb 8 bis 20 Uhr deployen | läuft in eigener Sitzung | CPO |

Die Branches liegen auf GitHub nur, wenn sie gepusht wurden; sonst lokal in der Sitzung, die sie angelegt hat.

## Bei Ole

- Plan „1 Mio. € ARR“ (Entwurf, 19.11.2026, `docs/firma/plan-1-mio-arr.md`): Entscheidungen 1 bis 7 bis zur Führungsrunde 23.11.
- Steuerberater: Umsatzsteuer (Betrag, Frist), Gehalt erst danach; Hinweis USt auf Vorauszahlungen.
- **USt Leadverkauf (19.11.2026, Recht):** FA-Nachfrage vom 18.09.2026 zur verbindlichen Auskunft (Frist 21.10. abgelaufen)
  beantworten lassen, Antrag auf Umgestaltung ab 01.01.2027 zuschneiden; bis dahin Leads nur an geprüfte Vertreter/Makler
  steuerfrei, sonst 19 %. Entwurf und offene Punkte: `docs/recht/ust-leadverkauf-2026-11-19.md`. App-Umbau (Nachweis,
  Steuerkennzeichen, Stripe, getrennte Rechnungen) live seit 20.11.2026, AGB-Klausel „Umsatzsteuer auf Leads“ live;
  verrata24 geprüft (Registernr. eingetragen), HvK kein Vermittler (19 %).
- Instantly: Light Speed und 60 Postfächer einrichten, Liste in der App importieren, Kampagne erst starten, wenn warm;
  Entscheidung zu den Textbefunden in `kaltakquise.md`.
- Alte Löschverlangen per Knopf „Auf Verlangen löschen“ nachziehen.
- Meta-Freigabe des ersten Software-Kunden vorziehen.
- Bedrock-Freischaltung (KI in der EU).
- LinkedIn-App anlegen; Gmail API (falls weiter gewünscht).
- Später: Calendly im Vertrieb durch eigenes Buchungstool ersetzen.
- Leitfaden Setter-Call liegt als PDF unter Marketing → Unterlagen (19.11.2026). Offen: Zahlweise im Beratungsgespräch, Quoten nach 10 Setter-Calls prüfen (Erscheinen mindestens 80 %).
- **Ab 21.11.2026 bauen:** Abschlussbonus 300 € gilt nur bei Abschluss im Beratungsgespräch (Annahme im Call), nicht mehr mit Frist bis zum Folgetag (Ole, 19.11.2026).

## Fehlende Zugänge für das Team
Diagnose-Schnittstelle (`app.performancegrowth.de/api/ops/diagnose`, nur lesend) ist seit 19.11.2026 in der Cloud-Umgebung
„kpidashboard-pg“ freigeschaltet (Schlüssel als Netzwerk-Secret, kein Wert im Repo). Sitzungen für dieses Repo in dieser
Umgebung starten. Noch offen: Lesekopie der Datenbank ohne Klardaten (Data-Agent), Anbindung der Sitzungsaufnahmen, Meta Ads nur lesend.
