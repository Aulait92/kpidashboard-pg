# Pay-per-Lead in der App (ersetzt Verteil-Zap, Auslieferungs-Zap, Airtable)

## Ablauf
1. **Eingang** `POST /api/leads/pool?token=<LEAD_WEBHOOK_TOKEN>&produkt=<slug oder Name>`
   - Perspective-Payload (profile/values) wird wie der frühere „Übersetzer“ übersetzt
     (`src/lib/ppl/perspective.ts`), flaches JSON wird direkt übernommen.
   - Dublette: gleiche Telefonnummer oder E-Mail in **irgendeinem Produkt** in 30 Tagen
     (wie der Zap; `DUPLICATE_ACROSS_PRODUCTS`/`DUPLICATE_DAYS` in `engine.ts`). Verglichen
     wird mit Pool-Leads, die ausgeliefert oder geparkt sind (auch die per Import übernommene
     Airtable-Historie), nicht mit Dubletten oder ungültigen. Der Grund nennt das andere Produkt.
   - Ungültig: weder Telefon noch E-Mail.
2. **Verteilung** (`src/lib/ppl/engine.ts`, `rules.ts`): d'Hondt nach Kontingent und
   Geliefertem, fällige Test-Bezüge zuerst. Filter je Bezug: PLZ, schwach (Beamte oder
   Beitrag unter Grenze, Standard 700 €), Beamte, nur schwache, Score, Gesellschaften
   ein/aus, Regeln. Kein freies Kontingent → geparkt (Push), Cron verteilt erneut.
3. **Auslieferung** (`delivery.ts`): Kundenbereich (Push, WhatsApp-Assistent falls aktiv),
   E-Mail (optional nach Vorlage, z. B. Leadbörse Heinrich von Kleist) oder Webhook
   (Format Standard oder Convexa).
   - Mehrere Lieferadressen mit Komma: jede Adresse bekommt eine eigene Mail.
   - Mail-Vorlage „Standard maschinenlesbar“ (z. B. Make-Mailhook): Betreff `Neuer Lead: {Produkt} ({Lead-ID})`,
     feste Zeilen `Feld: Wert` (Lead-ID, Datum ISO, Produkt, Anrede, Vorname, Nachname, Telefon E.164, E-Mail,
     PLZ, Ort, alle Antworten, Einwilligungstext und Zeitpunkt), am Ende `JSON: {…}` und Anhang `lead.json`
     (`src/lib/ppl/lead-mail.ts`). Einwilligungstext am Bezug, Zeitpunkt = Eingang des Funnel-Formulars.
   - Bezug → **Testdatensatz senden**: „TEST Lead“, Betreff mit [TEST], an alle Lieferadressen; legt keinen
     Lead an (zählt nicht ins Kontingent, Umsatz, Auswertung), steht im Änderungsprotokoll („Testdatensatz gesendet“).
   - **Slack** je Lead (`src/lib/ppl/slack.ts`): Railway-Variable `SLACK_PPL_WEBHOOK_URL` (Incoming Webhook);
     Ergebnis, Produkt, Bezieher, Vorname und PLZ/Ort, Lieferweg mit Status, Link in den Admin; bei
     Zustellfehler eigene Warnung. Schalter „Slack-Nachricht je Lead“ am Bezug. Prüfen: Pay-per-Lead → **Slack testen**.
4. **Kontingent**: Wochenbestellung im Kundenbereich (Vorkasse über Stripe, „jede Woche
   wiederholen“, Verlängerung freitags ab 10 Uhr) oder Monats-/Einmal-Ziel von Hand
   (Heinrich von Kleist, Convexa: rechnen selbst ab, nur gezählt).
5. **Storno** (`storno.ts`): im Fenster, mit erlaubtem Grund, ersatzlos; Gutschrift auf
   die nächste Bestellung. „Sonstiges“ oder Quote > 20 % (30 Tage) → Admin prüft.

## Unterschiede zum bisherigen Zap (bewusst)
- Dubletten wie im Zap produktübergreifend (bis 15.11.2026 prüfte die App nur im selben
  Produkt). Abschaltbar über `DUPLICATE_ACROSS_PRODUCTS = false` in `src/lib/ppl/engine.ts`.
- `schwach_grenze`, `akzeptiert_beamte`, `nur_schwach`, `ausschluss_regeln` werden
  ausgewertet (im Zap ignoriert). Heinrich von Kleist (Grenze 450 €) bekommt dann auch
  Leads mit 450–700 € Beitrag.
- Jeder Lead bekommt ein Lieferdatum (im Zap blieb `ausgeliefert_am` bei E-Mail/Convexa leer).
- Kein SMS-Preis, keine Weitergabe-Zustimmung (Superchat entfällt).
- Keine Telefonprüfung über Byteplant (nur Plausibilität der Nummer).
- Anrede in der Leadbörsen-Mail: nur wenn der Funnel sie liefert (der Zap leitete sie aus
  einer Vornamensliste ab); ohne Wert entfällt die Zeile.

## Umstellung (Vorschlag: 1.12., weil Monatsziele ab Stichtag zählen)
1. Admin → Leads → Pay-per-Lead → **Aus Airtable übernehmen**: Vorschau prüfen,
   „Leads der letzten 30 Tage für den Dubletten-Abgleich“ anhaken, übernehmen.
2. Bezug Heinrich von Kleist: Lieferung E-Mail an `leads@pivacom.com`, Betreff
   `Neuer Lead - Performancegrowth`, Vorlage:
   ```
   Brokercode: <aus dem bisherigen Zap>
   Art: KVV-Opt
   Geprüft: nein
   Anrede: {anrede}
   Name: {nachname}
   Vorname: {vorname}
   Strasse: Unbekannt
   PLZ: {plz}
   Ort: {ort}
   Geburtsdatum: {geburtsdatum}
   Berufsstatus: {berufsstatus}
   Email: {email}
   Tel_mobil: {telefon}
   Leadgen_ID: {id}
   Wo versichert: {versicherer}
   Wie versichert: {versicherungsart}
   Monatsbeitrag: {beitrag}
   ```
   Pivacom vorher fragen, ob `Leadgen_ID` jetzt eine App-ID statt Airtable-ID sein darf.
3. Convexa: Webhook-Adresse aus Airtable wird übernommen, Format „Convexa“.
4. Käufer mit Login: Bezug auf „Wochenbestellung“ stellen; Käufer hinterlegt Zahlungsart
   und bestellt im Kundenbereich unter „Bestellen“.
5. Perspective: Webhook je Funnel auf
   `https://app.performancegrowth.de/api/leads/pool?token=…&produkt=pkv-tarifoptimierung`
   (bzw. den jeweiligen Slug) umstellen, einen Testlead schicken (Admin → Pay-per-Lead → Eingang).
6. Zaps ausschalten: „Zap 0 - Verteil-Zap“, „Verteil-Zap (SMS-Verifizierung)“,
   „Auslieferungs-Zap“, „Monatlich erhaltene Leads zurücksetzen“ (veraltet).
7. Zugangsdaten rotieren, die im Zap-Code im Klartext stehen (Airtable-Token,
   HMAC-Secret „Sascha“, Google-Service-Account-Schlüssel).
