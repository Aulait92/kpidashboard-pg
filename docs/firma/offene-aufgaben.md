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
| Policen-Formular: nach Oles Test `POLICEN_FLOW_KUNDEN` leeren (für alle); optional Dateiname vor Einwilligung neutral | wartet auf Test | CTO |
| Erklärvideos „Kurz“, „Ausführlich“, „WhatsApp verbinden“ neu aufnehmen; nur außerhalb 8 bis 20 Uhr deployen | läuft in eigener Sitzung | CPO |
| Empfehlungsmodul Champions-Umbau (3 Pakete, Plan `docs/ux/2026-11-19-empfehlung-champions.md`); Modul bleibt aus, Einschalten Stufe A | Branch `empfehlung-champions`: Pakete 1 bis 3 gebaut (20.11.2026), UX-Prüfung 20.11.2026: SUS 82, 88, 91 (Übersicht, Teilen, öffentliche Seiten); offen: Screenshot Heute und Kontakt-Karte nach Umstellung auf sekundären Knopf (Speicher, OOM), Einschalten-Liste in `docs/empfehlungen-modul.md` | CPO / CTO |

Die Branches liegen auf GitHub nur, wenn sie gepusht wurden; sonst lokal in der Sitzung, die sie angelegt hat.

## Bei Ole

- Steuerberater: Umsatzsteuer (Betrag, Frist), Gehalt erst danach; Hinweis USt auf Vorauszahlungen.
- Instantly: Light Speed und 60 Postfächer einrichten, Liste in der App importieren, Kampagne erst starten, wenn warm;
  Entscheidung zu den Textbefunden in `kaltakquise.md`.
- Alte Löschverlangen per Knopf „Auf Verlangen löschen“ nachziehen.
- Pay-per-Lead: Bezug von verrata24 im Admin aktivieren.
- Meta-Freigabe des ersten Software-Kunden vorziehen.
- Bedrock-Freischaltung (KI in der EU).
- LinkedIn-App anlegen; Gmail API (falls weiter gewünscht).
- Später: Calendly im Vertrieb durch eigenes Buchungstool ersetzen.

## Fehlende Zugänge für das Team
Lesekopie der Datenbank ohne Klardaten (Data-Agent), Anbindung der Sitzungsaufnahmen, Meta Ads nur lesend.
