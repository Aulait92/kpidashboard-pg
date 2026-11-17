# Pay-per-Lead: Umstellungs-Drehbuch Zapier/Airtable → App (Stand 15.11.2026, Abschalt-Checkliste 17.11.2026)

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

Genaue Liste mit Reihenfolge, Prüfpunkt und Rückweg je Schritt: **Abschnitt 6** (Stand 17.11.2026). Kurzfassung:

- [ ] Zaps aus: „Zap 0 - Verteil-Zap“, „Verteil-Zap (SMS-Verifizierung)“, „Auslieferungs-Zap“, „Monatlich erhaltene Leads zurücksetzen“, nach Anids Zuordnung auch Anids Privatschutz-Zap (Meta → Airtable). **Bleiben an:** „Allianz Lead Ads“ und „Gmail to Webhooks on New Email Match“ (eigener Vertrieb, schreiben in die App, nicht nach Airtable).
- [ ] Airtable-Sync: per `AIRTABLE_SYNC_OFF` (cron-job.org weiterlaufen lassen, er holt die Werbekosten). Erst wenn auch Anids Zap aus ist.
- [ ] Zugangsdaten tauschen, die im Zap-Code im Klartext stehen: Airtable-Token, HMAC-Secret, Google-Service-Account; Brokercode liegt schon in Railway (`PPL_HVK_BROKERCODE`).
- [ ] Datenschutz: Airtable und Zapier aus der Liste der Unterauftragsverarbeiter (`SUBPROCESSORS`), Stand der Rechtstexte anheben (Commit liegt bereit, erst nach dem Abschalten deployen).
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

## 6. Abschalt-Checkliste Airtable/Zapier (vorbereitet 17.11.2026, nichts ausgeführt)

Nur vorbereitet: In Zapier, Airtable, Railway und Google wurde nichts geändert. Grundlage: `docs/pay-per-lead.md`,
`docs/livegang.md` (Schritt 6), `docs/datenschutz.md`, Code. Zapier wurde nur gelesen (Zapier-MCP `list_workflows`):
Die Schnittstelle zeigt **nur die neuen Zapier-Workflows, nicht die klassischen Zaps**. Gefunden: ein Workflow
„meta-privatschutz-anid-to-airtable“ (angelegt 08.11.2026, **aus**, Auslöser fehlgeschlagen). Die klassischen Zaps
unten stammen aus den Doku-Dateien; vor Schritt B in Zapier → Zaps einmal nach App „Airtable“ und „Webhooks by
Zapier“ filtern und die Liste abgleichen.

### 6.1 Zaps

| Zap | Was er tut | Entscheidung | Wann |
|---|---|---|---|
| „Zap 0 - Verteil-Zap“ | Perspective-Funnel → Airtable (Verteilung) | **aus** | je Funnel bei dessen Umstellung (Abschnitt 2, Schritt 4 bis 8), spätestens Schritt B |
| „Verteil-Zap (SMS-Verifizierung)“ | wie oben für Funnels mit SMS-Prüfung | **aus** | wie oben |
| „Auslieferungs-Zap“ | Airtable → Kunde (PDF-Mail, Convexa, HvK-Mail) | **aus** | Schritt B, erst wenn in Airtable kein Lead mehr auf Auslieferung wartet |
| „Monatlich erhaltene Leads zurücksetzen“ | setzt Monatszähler in Airtable zurück (veraltet) | **aus** | Schritt B |
| Anids Privatschutz-Zap (Meta-Formular 1909684100014197 → Airtable) | Kundenleads von Anid nach Airtable | **bleibt an**, bis das Formular in der App Anid zugeordnet ist (`docs/livegang.md` Schritt 6), dann **aus** | Schritt A2/B. **Blockiert Schritt C:** solange er läuft, kommen Anids Leads nur über den Airtable-Sync in die App |
| Workflow „meta-privatschutz-anid-to-airtable“ (neue Zapier-Workflows) | Versuch vom 08.11. für denselben Weg | ist schon **aus**; nicht einschalten, nach Schritt B löschen (Ole) | Schritt B |
| „Allianz Lead Ads“ | eigene Meta-Kampagnen → `/api/vertrieb/leads/webhook` | **bleibt an** (eigener Vertrieb, nicht Airtable) | nie im Rahmen dieser Abschaltung |
| „Gmail to Webhooks on New Email Match“ | LinkedIn-Nachrichten → `/api/vertrieb/linkedin/message` | **bleibt an** (eigener Vertrieb) | nie im Rahmen dieser Abschaltung |
| Lead-Webhook nach `/api/leads/eingang` (falls noch aktiv) | Kundenleads über Zapier in die App | **prüfen**: wenn aktiv, durch Meta-Webhook bzw. `/api/leads/pool` ersetzen, dann **aus** | vor Schritt D (sonst läuft Kunden-Leadverkehr weiter über Zapier) |

