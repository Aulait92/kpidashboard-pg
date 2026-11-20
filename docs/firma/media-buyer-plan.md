# Media Buyer: Plan für Performance und Umsatz (Entwurf 20.11.2026)

Team: Performance Marketer (Leitung), Data & BI, CFO, CTO. Grundlage nur Code und Schema; Live-Zahlen (Diagnose) waren in der Sitzung gesperrt, alle Wirkungen sind Schätzungen.

## Zielgröße
Der Media Buyer maximiert den **Netto-Deckungsbeitrag je Pool** unter der harten Nebenbedingung **Lieferquote 95 bis 102 %** je bezahlter Bestellung (Pay-per-Lead) bzw. je Lead-Ziel.
- Pay-per-Lead: DB = Σ (geliefert − storniert) × Leadpreis − Werbekosten aller Kanäle. Umsatz ist durch die bestellte Menge gedeckelt; der Hebel ist der günstigere, bessere Lead, nicht mehr Menge.
- Vermittler-Konten (Kunde zahlt Meta selbst): erwarteter Provisionswert je Lead statt Leadpreis; der Buyer steuert dort heute nicht.
- Kontrollzahl daneben: Termine je 100 Leads (Kundenerfolg nicht für Marge opfern).

## Reihenfolge
| Stufe | Inhalt | Aufwand | Wirkung (geschätzt) | Freigabe |
|---|---|---|---|---|
| 0 (läuft) | Lernphasen-Schonung (±20 %, 72 h, Reset nur wenn es sich lohnt), Not-Aus zentral, Laufsperre, Datenfrische, Fehler je Kampagne, keine Reaktivierung von Hand pausierter Kampagnen; Autopilot PKV Tarifoptimierung | in Arbeit | weniger Reset-Verluste, kein Budget-Unfall | Ole: Autopilot an (erteilt) |
| 1 | Ziele aus den bezahlten Bestellungen der App statt aus dem Airtable-Abgleich | 1–2 Tage | richtige Zielmenge, weniger Gutschriften | B |
| 1 | Prognose reparieren: Bruchteil des heutigen Tages, Laufrate 7 Tage gemischt mit Monat, Wochentagsfaktoren, gleiche Zeitfenster und Zeitzone des Werbekontos; Prognosefehler im Admin | 1–2 Tage | 5–10 Prozentpunkte weniger Unter-/Überlieferung | B |
| 1 | Netto statt Brutto: Dubletten, Fake, Ablehnungen, Stornos abziehen | 1 Tag | +5 bis 15 % echte Belieferung | B |
| 1 | Höchstpreis je Lead je Pool (aus Leadpreis, Verwertungs- und Stornoquote, Zielmarge) und Monatsdeckel je Pool und gesamt; Endspurt nie über Break-even | 1–2 Tage | kein Lead teurer als sein Erlös | **A (Ole legt Zielmarge und Deckel fest)** |
| 2 | Zuordnung über Kampagnen-/Anzeigen-IDs statt Namensstichworte; Kosten aus AdSpendDaily; täglicher Budget-Snapshot je Kampagne | 1–2 Tage | Leadpreis je Anzeigengruppe rechenbar, Basis für alles Weitere | B |
| 2 | Qualitätsgewichteter Leadpreis (geglättete Terminquote) für Pausieren und Kanalverteilung; Kanal erst ab 10 Leads werten, max. 20 % Verschiebung je Lauf | 2–3 Tage | Kosten je Termin −10 bis 25 % | B |
| 2 | Budgetformel nach Grenzkosten (Leads ∝ Budget^b, b aus 28 Tagen) | 1 Tag | genaueres Treffen des Ziels | B |
| 2 | Abgestufte Verlustregeln (Anzeige/Anzeigengruppe/Pool) | 1 Tag | 5–10 % weniger verschwendetes Budget | B |
| 3 | Umbau: Entscheidungs-Engine (rein) + Guard-Schicht + Executor mit Rückweg, Snapshots je Lauf, Backtest auf AdSpendDaily, 2–4 Wochen Schattenbetrieb, dann pool-weise live | 2–3 Wochen | Sicherheit und Testbarkeit für weitere Optimierung | B, Livegang A |
| 3 | Test „Optimierung auf Termine“ (Conversion Leads) im Pool PKV Tarifoptimierung; Bündelung von Anzeigengruppen; Kostenobergrenze als Gebot | je klein bis mittel | Kosten je Termin −15 bis 30 % (Hypothese) | **A** |

## Vor dem Start zu klären
1. Diagnose-Zugang in der Claude-Umgebung, um Abdeckung der Anzeigen-IDs je Lead und die Zahl der CAPI-Ereignisse zu prüfen (entscheidet, ob Stufe 2 und der Termin-Test tragen).
2. Ole: Zielmarge und Monatsdeckel je Pool (CFO rechnet vor).
3. Steuerberater: Ist bei steuerfreiem Lead-Umsatz die Vorsteuer auf die Meta-Werbung abziehbar? Sonst +19 % auf jeden Lead.

## Erfolgsmessung
Wöchentlich Kosten je Netto-Lead und Lieferquote gegen die letzten 8 Wochen. Abbruchregel: Kosten je Lead an 3 Läufen in Folge über dem Höchstpreis → Push, bei Bestätigung Autopilot aus. (p < 0,01 gilt für A/B-Texte, nicht für die Budgetsteuerung.)

## Änderungen nach Red-Team-Prüfung (20.11.2026)
1. Stufe 0 ist Pflicht vor jedem weiteren Autopilot-Pool und gilt erst als erledigt, wenn ein Commit es belegt. Ergänzt: vorläufiger Höchstpreis je Lead = Break-even aus Leadpreis und Stornoquote (bis Ole die Zielmarge festlegt); Endspurt nur mit Schrittgrenze und nie über dem Höchstpreis; bei veralteten Daten halten, nie erhöhen; von Hand pausierte Kampagnen nie reaktivieren.
2. Monatsdeckel gesamt als eigene A-Vorlage sofort an Ole (ein Wert, wirksamster Schutz vor Budget-Unfall).
3. Netto-Zählung und Zielquelle erst nach der Preisgrenze umstellen, zum Monatswechsel, mit 2 Wochen Parallelanzeige; Wirkung auch als Kostenfolge beziffern (netto zählen heißt mehr Rohleads, also mehr Werbekosten bei gleichem Umsatz). Pausieren nach Pool-Summe kann einzelne Kunden unterbeliefern: Kundenziel neben Pool-Summe anzeigen.
4. Vertagt: Stufe 3 (Umbau, Schattenbetrieb) und Grenzkosten-Formel. Neue Regeln laufen stattdessen erst im vorhandenen Trockenlauf. Termin-Test nur, wenn die Diagnose mindestens 50 CAPI-Termine pro Woche zeigt.
5. Vorsteuer-Frage als CFO-Aufgabe mit Frist (Wirkung bis 19 % je Lead, größer als jede Optimierung hier).
