# Admin v2: Plan (17.11.2026)

Vorgaben: Branch `claude/loving-mendel-j965x3`, Commit `574d43db`, `docs/ux/admin-v2/demo.html` (Optik, Hash-Routen) und
`docs/ux/admin-v2/zuordnung.md` (409 Funktionen mit neuem Ort, Oles Entscheidungen am Ende). Nur auschecken, nicht mergen.
v2 ersetzt den Inhalt von `/admin/neu` (Schalter `src/lib/admin-neu/schalter.ts`), alte `/admin`-Seiten bleiben. Bestehende Pfade
bleiben (Push-Ziele, Umzugs-Links), nur die Gruppierung ändert sich (`src/lib/admin-neu/navigation.ts`).

## Antworten auf Oles Fragen

- **(a) Meta-Insights:** Agenturkonten je Kampagne (nur Name in `Cost.note`), Kundenkonten je Konto (`CustomerAdSpend`), seit 17.11.
  je Anzeige und Tag (`AdSpendDaily`, täglicher Cron 04:00 UTC). `AdSpendDaily` ist produktiv noch leer, 17 Kunden ohne Startdatum
  werden übersprungen, keiner der 10 Kunden mit Leads hat ein eigenes Werbekonto.
- **(b) Zuordnung Termin/Abschluss → Kampagne:** Modell kann es (Lead.adCampaignId/adSetId/adId/adFormId, Appointment.leadId,
  LeadContract, AdSpendDaily). Daten: Kampagne nur bei 0,3 % der Leads (96 % kommen über Airtable ohne Anzeigenfelder), 0
  Termin-Zeilen, 16 Abschlüsse gesamt. Belastbar erst für neue Leads über Meta-Webhook/Zapier/Pool.
- **(c) Betrag beim Abschluss:** Beitrag freiwillig (`Lead.closeValue`, `LeadContract.premium`), echter Beitrag bei 44–57 %;
  Provision wird nur geschätzt (`contractProvision`). Lösung in P4: Abschluss mit einem Tipp mit Beitrag aus dem Angebot,
  [Stimmt]/[Ändern], Chips mit typischen Beiträgen, `premiumSource`, „≈“ bei Schätzwerten (+4 h in P4).

## Pakete

| # | Inhalt | Std. | Hängt ab von |
|---|---|---|---|
| A0 | Datenbasis: AdSpendDaily nach erstem Cron prüfen, Rückfüllung, Startdatum 17 Kunden, kette.ts zählt Anzeigenfelder, Pool-Kosten je Käufer nach Lead-Anteil | 5 | – |
| A1 | Rahmen v2: Mein Tag, Verkaufen, Betreuen, Liefern, Geld; unten Werkzeuge, Einstellungen, Was wo ist; Handy 5 + Mehr; „+ Neu“ | 12 | – |
| A2 | Seitenmuster: „Braucht Aufmerksamkeit“, max. 5 Kennzahlen, Drawer; Mein Tag + 4 Rollen-Startseiten | 16 | A1 |
| A3 | ⌘K über alle Funktionen (Index aus der Zuordnung) | 6 | A1 |
| A4 | Entfernen (F100, F135, F141, F144, F200, F340, F133, F137, F399, F123, F136, F131, F132, F199, F391, F392; F261/F267/F409 nach Airtable-Abschaltung; F246 nach Anid-Umzug) | 10 (+2) | A1 |
| A5 | Zusammenlegen (Systemzustand, Testlauf, Verbindung reparieren, Editoren, Meta-Gebühren, ein Schalter Werbung, feste Werte) | 32 | A1, A2 |
| A6 | Leadpreis 7 Tage je Werbekonto gegen Ziel (`refCplFor`), Hinweis > 5 € über Ziel | 6 | A0, A2 |
| A7 | Betreuen › Kampagnen (lib/kampagnen-zahlen.ts, Tabelle, beste je Produkt, > 400 € ohne Abschluss, Kundenakte) | 20 | A0, A2, P4 |
| A8a | Muster erfassen (AdMuster: Hook, Medium, Länge, Angebot, Zielgruppe, Formularfragen) | 14 | A7 |
| A8b | Karte „Was gerade gewinnt“ | 5 | A8a |
| A8c | Wöchentliche Varianten als A/B-Test, 80/20, Regionssperre, je Kunde abschaltbar; nur Pool, Oles Konten, Testkunden | 26 | A8a |
| A8d | Recht: Klausel in AVV/AGB, Zustimmung je Kunde, Schalter erst nach Anwalt | 4 + Anwalt | Anwalt |

Summe ca. 156 h (19–22 Personentage). Vermittlerbereich (P/M-Pakete) hat Vorrang (AGENTS.md).
Reihenfolge: A0+A1 → A2 → A6 → A3 → A4+A5 → A7 (nach P4) → A8a/b → A8c (nur Pool/Ole/Test) → A8d.

## Arbeitsannahmen (Empfehlungen, gelten bis Ole anders entscheidet)

1. Betreuen › Kampagnen zeigt Kunden mit eigenen Kampagnen; Pool-Kampagnen unter Liefern › Werbekonten, Kosten je Käufer nach Lead-Anteil nur als Hinweis.
2. Leadpreis 7 Tage aus Meta-Leads; Termine/Abschlüsse aus unseren Leads; Hinweis ab 20 % Abweichung.
3. Autopilot darf nur selbst angelegte Testanzeigen in laufenden Anzeigengruppen aktivieren, max. 20 % Budget, Stopp bei Fehlern; sonst Freigabe per Knopf. Bis zur Entscheidung: nur Freigabe.
4. Lernbasis vor der Klausel: Pool-Kampagnen, Oles eigene Konten, Testkunden. Kunden-Kampagnen erst nach Klausel (Klausel um Muster-Nutzung mit Widerspruch erweitern).
5. „Umsatz Vermittler“ = Abschlussprovision/Courtage im ersten Jahr (`contractProvision`), Schätzwerte mit „≈“; Lernziel Umsatz je 1 € erst ab 5 Abschlüssen mit echtem Beitrag je Produkt, sonst Kosten je Termin.

## Risiken

Recht (Muster eines Kunden für andere; Klausel-Entwurf deckt nur anonymisierte Werte aus ≥ 5 Auftraggebern; § 203 StGB; Rechte an
Anzeigeninhalten), Meta-API (Drosselung, Attributionsfenster, Advantage+, Lernphase, Aktivieren neuer Anzeigen ist neuer Pfad,
`ads_read`/Seiten-Token), Datenqualität (0,3 % Kampagne am Lead, AdSpendDaily leer, wenige Kampagnen über 20 Leads/400 €). Leere
Zustände brauchen eine klare nächste Handlung.
