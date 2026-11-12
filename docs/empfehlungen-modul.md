# Zusatzmodul „Empfehlungen & Bewertungen“ (Stand 12.11.2026)

Preis 59 € netto/Monat, 30 Tage kostenlos testen, danach automatisch kostenpflichtig
(Erinnerung 3 Tage vorher). Ablauf und Regeln: `src/lib/empfehlung/shared.ts`, Hilfe-Text:
`docs/hilfe.md` → „Empfehlungen & Bewertungen“.

## Kurz

- Nach jedem Abschluss (Standard 7 Tage): **eine Nachricht für alle** – erst der direkte Draht zum
  Vertreter, dann der Google-Link. Kein Gating (Google-Richtlinien, UWG).
- Antworten wertet die KI aus. Kritik → Push + Aufgabe „Kunde unzufrieden – bitte heute anrufen“ in
  „Heute“, keine Empfehlungsbitte. Lob → kurzer Dank ohne zweiten Link.
- Tag 21: Bitte um Empfehlung mit persönlichem Link (nicht bei Kritik/offener Aufgabe „unzufrieden“).
  Die empfohlene Person trägt sich selbst ein → Lead mit Quelle „Empfehlung“. Bei Abschluss: Dank an den
  Empfehlenden (ohne Namen der empfohlenen Person, ohne Prämie).
- „Empfehlungslink senden“ in jedem Kontakt mit Abschluss/Bestandskunde; mit Bestandskunden-Modul die
  Kampagne „Jährliche Empfehlungsbitte“ (`{empfehlungslink}`).
- Abrechnung: Testphase ohne Abo-Position; danach Stripe-Position „Empfehlungen & Bewertungen“ tagesgenau
  anteilig (wie AGB „Selbstbuchung von Zusatzmodulen“). Ohne Abo/Startpreis-Phase → Modul trotzdem frei,
  Aufgabe „Preis anpassen“ für Ole. Im Angebot buchbar (ohne Testphase, ab Start berechnet).
- WhatsApp-Vorlagen `review_request`, `referral_request`, `referral_thanks` werden mit dem Modul automatisch
  bei Meta eingereicht (Kategorie MARKETING). Bis zur Freigabe warten die Nachfragen.

## Offen für Ole

1. **AGB:** Die Testphase (kostenlos, danach automatisch kostenpflichtig, Erinnerung vorher) ist in den
   AGB noch nicht geregelt. Die Selbstbuchung/Kündigung von Zusatzmodulen ist abgedeckt. Vorschlag zum
   Prüfen (nicht eingebaut, weil Rechtstext):
   > „Für einzelne Zusatzmodule kann der Anbieter eine kostenlose Testphase anbieten. Sie beginnt mit der
   > Buchung im Kundenbereich und endet nach der dort genannten Dauer. Kündigt der Kunde nicht bis zum Ende
   > der Testphase, wird das Modul danach zum genannten Preis berechnet. Der Anbieter erinnert den Kunden
   > vor Ende der Testphase in Textform. Eine Testphase wird je Kunde und Modul nur einmal gewährt.“
   Zusätzlich Leistungsbeschreibung des Moduls (wie beim Bestandskunden-Modul) und `LEGAL_VERSION` erhöhen.
2. **AVV:** Zweck „Nachfrage nach Abschluss und Empfehlungen (inkl. Einordnung von Antworten durch KI)“ und
   Betroffene „empfohlene Personen“ ergänzen.
3. **Dank an Empfehlende:** Satz „ich konnte weiterhelfen“ rechtlich prüfen (verrät indirekt, dass die
   empfohlene Person Kunde wurde). Notfalls neutraler formulieren (Text ist je Vertreter änderbar).
4. **Prämien für Endkunden** gibt es bewusst nicht (Provisionsabgabeverbot, Tippgeber-Regeln). Nur nach
   rechtlicher Prüfung ergänzen.
5. **Ankündigung:** Admin → Nutzung → „Zusatzmodul Empfehlungen & Bewertungen“: Entwurf prüfen, dann
   einmalig mit Knopf an alle aktiven Kunden ohne Modul senden.
