# Pay-per-Lead: Umstellungs-Drehbuch Zapier/Airtable → App (Stand 15.11.2026)

Code-Vorbereitungen umgesetzt (Schalter `AIRTABLE_SYNC_OFF`, „Storno eintragen“, Dubletten über Produkte,
Import behält App-Einstellungen), noch nichts umgeschaltet, Import nicht ausgeführt. Ergänzt `docs/pay-per-lead.md` (Abschnitt „Umstellung“) und
`docs/ppl-abloesung-plan.md`. Grundprinzip: **je Funnel genau ein Weg aktiv** (Zap ODER App), sonst doppelte
Auslieferung und doppelter Umsatz (kein Abgleich Airtable ↔ App nach dem Import).

## 1. Stand: fertig / fehlt

| Bereich | Fertig in der App | Fehlt für die Umstellung |
|---|---|---|
| Eingang | `POST /api/leads/pool?token=…&produkt=…` nimmt Perspective-Funnels an (Übersetzer wie der alte Zap), Dubletten über alle Produkte 30 Tage (wie der Zap, ✅ 15.11.) | **Meta-Leadformulare → Pool gibt es nicht** (Meta-Weg kennt nur „ein Formular = ein Kunde“). Kein Schalter je Funnel: Umstellung = Webhook in Perspective umstellen + Zap aus |
| Verteilung | Filter (PLZ, schwach, Beamte, Score, Versicherer), d'Hondt, Gebiete mit Vorrang, Parken + Neuverteilung alle 5 Min., Admin „Geparkt“ | Monatsziele zählen nur App-Leads: **Umstellung mitten im Monat startet Monatsziele/Gebietsmengen bei 0** → Stichtag 1.12. oder Ziele für November von Hand reduzieren |
| Auslieferung | je Bezug: App (Push, Mail, WhatsApp), E-Mail-Vorlage (HvK/Pivacom), Webhook (Standard/Convexa), 3 Wiederholungen, Push bei Fehler | E-Mail-/Webhook-Auslieferung ohne automatischen Test → im Pilot je Kunde einmal echt prüfen. Pivacom muss bestätigen, dass `Leadgen_ID` jetzt eine App-ID sein darf |
| Kunden-Benachrichtigung | App-Kunden: Push/Mail; E-Mail-/Webhook-Kunden über die Auslieferung selbst | Keine Nachricht an den Kunden bei Storno-Entscheidung durch uns |
| Reklamation | Kunde im Kundenbereich, Gründe je Bezug, Frist, automatische Anerkennung bzw. Prüfung, Admin „Storno prüfen“, Admin „Storno eintragen“ für Kunden ohne Login (✅ 15.11., siehe 5.) | HvK-Stornos werden von Hand aus der Abrechnungsmail eingetragen; automatisches Auslesen der Mails (Plan Punkt 4) fehlt noch |
| Abrechnung | Wochenbestellungen mit Stripe (sofort, Gutschriften verrechnet, Verlängerung freitags) | Monats-/Einmal-Bezüge (HvK, Convexa) rechnen selbst ab, App zählt nur. Login-Kunden kommen als `month` aus dem Import und werden **nicht berechnet**, bis der Bezug auf `week` steht und bestellt ist |
| Airtable-Abgleich | `/api/sync` jede Minute (cron-job.org); Aus-Schalter `AIRTABLE_SYNC_OFF=1` (✅ 15.11., siehe 5.) | nichts, Schalter erst in Schritt 9 setzen |

## 2. Reihenfolge (Pilot zuerst)

Pilot: **ein Funnel, ein Login-Kunde mit Wochenbestellung** (einfachster Weg, App-Auslieferung, Stripe), danach
Convexa (Webhook), zuletzt HvK (E-Mail, Stornos).

Vorher (PG Software, ohne Wirkung nach außen):
- [x] Code: Env-Schalter `AIRTABLE_SYNC_OFF` (überspringt nur Airtable im Sync), Admin-Knopf „Storno eintragen“ für PPL-Leads, Dubletten über Produkte, Import behält App-Einstellungen und zeigt Änderungen. Tests (15.11.2026).
- [ ] Staging, dann Produktion (Branch mergen, deployen; Schalter dabei **nicht** setzen).
- [ ] Ole: Pivacom fragen (`Leadgen_ID`), Beispiel-Abrechnungsmail von HvK besorgen.

