# USt Leadverkauf: Steuerfreiheit, Vorsteuer Meta, Folgen für Media Buyer und Preise (CFO, 20.11.2026)

Vorbereitung für Ole und den Steuerberater, **keine verbindliche Steuerberatung**. Ergänzt die Rechtsprüfung
`docs/recht/ust-leadverkauf-2026-11-19.md` (Urteile, FA-Verfahren) um die Kostenseite. Primärtexte (gesetze-im-internet.de,
bundesfinanzhof.de) sind in dieser Umgebung gesperrt; Aussagen beruhen auf Fachquellen (Links) und Gesetzeskenntnis.

## Ergebnis und Ampel

| Frage | Ampel | Kurzantwort |
|---|---|---|
| 1. Leads an geprüfte Vertreter/Makler steuerfrei (§ 4 Nr. 11)? | **GELB** | Gut vertretbar, nicht gesichert. Dafür: BFH V R 7/08 (Zuführung von Interessenten an Makler befreit, mittelbare Beziehung genügt), FG Köln 8 K 3212/15 (Datensätze über PKV-Interessenten sind Vermittlung; Folge dort: kein Vorsteuerabzug). Dagegen: BFH V R 50/05 („Werbeagent“) und Abschn. 4.11.1 Abs. 2 UStAE: Online-Anbieter nur befreit, wenn am Zustandekommen beteiligt und mit Zuführungsprovision; „reine Werbung genügt nicht“, Grenze laut Verwaltung ungeklärt. Kein BFH-Urteil zum abschlussunabhängigen Leadpreis. |
| 2a. Vorsteuer aus Meta (13b) bei befreiten Leads | **sicher (Gesetz)** | § 15 Abs. 2 Satz 1 Nr. 1 UStG schließt den Abzug aus. Die 13b-Steuer muss trotzdem angemeldet werden (Steuerschuldner bleibt die UG), wird aber nicht mehr verrechnet: **19 % Aufschlag auf jeden Euro Meta für steuerfreie Pools.** |
| 2b. Aufteilung bei gemischten Umsätzen | gelb | § 15 Abs. 4: zuerst direkt zuordnen (Meta je Pool/Kampagne → Leads oder Software), nur Gemeinkosten (Railway, Tools, Berater) aufteilen; Gesamtumsatzschlüssel nur nachrangig (Abschn. 15.17 Abs. 3 UStAE, BMF 13.02.2024). Kampagnen sauber nach Pool trennen ist Pflicht und spart Geld. |
| 2c. Option zur Steuerpflicht (§ 9) | **nicht möglich** | § 9 Abs. 1 erlaubt den Verzicht nur für § 4 Nr. 8 a bis g, Nr. 9 a, Nr. 12, 13, 19. **Nr. 11 fehlt.** Steuerfrei oder steuerpflichtig folgt allein aus der Leistung, nicht aus unserer Wahl. Steuerpflicht nur durch andere Gestaltung (Abnehmer ohne Vermittlerstatus, Paket mit Software). |
| 3. Falls doch steuerpflichtig | gelb | Nachzahlung 19/119 des vereinnahmten Preises (Preis gilt als Brutto), sofern die AGB-Nachberechnung nicht greift; Zinsen § 233a AO. **Kein § 14c** bei 0 %-Rechnungen (der greift nur bei zu hohem oder unberechtigtem Ausweis, also bei unseren alten Stripe-Rechnungen mit 19 % für befreite Leads). Gegenposten: Vorsteuer aus der 13b-Steuer der Meta-Kosten wird dann abziehbar. |
| 4. Media Buyer rechnet heute ohne Steuer | **ROT** | `computeMaxCpl` (`src/lib/media-buyer-preisgrenze.ts`) setzt Break-even = Ø Netto-Leadpreis × (1 − Storno) gegen den Netto-CPL von Meta. Bei steuerfreien Pools ist der echte CPL 19 % höher: der Höchstpreis ist rund 16 % zu hoch. |

## Rechnung für Media Buyer und Preise

Begriffe: P = Leadpreis netto (bei steuerfrei = Endpreis), s = Stornoquote, C = Meta-CPL netto, q = Anteil steuerfrei
abgerechneter Leads im Pool (aus `effektiveSteuer`, `src/lib/ppl/steuer.ts`).