Nach Schritt B laufen über Zapier nur noch eigene Vertriebsdaten, keine Leads der Kunden. Deshalb kann Zapier aus
der AVV-Anlage 2 heraus, obwohl das Zapier-Konto bleibt.

### 6.2 Zugangsdaten im Zap-Code (Klartext): tauschen bzw. löschen

Werte hier nie eintragen. In der App liegen Geheimnisse nur in Railway-Variablen bzw. verschlüsselt in der Datenbank.

| Zugang | Gegenstück in der App (nur Namen) | Was tun (Schritt F) | Prüfpunkt | Rückweg |
|---|---|---|---|---|
| Airtable-Token (PAT) | `AIRTABLE_TOKEN` (dazu `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_*`, `AIRTABLE_FIELD_*`); genutzt von `lib/airtable.ts`, `lib/airtable-write.ts`, `lib/ppl/airtable-nachholen.ts`, `/api/admin/airtable-fields` | Token aus dem Zap-Code im Airtable Developer Hub widerrufen. Ist es derselbe wie in Railway: vorher neuen PAT nur lesend (`data.records:read`, `schema.bases:read`) für diese eine Base anlegen und in live-app und staging-app als `AIRTABLE_TOKEN` setzen. Nach Schritt E alle `AIRTABLE_*` in Railway löschen | Admin → Pay-per-Lead → „Lead aus Airtable nachholen“ findet einen alten Lead; Stornogründe eines alten Leads laden | widerrufene Tokens kommen nicht zurück: neuen PAT anlegen und setzen |
| HMAC-Secret (in `docs/pay-per-lead.md` genannt) | kein Gegenstück nötig: Funnel-Eingang prüft `LEAD_WEBHOOK_TOKEN`, Webhook-Auslieferung nutzt das Secret je Bezug (verschlüsselt, `ENCRYPTION_KEY`), HvK-Mail-Links `AUTH_SECRET` | Im Zap-Code (nur lesen) nachsehen, wer das Secret auf der anderen Seite kennt (z. B. SMS-Dienst, Funnel); dort entfernen bzw. wechseln. Danach ist es wertlos | keine Fehler beim Funnel-Eingang (Admin → Pay-per-Lead → Eingang), SMS-Abzeichen kommt weiter (`sms_verifiziert` vom Funnel) | altes Secret dort wieder eintragen (nur solange die Zaps noch laufen müssten) |
| Google-Service-Account (JSON-Schlüssel) | kein Gegenstück: das Lead-PDF erzeugt die App selbst (`lib/ppl/lead-pdf.ts`). `FIREBASE_SERVICE_ACCOUNT` ist ein **anderer** Schlüssel (App-Push), nicht anfassen | Google Cloud Console → IAM → Dienstkonten: Schlüssel des Zap-Kontos löschen; Konto deaktivieren, wenn es sonst nichts nutzt; Freigaben in Drive/Sheets entziehen | 24 h keine Fehler in Zapier-Verlauf/Sentry; App-Push geht weiter | Schlüssel neu erzeugen (nur falls doch ein Zap ihn braucht) |
| HvK-Brokercode | `PPL_HVK_BROKERCODE` in Railway, Platzhalter `{brokercode}` in der E-Mail-Vorlage des HvK-Bezugs (`lib/ppl/template.ts`) | Kein Passwort, sondern unsere Kennung bei Pivacom: nicht selbst rotierbar. Mit dem Abschalten des Auslieferungs-Zaps steht er nur noch in Railway. Optional Pivacom fragen, ob ein neuer Code sinnvoll ist; dann nur `PPL_HVK_BROKERCODE` ändern | Test-Lead an den HvK-Bezug (Test-Modus): Mail enthält die Brokercode-Zeile | alten Code wieder setzen |
| Nebenbei: Convexa-Webhook-Adresse (Token im Pfad) | am Convexa-Bezug in der App (aus Airtable übernommen) | steht auch im Zap und in Airtable. Optional bei Convexa eine neue Adresse anfragen und am Bezug eintragen | Convexa bestätigt Eingang | alte Adresse am Bezug |
| Nebenbei: `LEAD_WEBHOOK_TOKEN` | Railway | nur wenn er in einem Zap stand (Lead-Webhook nach `/api/leads/eingang`): wechseln und **gleichzeitig** alle Perspective-Webhooks anpassen. Sonst lassen | Testlead je Funnel kommt an | alten Wert zurück |