| # | Wer | Schritt | Prüfpunkt | Rückweg |
|---|---|---|---|---|
| 1 | PG Software | Admin → Pay-per-Lead → „Aus Airtable übernehmen“: Vorschau lesen (je Bezug neu / aktualisieren / verknüpfen / unverändert / übersprungen, geänderte Felder alt → neu), dann übernehmen (Bezüge + 30 Tage Dubletten-Historie) | Bezüge vollständig (Filter, Gebiete, Ziele, Auslieferung, Preise), Dubletten-Historie da, keine „übersprungen“ ohne Grund | Erneut importieren: aktualisiert Ziel, Preis, Filter, Storno-Fenster/-Gründe, Test, aktiv; Zeitraum, Bezeichnung, Lieferweg mit Adresse/Vorlage/Webhook, „Storno immer anerkennen“ und Gebiete aus der App bleiben. Bezug löschen oder inaktiv setzen |
| 2 | Ole + PG | Pilot-Bezug prüfen: Auslieferung `app`, Periode `week`, Preis, Stornogründe, Frist | Kunde sieht Produkt unter **Bestellen** | Bezug inaktiv setzen |
| 3 | Kunde / Ole | Wochenbestellung für die laufende Woche (Stripe oder „als bezahlt“) | Bestellung `paid`, Rechnung in Stripe | Bestellung stornieren/gutschreiben |
| 4 | Ole | Perspective: Webhook **eines** Funnels auf `/api/leads/pool?token=…&produkt=<slug>` umstellen, **gleichzeitig** den Zap für diesen Funnel aus | Testlead: erscheint in Admin → Pay-per-Lead, wird verteilt, Kunde bekommt Push/Mail, kein Eintrag mehr in Airtable | Webhook zurück auf Zapier, Zap an |
| 5 | Ole + PG | 1 bis 2 Tage beobachten | Auswertung Tag: eingegangen = geliefert + abgelehnt + geparkt; keine Doppelungen; Reklamation testen | wie 4 |
| 6 | Ole + PG | Convexa: Bezug Webhook-Format „Convexa“, Funnel umstellen | Convexa bestätigt Eingang | wie 4 |
| 7 | Ole + PG | HvK: E-Mail-Vorlage an `leads@pivacom.com`, Funnel umstellen (erst nach Pivacom-OK und Storno-Knopf) | Pivacom bestätigt Mail; Storno von Hand eintragbar | wie 4 |
| 8 | Ole | Übrige Funnels umstellen, dann Zaps aus (siehe 4.) | Airtable bekommt keine neuen PPL-Leads mehr | Zaps wieder an |
| 9 | PG | `AIRTABLE_SYNC_OFF=1` in Railway (live-app) | Sync-Herzschlag grün, Werbekosten laufen weiter | Variable entfernen |

**Stichtag:** am besten Montag (Bestellwoche) und für Monatsbezüge der 1.12.; sonst Monatsziele für November
von Hand um die schon gelieferten Airtable-Leads verringern.

## 3. Daten aus Airtable

| Daten | Übernahme | Vollständig? |
|---|---|---|
| Kunden, Produkte | laufender Sync | ja |
| Bezüge (Filter, Ziel, Preis, Auslieferung) | `importSubscriptions` (einmalig, wiederholbar; in der App gepflegte Felder bleiben, `KEEP_ON_REIMPORT`) | ja, Periode kommt als `month`/`once` und muss für Login-Kunden auf `week` (Vorschau weist darauf hin) |
| Gebiete (HvK) | in der App angelegt (`SubscriptionArea`) | prüfen, ob Mengen stimmen |
| Dubletten-Historie | `importDuplicateHistory` (30 Tage, wiederholbar ohne Doppelte) | ja; zählt über alle Produkte; danach kein Abgleich mit Airtable |
| Alte Leads + Umsatz | laufender Sync (`airtableId`) | ja, bleiben nach Abschalten stehen (Löschlauf greift nur bei laufendem Sync) |
| Reklamationen alter Leads | über Airtable (`markLeadAsCancelled`) | mit `AIRTABLE_SYNC_OFF=1` schreibt die App nichts mehr nach Airtable (No-op), der Storno steht nur in der App. Die erlaubten Gründe liest die App aber weiter aus Airtable: nach dem Archivieren der Base keine Stornos alter Leads mehr → alte Stornos vorher abschließen |
| Zustimmung zur Weitergabe, Brokercode, „Abgerechnet“ | nicht übernommen | Brokercode steckt im Zap-Code: vor dem Abschalten sichern |

