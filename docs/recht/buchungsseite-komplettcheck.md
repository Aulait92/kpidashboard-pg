# Buchungsseite und Komplettcheck: interne Rechtsprüfung (19.11.2026)

Gegenstand: Lead-Reise zum Termin (journey-termin). Interne Prüfung nach AGENTS.md („Rechtliches mit Conversion-Blick“,
keine Anwaltsfreigabe abwarten). Vorher als Conversion-Texter/UX optimiert: kurz, Nutzen zuerst, Knopf als Handlung,
Rechtliches an die Stelle der Handlung.

## 1. Datenschutz auf /book: Hinweis statt Pflicht-Haken (Splittest buchungsseite_kompakt, Fassung b)

- Verarbeitung von Name, E-Mail, Telefon und Wunschzeit dient der Terminvereinbarung auf Wunsch der Person:
  Art. 6 Abs. 1 lit. b DSGVO (vorvertragliche Maßnahme). Eine Einwilligung ist dafür nicht nötig; ein Pflicht-Haken
  „Ich bin einverstanden“ suggeriert eine Einwilligung, die bei Pflicht nicht freiwillig wäre (Art. 7 Abs. 4).
- Pflicht bleibt die Information nach Art. 13 DSGVO: Hinweis direkt unter dem Knopf mit Link zur Datenschutzerklärung
  des Vermittlers („Ihre Angaben nutzen wir nur für den Termin und die Beratung. Datenschutz“).
- Unverändert und weiter freiwillig, nicht vorausgewählt: Opt-in für Erinnerungen zur Terminvorbereitung (Policen,
  Rechtsprüfung A8). WhatsApp-Bestätigung und Erinnerungen zum gebuchten Termin sind Service zur Buchung.
- Auflage: Fassung a (mit Haken) bleibt bis zur Entscheidung des Splittests Kontrollgruppe; beide Fassungen sind zulässig.

## 2. Splittests ohne Cookie

- Buchungsseite: je Aufruf eine zufällige ID (UUID), kein Cookie, kein Speichern auf dem Gerät (§ 25 TDDDG nicht
  berührt), kein Bezug zur Person. Gezählt wird nach dem Laden per Skript (Link-Scanner zählen nicht).
- Chat und Mail-Strecke: Einheit ist die Lead-ID (Pseudonym), keine Inhalte. Zweck: Verbesserung des Dienstes für den
  Vermittler (berechtigtes Interesse, Art. 6 Abs. 1 lit. f), Auftragsverarbeitung wie die übrige Lead-Reise.

## 3. Komplettcheck-Texte („doppelt zahlen und sparen“, Ole 19.11.2026)

- Ole, 19.11.2026: „Oft zahlen Menschen für dieselbe Absicherung doppelt.“ statt der früheren Fassung mit „viele“. „Oft“ beschreibt eine
  typische Lage ohne Mengenangabe, keine belegpflichtige Tatsachenbehauptung über einen Anteil (UWG § 5). Typische
  Beispiele zur Hand haben, falls ein Kunde nachfragt (doppelte Haftpflicht bei Paaren, Unfall in Kfz und eigener Police).
  Keine Zahlen oder Anteile ergänzen („jeder Dritte“, „80 %“) ohne Beleg.
- Nur „können“, „vielleicht“: kein Ersparnis- oder Ergebnisversprechen, keine Beträge, kein „Garantie“.
- „Kostenlos“: nur solange die Erstberatung nichts kostet (Vermittler mit Honorar müssten das abschalten können).
- Beide Knöpfe gleich groß und neutral beschriftet („Ja, gern“, „Nein, danke“), keine Vorauswahl, kein Beschämen bei
  „Nein“ (keine Dark Patterns, DSA Art. 25 als Maßstab). Auf der Buchungsseite erst nach der Buchung, die Buchung hängt
  nicht davon ab.
- KI-Kennzeichnung und Erstinformation unverändert (Erstanschreiben bzw. Mail).
