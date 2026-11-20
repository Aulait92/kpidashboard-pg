# Führungsrunde: Pay-per-Lead im Werbekonto des Vermittlers (20.11.2026)

Auftrag Ole: PPL skaliert in unseren eigenen Werbekonten schlecht (Leadpreise steigen, wir strecken Budget vor).
Idee: Kampagnen im Konto des Vermittlers, er zahlt Meta direkt, wir rechnen ab: Leads × Festpreis (z. B. 35 € Privatschutz)
minus sein Meta-Budget. Teilnehmer: CFO, Recht, Head of Sales, Red Team. Status: **Vorschlag, Entscheidung durch Ole offen (Stufe A).**

## Ergebnisse

**CFO: Pilot ja, Deckel nur gesteuert.**
- Größter Vorteil Cash: heute rund 2.400 € Vorfinanzierung je Kunde und Monat (bei CPL 20 €), bei 20 Kunden etwa 48.000 €.
- Steuer: Meta rechnet aus Irland ab, der Vermittler zahlt 19 % nach § 13b ohne Vorsteuerabzug. Unsere Gebühr wird voraussichtlich
  steuerpflichtige Werbeleistung (19 %). Bei 35 € Endpreis verdienen wir ab einem echten CPL von 26,47 € nichts mehr.
- Stückrechnung (90 abrechenbare Leads): CPL 10 € → 18,30 € je Lead netto; CPL 20 € → 7,19 €; CPL 30 € → Gutschrift.
- Mechanik: Stopp, wenn CPL 7 Tage über 24 €; Gutschrift nur gegen die Gebühr desselben Monats, nie Auszahlung; Mindestgebühr
  8 € je Lead; Monatsminimum 500 € netto; geplante Gebühr per SEPA am Monatsanfang, Ausgleich am Monatsende.

**Recht: machen, als Agenturleistung mit Preisobergrenze. Rechtlich sauberer als Leadhandel.**
- Vermittler ist Werbender und Verantwortlicher, wir Auftragsverarbeiter (AVV um Lead Ads und CAPI ergänzen).
- Leadhandel-Risiko (§ 7 UWG) entfällt, L2 (Partnerliste) und L9 entfallen, L1 einfacher, L3 und L8 bleiben, L5 sinngemäß.
- „Höchstens 35 € je Lead, Werbebudget bei Meta eingerechnet, darüber Gutschrift“ ist eine Preisobergrenze, kein
  Erfolgsversprechen; „zzgl. USt“; „alles inklusive“ nur, wenn USt und Software wirklich enthalten sind.
- Pflichtklauseln: abrechenbarer Lead und Reklamation, Deckel nur für unsere Budget- und Zielvorgaben, Eingriff des Kunden
  hebt den Deckel für den Monat auf, Eigentum (Konto, Pixel, Leads beim Kunden; Creatives Nutzungsrecht), Haftung für Werbeinhalte.
- Ausschließlichkeitsvertreter (Allianz): Zustimmung des Versicherers bestätigen lassen, nur freigegebene Vorlagen.

**Head of Sales: Pilot mit 3 Vermittlern über 4 Wochen.**
- Verkauf als Festpreis mit Anrechnung, keine Margenzeile. Vergleich über die Bauart (Agentur: Gebühr auch ohne Leads).
- Passt für Makler und Mehrfachvertreter mit eigenem Werbekonto ab etwa 10 Leads pro Woche. Allianz-Vertreter und
  Test-Mengen bleiben im bisherigen PPL über unser Konto.
- Erfolg: 2 von 3 machen zum vollen Preis weiter, keine Rabattforderung wegen der sichtbaren Differenz, mindestens 15 € Marge je Lead.
- Offen: Ist die Software in den 35 € enthalten?

**Red Team: in dieser Form verwerfen, nur Pilot nach Prüfung.**
- Kernannahme unbelegt: CPL steigt durch gesättigte Zielgruppen, nicht durch das Konto; Kundenkonten bieten gegeneinander.
- Sichtbare Marge, Abwanderung („mache ich selbst“, Kunde behält Kampagnen), Lernphase und Sperren neuer kleiner Konten.
- Alternative: PPL bei uns mit Vorkasse; Agenturtarif (Monatsgebühr plus Budget) als Zusatz ab etwa 40 Leads.
- Bedingungen: eigene CPL-Daten prüfen (1 Tag), Steuerberater schriftlich, Recht zu Einwilligung und Rollen, Abbruch bei Kontosperre.

## Einigkeit
Vor jedem Angebot: Umsatzsteuerfrage durch den Steuerberater klären. Nur Pilot, kein Umbau für alle.

## Beschlussvorschlag (zur Entscheidung durch Ole)
1. Vorprüfung diese Woche: Steuerberater-Frage; Data/BI prüft CPL gegen Tagesbudget in unseren Konten.
2. Bei grüner Vorprüfung Pilot mit 3 Maklern/Mehrfachvertretern, 4 Wochen, Mechanik nach CFO, Klauseln nach Recht.
3. Allianz-Vertreter und kleine Mengen bleiben im bisherigen PPL über unser Konto, mit Vorkasse.
4. Offen für Ole: Preis netto oder brutto, Software in den 35 € enthalten oder zusätzlich.

## Nachtrag Ole (20.11.2026)
- Sichtbare Marge ist „ein Ding“. Geprüfte Alternativen: „wir nehmen so viel wie Meta, höchstens 35 €“ (Fehlanreiz: wir
  verdienen mehr, je teurer der Lead) und „Meta 1:1 plus feste Pauschale, höchstens 35 €“.
- **Entscheidung Ole: Mechanik bleibt „35 € pro Lead minus Werbekosten“.** Sales-Verpackung: Rechnung zeigt Leads × Preis,
  abzüglich bereits an Meta gezahlt, keine Margenzeile.
- **Entscheidung Ole: 35 € sind Endpreis brutto, Software zusätzlich.** Unsere Nettogebühr je Lead = (35 € minus Meta-Kosten
  inkl. 13b-Steuer) / 1,19, solange der Steuerberater die Gebühr als steuerpflichtig einstuft. Ist sie steuerfrei, gilt wieder brutto = netto.
- **Entscheidung Ole: Abrechnung wöchentlich per Lastschrift** (Montag, Vorwoche; Stripe; Rücklastschrift = Kampagnen pausieren).
- Vorprüfung: Umsatzsteuer voraussichtlich 19 % (`docs/recht/ust-ppl-im-kundenkonto-2026-11-20.md`); CPL gegen Budget mit
  heutigen Daten offen (`docs/firma/analysen/2026-11-20-cpl-gegen-budget.md`), Nachweis per Kontotest im Pilot.