## 4. Abschalten danach

- [ ] Zaps: „Zap 0 - Verteil-Zap“, „Verteil-Zap (SMS-Verifizierung)“, „Auslieferungs-Zap“, „Monatlich erhaltene Leads zurücksetzen“. **Nicht** abschalten: „Allianz Lead Ads“ (Anids Privatschutz, bis ihr Meta-Formular zugeordnet ist).
- [ ] Airtable-Sync: per `AIRTABLE_SYNC_OFF` (cron-job.org weiterlaufen lassen, er holt die Werbekosten).
- [ ] Zugangsdaten tauschen, die im Zap-Code im Klartext stehen: Airtable-Token, HMAC-Secret, Google-Service-Account.
- [ ] Datenschutz: Airtable und Zapier aus der Liste der Unterauftragsverarbeiter (`SUBPROCESSORS`), Stand der Rechtstexte anheben.
- [ ] Airtable-Base erst archivieren, wenn der Sync aus ist (sonst löscht der Abgleich Leads/Kunden in der App).
- **Alte Oberfläche für Kunden:** Kunden nutzen schon `/buyer`; eine eigene alte Kundenoberfläche gibt es laut Code nicht. Für Login-Kunden ändert sich nur, dass sie wöchentlich bestellen.

## 5. Bedienung der neuen Vorbereitungen

**`AIRTABLE_SYNC_OFF`** (Schritt 9, erst wenn kein Funnel mehr über Zapier läuft):
- Railway → live-app → Variables: `AIRTABLE_SYNC_OFF=1`, Dienst neu starten. Entfernen (oder `0`) schaltet zurück.
- Wirkung: `/api/sync` überspringt nur den Airtable-Abgleich (Leads, Umsätze, Kunden, Bezüge, `PplIntake`,
  Löschlauf). Werbekosten (Meta, Kunden-Werbekonten, Outbrain, TikTok, Google) laufen weiter; cron-job.org bleibt an.
- Herzschlag „sync“ bleibt grün, Notiz „Airtable übersprungen (AIRTABLE_SYNC_OFF)“; `/api/sync?wait=1` liefert `airtable.skipped: true`.
- Rückschreiben nach Airtable (Storno, Bearbeitungsstatus, Kontaktversuche, Notizen, Abschlusswert) passiert nicht
  mehr, ohne Fehler (einmal im Log). Kundenaktionen an alten Airtable-Leads wirken nur in der App.
- Admin → Pay-per-Lead zeigt neben der Überschrift „Airtable-Abgleich an“ bzw. „aus (AIRTABLE_SYNC_OFF)“.

**„Storno eintragen“** (z. B. Heinrich von Kleist, Stornos aus der Abrechnungsmail):
- Admin → Pay-per-Lead → **Gelieferte Leads**: suchen nach Name, Telefon (auch mit 0 oder +49), E-Mail oder
  Lead-ID (`Leadgen_ID` aus der Mail), optional Bezug wählen.
- Beim Lead „Storno eintragen“: Grund aus den Stornogründen des Bezugs oder frei, Notiz (z. B. „Abrechnung Nov.“).
  Wird sofort anerkannt: Status „Storno“, Gutschrift in Höhe des Leadpreises, Umsatz storniert, Eintrag im
  Änderungsprotokoll („Storno eingetragen (Admin)“). Das Storno-Fenster gilt nicht, außerhalb erscheint ein Hinweis.
  Ein Storno in Prüfung oder ein abgelehnter wird damit anerkannt; doppeltes Eintragen ändert nichts.
- „Storno zurücknehmen“ (Fehleintrag): nur solange die Gutschrift auf keiner Bestellung verrechnet ist; Status
  geht auf den Stand vor dem Storno zurück.
- Keine Nachricht an den Kunden (HvK rechnet selbst ab).