- **Effektiver CPL** = C × (1 + 0,19 × q). Steuerfreier Pool: C × 1,19.
- **Höchstpreis (Break-even, Meta-Netto)** = P × (1 − s) / (1 + 0,19 × q).
  Beispiel P = 50 €, s = 10 %, q = 1: heute 45,00 €, richtig **37,82 €**. Pool mit C = 40 € läuft heute als „im Rahmen“,
  verliert aber 2,60 € je Lead.
- Kleiner Zusatzeffekt: anteilige Vorsteuer auf Gemeinkosten geht verloren (Größenordnung: steuerfreier Umsatzanteil × 19 %
  der Tool-Vorsteuer, bei heutigen Volumina zweistellig im Monat; Schätzung, nicht gemessen).

**Preisgestaltung:** Vertreter und Makler ziehen selbst keine Vorsteuer (ihre Umsätze sind ebenfalls nach § 4 Nr. 11 frei,
§ 15 Abs. 2 Nr. 1). Für sie zählt der Bruttopreis. Gleiche Kundenkosten heißt: steuerfrei P_f = 1,19 × P_netto. Dann ist
unsere Marge steuerfrei P_f − 1,19 C = **1,19 × (P_netto − C)**, also 19 % höher als steuerpflichtig, obwohl Meta teurer wird.
Steuerfreiheit lohnt sich für beide Seiten, solange sie hält. Folgerung: Preise für befreite Leads als Endpreis kalkulieren
(„X € je Lead, umsatzsteuerfrei nach § 4 Nr. 11 UStG“) und nicht den alten Nettopreis unverändert ohne USt weitergeben, sonst
verschenken wir die Hälfte des Vorteils. Preisänderung ist Stufe A (Ole).

**Netto-Risiko bei Umqualifizierung** je Lead ≈ 0,16 × P_f − 0,19 × C (Steuer aus dem Preis minus zurückgewonnene Vorsteuer),
ohne Zinsen. Beispiel P_f = 50 €, C = 35 €: rund 1,33 € je Lead. Mit greifender AGB-Nachberechnung nahe null, aber Kundenärger.
Das Risiko ist also klein gegen den Vorteil; groß ist es nur, wo C klein und P hoch ist.

## Was in unseren Zahlen falsch läuft

1. **Media Buyer:** Höchstpreis ohne Steuerfaktor (siehe oben). Folge: zu frühe Budgeterhöhungen in steuerfreien Pools.
2. **Cash-Diagnose:** `src/lib/ops/cash-rechnung.ts` rechnet Ausgangs-USt pauschal 19/119 aus allen Kundenzahlungen (bei
   steuerfreien Leads zu hoch, also vorsichtig) und behandelt Reverse-Charge-Kosten als zahllastneutral (Hinweistext Zeile 342).
   Für die Meta-Kosten steuerfreier Pools stimmt das nicht mehr: 19 % davon sind echte Zahllast. Beide Fehler gehen in
   entgegengesetzte Richtung; Saldo unbekannt. Die USt-Rücklage bis zur Klärung mit dem vorsichtigen Fall bilden.

## Offene Punkte für den Steuerberater

1. Trägt er die Befreiung für abschlussunabhängige Leadpreise (FG Köln 8 K 3212/15; Revisionsstand prüfen) und den
   Rechnungshinweis seit 20.11.2026?
2. Aufteilungsmethode § 15 Abs. 4: direkte Zuordnung der Meta-Kosten je Pool (Kampagnen-ID) als Nachweis ausreichend? Schlüssel
   für Gemeinkosten (Umsatz oder Nutzung)?
3. Voranmeldung: 13b-Steuer auf Meta voll anmelden, Vorsteuer nur für steuerpflichtige Pools und Software-Kampagnen ziehen;
   ab welchem Monat (erste steuerfreie Rechnung)? Rückwirkung für frühere 0 %-Handrechnungen?
4. Alte Stripe-Rechnungen mit 19 % für befreite Leads: stehen lassen (§ 14c geschuldet, aber dann auch Vorsteuer aus Meta
   für diese Leads?) oder berichtigen? Wechselwirkung mit Vorsteuer klären.
