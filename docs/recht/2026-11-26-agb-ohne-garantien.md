# AGB ohne Garantien (26.11.2026)

Auftrag Ole, 26.11.2026: „Die Garantien müssen aus den öffentlichen AGB raus. Neue Kunden sollen keine alten Garantien
mehr lesen.“ Freigegeben zum sofortigen Livegang.

## Änderung

- Neuer Stand `LEGAL_VERSION = "26.11.2026"` (lib/legal-texts.ts).
- Abschnitt „Garantien“ vollständig aus den AGB entfernt (Einleitung, „Gemeinsame Voraussetzungen“, „Wahrgenommene
  Termine“, Lead-, Break-even- und Vertrags-Garantie, „Übergang“, Schlusssatz). Die folgenden Abschnitte rücken um eine
  Nummer auf (Datenschutz jetzt § 11 statt § 12 usw.; LegalSections zählt selbst).
- Absatz „Paket Pay-per-Lead + Software“: „… Meta-Zugriff, Pause und Garantien gelten dafür nicht“ wird zu
  „… Meta-Zugriff und Pause gelten dafür nicht“.
- Betroffen: /rechtliches/agb (alle Varianten), Angebotsseite und Angebots-PDF aller Angebote ab GUARANTEES_UNTIL.

## Bestandskunden mit Garantie

- Verträge aus Angeboten, deren Garantie-Datum (erste Version, `garantieStichtag`) vor GUARANTEES_UNTIL
  (22.11.2026, 19:15 Uhr) liegt, behalten ihre Garantien als Vertragsbestandteil. Ausgenommen Leadangebote (Pay-per-Lead),
  für die nie Garantien galten.
- Für sie ist die bisherige Fassung unverändert archiviert: `src/lib/agb-2026-11-25.ts` (`AGB_2026_11_25`, „Stand
  25.11.2026“). Ihr Angebot (Seite und PDF) zeigt diese Fassung, der Verweis „Details in den AGB (Abschnitt
  „Garantien“)“ zeigt damit weiter auf einen vorhandenen Abschnitt (§ 11 der archivierten Fassung).
- Abrufbar: `/angebot/[token]/agb` (Annahme-Link alter, noch offener Angebote) und im Kundenbereich unter
  **Konto & Rechnungen → Ihr Vertrag → „Ihre AGB (Stand 25.11.2026)“** (nur bei angenommenem Angebot dieser Art), mit
  „Drucken oder als PDF speichern“. Kein Link von /rechtliches/*, nicht indexiert.
- lib/garantien.ts und die tägliche Garantie-Prüfung unverändert.

## Bewertung

- Für Kunden ohne Garantie ändert sich inhaltlich nichts: Seit dem 22.11.2026 enthielt der Abschnitt nur Garantien für
  ältere Angebote. Für Kunden mit Garantie gilt ihre Fassung unverändert weiter. Daher keine Mitteilung nach AGB
  „Änderungen dieser AGB“, kein Banner, keine erneute Zustimmung (LEGAL_VERSION ist an keinem Kunden gespeichert, siehe
  tests/unit/datennutzung-avv.test.ts).
- Neue Angebote: Eine Garantie gilt nur, wenn sie als Sondervereinbarung vollständig im Angebotstext steht (Rangfolge
  Angebot vor AGB). Ein Verweis auf einen AGB-Abschnitt „Garantien“ wäre dann ins Leere; die Sondervereinbarung muss alle
  Bedingungen selbst enthalten.
- Kein Eintrag unter Neuigkeiten (rechtlicher Textfix).
