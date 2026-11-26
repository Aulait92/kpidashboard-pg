# AGB je Angebot: nur, was gilt (26.11.2026)

Auftrag Ole, 26.11.2026: Bei Angeboten ohne Pay-per-Lead (Betreuung + Software, Nur Betreuung, auch mit Zusatzsparten)
steht in den AGB nichts zu Pay-per-Lead, auch nichts zur Umsatzsteuer auf Leads. Vorauszahlung nur, wenn im Angebot
gewählt oder wählbar. Grundsatz: Es steht nur drin, was für dieses Angebot gilt oder was der Kunde dort noch wählen kann.

## Umsetzung

- Wortlaut der AGB unverändert, `LEGAL_VERSION` bleibt „26.11.2026“. Gefiltert wird je Angebot nach Merkmalen
  (`agbMerkmaleAus`, lib/legal-texts.ts): Paket, Pay-per-Lead ja/nein (Leadpaket oder Lead-Produkte am Angebot),
  eigene Kampagnen ja/nein, Vorauszahlung ja/wählbar/nein. Regeln: `AGB_REGELN`, Anwendung: `agbFiltern`.
- Wegfallende Stellen ohne Pay-per-Lead: Absatz „Paket Pay-per-Lead + Software“ (Leistungen: Software), Absatz
  „Umsatzsteuer auf Leads“ (Vergütung und Zahlung), im ersten Absatz von „Vergütung und Zahlung“ der Verweis darauf
  („…, soweit nicht unter „Umsatzsteuer auf Leads“ anders geregelt.“ wird zu „Alle Preise sind netto zuzüglich
  Umsatzsteuer.“).
- Wegfallende Stellen ohne Vorauszahlung: Absatz „Vorauszahlung“ (Vergütung und Zahlung), Absatz (2) „Bei Vorauszahlung
  läuft der Vertrag …“ (Laufzeit und Kündigung), Satz „Bei Vorauszahlung gibt es dafür keine Gutschrift.“ (Pause und
  Urlaub), Halbsatz „, bei Vorauszahlung (jährlich bzw. für 6 Monate) zum Ende des bezahlten Zeitraums“ (Zusatzmodule).
- Abschnitte fallen bei Betreuung nicht weg (alle 17 bleiben, Nummern unverändert); Leadangebote wie seit 24.11.2026 mit
  eigenen Abschnitten. Gemischte Angebote (Betreuung mit Lead-Produkten): allgemeine AGB mit „Umsatzsteuer auf Leads“
  plus „Leads: Bestellung, Preis und Zahlung“, „Lieferung, Nachlieferung und Erstattung“, „Abrechenbare Leads und
  Reklamation“ nach „Leistungen: Software“; ohne die Paketbeschreibung „Paket Pay-per-Lead + Software“.
- „Geltungsbereich“ und „Vertragsschluss und Rangfolge“ stehen in allen Fassungen.
- Archivfassung „Stand 25.11.2026“ (Garantie-Kunden, nie Pay-per-Lead): gleiche Regeln, Wortlaut der Datei unverändert.
- Gezeigt in: Angebotsseite und PDF (offer-document.tsx), Annahme-Link und Konto & Rechnungen → Ihr Vertrag → „Ihre AGB“
  (beide `/angebot/[token]/agb`), alles über lib/agb-angebot.ts `agbDesAngebots`.
- Hinweise zur Umsatzsteuer auf Leads außerhalb der AGB (erste Woche, § 4 Nr. 11 UStG) stehen nur bei Angeboten mit
  Lead-Produkt; Vorauszahlungstexte im Angebot nur bei gewählter oder wählbarer Vorauszahlung (Test belegt beides).
- Öffentliche Seite /rechtliches/agb: vollständig, je Paket eine Überschrift (Betreuung, Pay-per-Lead + Software,
  eigenes Werbekonto, Nur Leads), oben „Welche Abschnitte für Sie gelten, steht in Ihrem Angebot.“

## Nachweis

Bei der Annahme speichert `acceptOffer` am Angebot `agbVersion` (Stand der gezeigten Fassung), `agbMerkmale` (Paket,
ppl, kampagnen, vorauszahlung, archiv, Abschnittstitel in Reihenfolge) und `agbHash` (SHA-256 über den gezeigten
Wortlaut), dazu dieselben Werte im Protokoll `offer.accept`. Angenommene Angebote zeigen danach die gespeicherte Fassung
(z. B. bleibt „Vorauszahlung“ drin, wenn sie wählbar war und monatlich gewählt wurde). Migration additiv
(`20261126203000_offer_agb_nachweis`).

## Bewertung (intern)

- Nicht anwendbare Klauseln haben ohne das zugehörige Merkmal keinen Regelungsgehalt; ihr Wegfall ändert keine
  Rechte und Pflichten, verbessert die Transparenz (§ 307 Abs. 1 S. 2 BGB) und vermeidet überraschende Klauseln
  (§ 305c BGB). Keine Mitteilung an Bestandskunden nötig, keine erneute Zustimmung.
- Auflage: Kommt bei einem Vertrag später ein Merkmal dazu (Umstellung auf Vorauszahlung durch den Admin, Kauf von
  Leads per Stück durch einen Betreuungskunden), gelten die zugehörigen Regeln nur, wenn sie bei der Änderung in
  Textform vereinbart werden (am einfachsten: neues Angebot bzw. Angebotsversion mit dem Merkmal).
- Pflichtangaben unverändert: Anbieter, Unternehmerbezug, Rangfolge, Laufzeit, Kündigung, Haftung, Datenschutz stehen in
  jeder Fassung.