### 6.3 Reihenfolge

| # | Wer | Schritt | Prüfpunkt | Rückweg |
|---|---|---|---|---|
| A1 | Ole + PG | Alle Funnels auf die App (Abschnitt 2, Schritt 4 bis 8) | Admin → Pay-per-Lead → Eingang: jedes Produkt bekommt Leads über `/api/leads/pool`; Auswertung Tag: eingegangen = geliefert + abgelehnt + geparkt | Webhook in Perspective zurück auf Zapier, Zap an |
| A2 | Ole + PG | Anids Formular in der App zuordnen (`docs/livegang.md` Schritt 6) | Testlead erscheint bei Anid in der App | Zuordnung entfernen, Zap bleibt an |
| A3 | Ole | Airtable: Ansicht „noch nicht ausgeliefert“ leer, letzte HvK-/Convexa-Lieferung aus Airtable bestätigt | keine offenen Leads in Airtable | Auslieferungs-Zap noch nicht ausschalten |
| B | Ole | Zaps aus (Tabelle 6.1), Workflow löschen | Zapier-Verlauf 24 h ohne Läufe dieser Zaps; Airtable bekommt keine neuen Leads; App bekommt weiter Leads | Zap wieder an (Einstellungen bleiben erhalten) |
| C | PG | `AIRTABLE_SYNC_OFF=1` in Railway (live-app), Dienst neu starten (Abschnitt 5) | Herzschlag „sync“ grün mit Notiz „Airtable übersprungen“, `/api/sync?wait=1` liefert `airtable.skipped: true`, Admin zeigt „aus (AIRTABLE_SYNC_OFF)“, Werbekosten laufen weiter | Variable entfernen, neu starten. Vorsicht: der nächste Abgleich löscht in der App, was inzwischen in Airtable gelöscht wurde, also bis E in Airtable nichts löschen |
| D | PG, dann Ole | Rechtstexte: vorbereiteten Commit „Rechtstexte: Airtable und Zapier aus Anlage 2“ (Branch `nacht-doku`, **erst nach B und C deployen**) auf staging, prüfen, dann live. Datum `LEGAL_VERSION` vorher auf den echten Deploy-Tag setzen. `docs/datenschutz.md`: Nachweis-Tabelle „beendet am“ eintragen, Punkt „Dezember: Airtable/Zapier aus Anlage 2“ abhaken. Kunden mit angenommenem Vertrag in Textform informieren (Streichung, keine Widerspruchsfrist nötig) | `/rechtliches/avv` (Anlage 2) und `/sicherheit` ohne Airtable und Zapier, „Stand“ neu; Gedankenstrich-Test grün | Commit zurücknehmen und neu deployen |
| E | Ole | Airtable-Base archivieren (erst nach C, frühestens nach Abschluss der Stornos alter Leads, siehe Abschnitt 3); vorher Export (CSV je Tabelle) ablegen | App läuft weiter, Herzschlag grün; keine Airtable-Fehler in Sentry | Base aus dem Archiv wiederherstellen |
| F | Ole + PG | Zugangsdaten tauschen bzw. löschen (Tabelle 6.2); nach E alle `AIRTABLE_*` aus Railway (live-app, staging-app) entfernen | Prüfpunkte aus 6.2; `q=variablen` der Diagnose zeigt keine Fehler | siehe 6.2 |
| G | Ole | Zapier-Tarif prüfen (nur noch Vertriebs-Zaps), laufende Kosten unter Einstellungen → Laufende Kosten anpassen | Rechnung | Tarif zurück |