5. Kleinbetrag: Lohnt die Befreiung bei Pools mit hohem Meta-Anteil überhaupt den Verwaltungsaufwand? (Nach Rechnung oben: ja.)

## Empfehlung

1. **Steuerfreiheit beibehalten** wie seit 20.11.2026 umgesetzt (nur geprüfte Vertreter/Makler, nur Versicherungssparten,
   getrennte Rechnung, AGB-Nachberechnung). Wirtschaftlich besser für Kunde und uns; Risiko je Lead klein. Stufe A, liegt bei Ole.
2. **Media Buyer sofort korrigieren** (Stufe B, CTO nach Freigabe): Faktor 1 + 0,19 × q in `computeMaxCpl`, bis dahin
   `maxCpl` je steuerfreiem Pool von Hand auf P × (1 − s) / 1,19 setzen. Kosten: keine; verhindert Verluste je Lead.
3. **Preise neu rechnen** für befreite Leads auf Endpreis-Basis (Vorschlag CFO an Ole, Stufe A).
4. **Buchhaltung:** Meta-Kosten je Pool trennen (Kampagnen-ID), 13b-Vorsteuer nur für steuerpflichtige Anteile ziehen; Punkte
   1 bis 4 oben mit dem Steuerberater in einem Termin klären (Schätzung 300 bis 800 €).

## Quellen

- § 9 UStG, Option nur für § 4 Nr. 8 a–g, 9 a, 12, 13, 19: [buzer.de § 9 UStG](https://www.buzer.de/9_UStG.htm), [Abschn. 9.1 UStAE (Haufe, Stand 31.12.2025)](https://www.haufe.de/id/norm/umsatzsteuer-anwendungserlass-stand-zum-31122025-91-verzicht-auf-steuerbefreiungen-9-abs-1-ustg-HI17097138_p9.1.html)
- Abschn. 4.11.1 UStAE (Online-Vermittlung, „reine Werbung genügt nicht“): [Haufe Stand 31.12.2023](https://www.haufe.de/id/norm/umsatzsteuer-anwendungserlass-stand-zum-31122023-4111-bausparkassenvertreter-versicherungsvertreter-versicherungsmakler-HI16172612_p4.11.1.html), [NWB Stand 06/2026](https://datenbank.nwb.de/Dokument/Anzeigen/848793/)
- Abschn. 15.17 UStAE, Vorrang der wirtschaftlichen Zurechnung: [Haufe Stand 31.12.2025](https://www.haufe.de/id/norm/umsatzsteuer-anwendungserlass-stand-zum-31122025-1517-aufteilung-der-vorsteuerbetraege-nach-15-abs-4-ustg-HI17097138_p15.17.html), [BMF 13.02.2024 (otto-schmidt)](https://www.otto-schmidt.de/news/steuerrecht/vorsteueraufteilung-nach-dem-verhaltnis-der-umsatze-im-sinne-von-15-abs-4-satz-3-ustg-2024-02-15.html)
- § 13b, Steuerschuldner auch bei steuerfreien Umsätzen: [Becker, NWB (PDF)](https://www.knoll-steuer.com/fileadmin/Daten/PDF/202004_Becker_NWB_reverse_charge.pdf)
- FG Köln 25.09.2018, 8 K 3212/15: [steuerschroeder.de](https://www.steuerschroeder.de/fg-koeln/8_K_3212_15_Urteil_20180925.html), [NRWE](https://nrwe.justiz.nrw.de/fgs/koeln/j2018/8_K_3212_15_Urteil_20180925.html)
- BFH V R 7/08: [IWW](https://www.iww.de/wvm/archiv/untervermittlung-zufuehrungsprovision-ist-umsatzsteuerfrei-f14519); BFH V R 50/05: [IWW](https://www.iww.de/wvv/archiv/taetigkeit-als-werbeagent-reines-einholen-von-kundendaten-verguetung-ist-umsatzsteuerpflichtig-f7037); BFH XI R 7/23: [otto-schmidt](https://www.otto-schmidt.de/news/steuerrecht/steuerfreie-tarifoptimierung-von-versicherungsvertragen-2025-10-23.html)
- § 15 Abs. 2 Nr. 1, § 14c, § 233a AO: Gesetzeskenntnis, Primärtext hier nicht abrufbar (gesetze-im-internet.de gesperrt).
