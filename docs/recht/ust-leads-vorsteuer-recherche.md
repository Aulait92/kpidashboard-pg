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

## Recherche zu den vier offenen Punkten (20.11.2026)

CFO, eigene Web-Recherche, **keine verbindliche Steuerberatung**. Gelesen wurden nur Suchergebnisse und Fachbeiträge;
Volltexte bei bundesfinanzhof.de, nrwe.justiz.nrw.de, datenbank.nwb.de und gesetze-im-internet.de sind in dieser Umgebung
gesperrt. „Belegt“ heißt: in mindestens einer seriösen Fachquelle mit Aktenzeichen und Kernaussage gefunden.

### Überblick

| Punkt | Ampel | Ergebnis in einem Satz |
|---|---|---|
| 1. Befreiung bei abschlussunabhängigem Leadpreis | **GELB** | Vertretbar: Unionsrecht stellt auf die Tätigkeit ab, nicht auf die Vergütungsform; kein BFH-Urteil zum Leadpreis, keine Revision zu FG Köln 8 K 3212/15 auffindbar. |
| 2. Zuordnung Meta je Pool über Kampagnen-ID | **GRÜN** (Methode) / **GELB** (Gemeinkosten-Schlüssel) | Direkte Zuordnung ist der gesetzlich vorrangige Weg; nur gemischte Pools und Gemeinkosten brauchen einen Schlüssel. |
| 3. Ab wann gilt die Vorsteuerkürzung | **ROT** | Nicht erst ab 20.11.2026: Maßgeblich ist jeder einzelne Meta-Bezug für Leads an Vermittler, also rückwirkend für alle offenen Zeiträume; § 15a hilft nicht. |
| 4. Alte Stripe-Rechnungen mit 19 % | **GELB** | Steuer nach § 14c Abs. 1 geschuldet; Berichtigung nur mit Rückzahlung an den Kunden; die Meta-Vorsteuer für diese Leads ist so oder so nicht abziehbar. |

### 1. Befreiung bei abschlussunabhängigem Leadpreis

**Ergebnis:** gut vertretbar, nicht gesichert. Ampel bleibt GELB.

- **Revision zu FG Köln 8 K 3212/15:** In keiner Quelle ein BFH-Aktenzeichen oder ein Hinweis auf eine Revision gefunden.
  Das spricht für Rechtskraft, ist aber **nicht verifiziert** (NRWE und NWB nicht abrufbar). Achtung zur Lesart: Geklagt
  hatte die **Leadkäuferin** (Maklerin); das FG sah schon die Verschaffung von PKV-Leads als Vermittlungsbeitrag nach
  § 4 Nr. 11 und versagte deshalb den Vorsteuerabzug aus der Leadrechnung. Für uns als Leadverkäufer heißt das: Auch das
  FG Köln behandelt unsere Leistung als befreit, und eine darin ausgewiesene USt wäre nur nach § 14c geschuldet. Ob die
  Leads dort je Datensatz bezahlt wurden, ließ sich ohne Volltext nicht prüfen.
- **FG München 19.05.2010, 3 K 134/07 (rkr. laut Fachquelle):** Leadverkauf einer Vergleichsplattform befreit; eine
  „Fixkostenbeteiligung“, die **unabhängig vom Zustandekommen** des Vertrags gezahlt wird, schadet nicht, die Bezeichnung
  der Vergütung ist unerheblich. Das ist die direkteste Stütze für unser Preismodell.
- **BFH-Linie:** V R 7/08 (Zuführungsprovision an Makler befreit, mittelbare Beziehung genügt); V R 9/13 (24.07.2014:
  Vermittlung kann in Nachweis, Kontaktherstellung oder Verhandeln bestehen, Bezug auf das einzelne Geschäft nötig);
  V R 19/16 (03.08.2017: Aufbau eines Strukturvertriebs nicht befreit, weil kein spezifischer und wesentlicher Bezug zum
  einzelnen Vertrag). Dagegen V R 50/05 (Werbeagent, reines Einholen von Kundendaten steuerpflichtig).
- **EuGH-Linie:** J.C.M. Beheer (C-124/07, 03.04.2008): keine direkte Beziehung zu Versicherer oder Versichertem nötig,
  es genügt eine wesentliche Mittlerrolle in einer Kette. Arthur Andersen (C-472/03) und Aspiro (C-40/15, 17.03.2016):
  Kern der Vermittlung ist, Kunden zu suchen und mit dem Versicherer zusammenzubringen; bloß verwaltende oder technische
  Hilfstätigkeiten sind nicht befreit. Keine dieser Entscheidungen macht die Befreiung von einer erfolgsabhängigen
  Vergütung abhängig; das EuG (Versãofast, T-657/24) wertet sie nur als Indiz.
- **Ausland, nur Argumentationshilfe:** Court of Appeal (UK), Insurancewide/Trader Media [2010] EWCA Civ 422:
  Vergleichsseiten, die Interessenten an Versicherer zuführen, sind befreit, wenn sie mehr tun als einen Klick
  weiterzuleiten; reine Werbung ist ausgenommen.
- **Gegenstimme in der Literatur:** IWW (Tippgeber/Umsatzsteuer): Leadgenerierung, die nur Kundendaten zur Vorbereitung
  einsammelt, sei nicht befreit. Das ist die Linie, die das FA ziehen könnte.

**Was den Ausschlag gibt:** nicht die Vergütungsform, sondern ob der Lead auf einen bestimmten Versicherungsabschluss
gerichtet ist (spartenbezogene Anzeige, Formular, Einwilligung zur Beratung durch einen Vermittler) und exklusiv an einen
Vertreter/Makler geht. Das haben wir seit 20.11.2026 so gebaut.

**Steuerberater muss bestätigen:** Rechtskraft FG Köln 8 K 3212/15 (juris/BFH-Datenbank) und FG München 3 K 134/07;
dass er die Befreiung bei Preis je Lead trägt; aktuelle Fassung Abschn. 4.11.1 Abs. 2 UStAE.

### 2. Zuordnung der Meta-Kosten nach § 15 Abs. 4 UStG

**Ergebnis:** Die Kampagnen-ID-Zuordnung ist genau der Weg, den Gesetz und Verwaltung zuerst verlangen. GRÜN für die
Methode, GELB für den Schlüssel bei Gemeinkosten.

- **Reihenfolge (Abschn. 15.16, 15.17 UStAE; BMF 13.02.2024, III C 2 - S 7306/22/10001:001):**
  (1) Vorsteuer, die ausschließlich steuerfreien oder ausschließlich steuerpflichtigen Umsätzen dient, direkt zuordnen
  (Meta-Kampagne nur Software-Werbung: voll abziehbar; Kampagne eines Pools, der nur an Vermittler verkauft: nicht
  abziehbar). (2) Nur der Rest wird aufgeteilt, und zwar nach einer **wirtschaftlichen Zurechnung**, wo möglich.
  (3) Der Gesamtumsatzschlüssel ist nachrangig, nur wenn keine präzisere Zurechnung möglich ist. Die Wahl der präziseren
  Methode liegt beim Unternehmer, das FA prüft nur, ob sie sachgerecht ist. Das BMF-Schreiben gilt in allen offenen Fällen.
- **Gemischte Pools** (z. B. Tier an Vermittler steuerfrei und an Händler steuerpflichtig): Schlüssel nach **Anzahl
  gelieferter Leads je Steuerstatus** im Monat (das ist unser q aus `effektiveSteuer`). Objektbezogen und präziser als der
  Umsatz; Stornos und unverkaufte Leads anteilig. In der Voranmeldung vorläufig nach Plan-q, im Jahr endgültig nach Ist-q
  (Abschn. 15.17: vorläufiger Schlüssel wird in der Jahreserklärung berichtigt).
- **Gemeinkosten** (Railway, Tools, Berater, Büro): Gesamtumsatzschlüssel ist zulässig und am einfachsten; ein
  Nutzungsschlüssel wäre präziser, aber aufwendig. Empfehlung: Umsatzschlüssel, bei kleinem Betrag kein Aufwand wert.
- **Dokumentation:** § 22 Abs. 3 UStG verlangt, dass aus den Aufzeichnungen ersichtlich ist, welche Vorsteuer auf
  steuerfreie und welche auf steuerpflichtige Umsätze entfällt. Praktisch: monatlicher Export der Meta-Kosten je
  Kampagnen-ID mit Pool, Sparte und Steuerstatus; Zuordnungsliste Kampagne → Pool unveränderbar ablegen (GoBD);
  Leadzahlen je Steuerstatus aus der App je Monat; Methode einmal schriftlich festhalten und beibehalten.
- **Voraussetzung, die heute fehlt:** Eine Kampagne darf nicht gleichzeitig Software-Interessenten und PPL-Leads werben.
  Wo das vorkommt, wird auch diese Kampagne zur Gemeinkostenposition.

**Steuerberater muss bestätigen:** Leadanzahl-Schlüssel für gemischte Pools, Umsatzschlüssel für Gemeinkosten, Form der
Aufzeichnung (§ 22 Abs. 3), dass er die Methode in der Jahreserklärung so ansetzt.

### 3. Ab wann gilt die Vorsteuerkürzung

**Ergebnis:** Die Kürzung ist keine Wahl ab einem Stichtag. Sie gilt für jeden Meta-Bezug, der nach der Absicht beim
Bezug Leads für Vermittler erzeugen sollte, also **seit Beginn des Leadverkaufs an Vermittler**. ROT, weil Rückwirkung
und Nachzahlung drohen.

- **Sofortentscheidung (Abschn. 15.12 UStAE; BFH V R 58/00):** Entscheidend ist die durch objektive Anhaltspunkte belegte
  Verwendungsabsicht beim Leistungsbezug; spätere Absichtsänderungen wirken nur für künftige Bezüge (BFH XI B 24/20).
  Die Absicht betrifft aber die **tatsächliche** Verwendung (Verkauf an Vermittler). Ob diese Verwendung steuerfrei ist,
  folgt aus dem Gesetz, nicht aus unserer damaligen Annahme oder dem Steuersatz auf der Rechnung. Dass wir früher 19 %
  berechnet haben, macht den Umsatz nicht steuerpflichtig, und § 9 erlaubt für Nr. 11 keinen Verzicht.
- **13b-Seite:** Die Steuer auf Meta-Leistungen (Meta Platforms Ireland) entsteht mit Ablauf des Monats der Leistung und
  muss voll angemeldet werden, auch für steuerfreie Pools. Nur der gleichzeitige Vorsteuerabzug (§ 15 Abs. 1 Nr. 4) entfällt
  für den befreiten Anteil.
- **Kein § 15a:** Werbung ist eine sofort verbrauchte sonstige Leistung ohne Aktivierungsgebot (§ 15a Abs. 4 Satz 2,
  Abschn. 15a.1 UStAE); dazu die Bagatellgrenze 1.000 € je Bezug (§ 44 UStDV). Eine Berichtigung über den
  Berichtigungszeitraum gibt es also nicht. Korrigiert wird im **ursprünglichen Voranmeldungs- bzw. Jahreszeitraum**.
- **Folge für früher:**
  - Monate mit **0-%-Handrechnungen an Vermittler**, in denen die 13b-Vorsteuer der zugehörigen Kampagnen voll gezogen wurde:
    widersprüchlich, sicher zu korrigieren.
  - Monate mit **Stripe-19-%-Rechnungen** an Vermittler: Die Vorsteuer aus den zugehörigen Kampagnen ist ebenfalls nicht
    abziehbar, wenn die Leads befreit waren (siehe 4).
  - Ist der Fehler erkannt, besteht für unverjährte Zeiträume eine Berichtigungspflicht (§ 153 AO); Voranmeldungen stehen
    unter Vorbehalt der Nachprüfung (§ 168, § 164 AO). Nachzahlungszinsen § 233a AO (0,15 % je Monat) laufen erst
    15 Monate nach Ende des Steuerjahres: für 2026 ab 01.04.2028, für 2025 ab 01.04.2027, für 2024 schon seit 01.04.2026.
    Zügig korrigieren hält den Zins also klein.
- **Vorsichtiger Fall für die Rücklage:** 19 % × Meta-Kosten aller Kampagnen, deren Leads an Vermittler gingen, seit Beginn
  des Leadverkaufs, abzüglich bereits nicht gezogener Vorsteuer. Betrag aus Meta-Export je Kampagne ermitteln; bis dahin
  als Spanne führen (nicht gemessen).

**Steuerberater muss bestätigen:** dass die Rechtsauffassung „befreit“ auch für die Vergangenheit gilt (sonst keine
Korrektur, aber Nachzahlung 19/119 auf die 0-%-Handrechnungen); Umfang und Monate der Vorsteuerkorrektur; ob § 153 AO
greift oder die Korrektur mit der Antwort an das FA verbunden wird.

### 4. Alte Stripe-Rechnungen mit 19 % für befreite Leads

**Ergebnis:** Die UG schuldet die ausgewiesene Steuer, bis sie berichtigt (§ 14c Abs. 1 Satz 1). Berichtigen geht nur mit
Rückzahlung an den Kunden und wirkt erst im Monat der Berichtigung. Die Meta-Vorsteuer hängt nicht davon ab. GELB.

- **§ 14c Abs. 1:** Ausweis von USt über eine steuerfreie Leistung ist ein unrichtiger Steuerausweis; die Steuer wird
  geschuldet. Berichtigung nach § 14c Abs. 1 Satz 2 i. V. m. § 17 Abs. 1 entsprechend, **ohne Rückwirkung**.
- **Rückzahlung als Voraussetzung:** BFH 16.05.2018, XI R 28/16: Die Berichtigung beim FA setzt voraus, dass der
  zu viel ausgewiesene Betrag dem Kunden **vorher erstattet** wurde (Fall: steuerfreie Verpachtung irrtümlich mit USt).
- **Kein Ausweg über „Endverbraucher“:** EuGH C-378/21 (08.12.2022) und C-794/23 (P-GmbH II, 2025) lassen die Steuer aus
  falschem Ausweis entfallen, wenn das Steueraufkommen nicht gefährdet ist, aber nur bei **Nichtunternehmern** ohne
  Vorsteuerabzug. Unsere Kunden sind Unternehmer (Vertreter/Makler), auch wenn sie keine Vorsteuer ziehen. Das BMF-Schreiben
  vom 27.02.2024 (Abschn. 14c.1) wird nach P-GmbH II wohl angepasst; für uns voraussichtlich ohne Nutzen.
- **Vorsteuer aus Meta:** Die § 14c-Steuer macht den Umsatz nicht steuerpflichtig. Der Abzug der Eingangs-Vorsteuer
  richtet sich nach der tatsächlichen (steuerfreien) Verwendung, § 15 Abs. 2 Nr. 1. Folge: **Doppelbelastung**, solange die
  Rechnungen stehen: 19 % USt abführen (aus dem Kundengeld) und keine Vorsteuer aus Meta. Wer stehen lässt, „rettet“ damit
  nicht die Vorsteuer. (Gesetzessystematik; ein Urteil genau zu dieser Kombination wurde nicht gefunden, BFH V R 5/18 geht
  in diese Richtung.)
- **Zivilrecht (Hinweis, kein Steuerrecht):** Wo der Vertrag „netto zuzüglich gesetzlicher Umsatzsteuer“ lautet, kann ein
  Kunde die nicht geschuldete USt zurückverlangen. Bei Vermittlern ohne Vorsteuerabzug hat er dazu einen echten Anreiz.

**Wirtschaftlich:**
- Stehen lassen: kostet die UG nichts zusätzlich (die USt kam vom Kunden), der Kunde trägt 19 % zu viel, Widerspruch zur
  Rechtsauffassung gegenüber dem FA bleibt sichtbar.
- Berichtigen: UG zahlt dem Kunden 19/119 des Bruttobetrags zurück und holt denselben Betrag in der Voranmeldung des
  Berichtigungsmonats vom FA zurück. Ergebnisneutral, aber **Liquidität geht zuerst raus** (bis zu einem Monat). Plus
  Verwaltungsaufwand und ein positives Kundensignal.
- **Absicherung durch Abwarten:** Lehnt das FA die Befreiung ab, waren die 19-%-Rechnungen richtig. Wer jetzt berichtigt
  und zurückzahlt, muss bei Ablehnung nachberechnen.

**Steuerberater muss bestätigen:** ob die Stripe-USt korrekt angemeldet wurde; ob berichtigt werden soll (und ob vor oder
nach der Antwort des FA); ob er für diese Leads ebenfalls die Vorsteuerkorrektur verlangt.

### Handlungsempfehlung CFO

1. **Rücklage sofort erhöhen** (Reihenfolge des Geldes, Platz 1): 19 % der Meta-Kosten aller Vermittler-Pools seit Beginn
   des Leadverkaufs plus die schon heute geschuldete Stripe-USt. Betrag aus Meta-Export je Kampagne; bis dahin vorsichtig
   schätzen. Stufe B (CFO-Vorschlag), Auszahlung nichts.
2. **Stripe-19-%-Rechnungen vorerst stehen lassen**, bis Steuerberater und FA die Befreiung bestätigen; danach gesammelt
   berichtigen und zurückzahlen (Kundengeld, Stufe A, Ole). Grund: Abwarten sichert gegen eine Ablehnung ab und kostet die
   UG nichts.
3. **Ab November 2026** 13b-Steuer auf Meta voll anmelden, Vorsteuer nur für Software- und steuerpflichtige Anteile ziehen
   (Leadanzahl-Schlüssel je Pool). Meta-Export je Kampagnen-ID monatlich ablegen; Kampagnen nie zwischen Software und PPL
   mischen.
4. **Frühere Monate:** nicht selbst korrigieren. Steuerberater entscheidet, ob und wie die Vorsteuer für Vermittler-Pools
   korrigiert wird, am besten zusammen mit der Antwort an das FA (offene Darlegung stärkt die Glaubwürdigkeit).
5. **Steuerberater-Termin** mit diesen vier Fragen und der Übersicht aller Lead-Rechnungen (Käufer, Status, Produkt,
   Steuersatz) plus Meta-Kosten je Kampagne und Monat. Kosten geschätzt 300 bis 800 €, Stufe B (unter 500 € je Vorgang
   CFO, darüber Ole).

Risiko insgesamt: Die Befreiung bleibt wirtschaftlich vorteilhaft (siehe oben), aber die Vergangenheit kostet
voraussichtlich Geld: 19 % der bisherigen Meta-Kosten der Vermittler-Pools, solange die Befreiung gilt. Spanne erst nach
Meta-Export belastbar.

### Quellen (Recherche 20.11.2026)

- FG Köln 25.09.2018, 8 K 3212/15 (Leitsatz, keine Revision auffindbar): [NRWE](https://nrwe.justiz.nrw.de/fgs/koeln/j2018/8_K_3212_15_Urteil_20180925.html), [NWB](https://datenbank.nwb.de/Dokument/Anzeigen/819780/)
- FG München 19.05.2010, 3 K 134/07 (Fixkostenbeteiligung unabhängig vom Abschluss): [NWB](https://datenbank.nwb.de/Dokument/422050/), [npta](https://www.npta-de.com/blog/verkauf-von-sog-leads-ist-umsatzsteuerfrei)
- BFH V R 9/13 (24.07.2014): [IWW](https://www.iww.de/wvm/steuergestaltung/umsatzsteuer-umsatzsteuerfreiheit-auch-ohne-direkten-kontakt-zum-versicherer-und-zum-endkunden-f91814), [rechtslupe](https://www.rechtslupe.de/steuerrecht/ust/umsaetze-aus-dem-verkauf-von-versicherungsbestaetigungskarten-382972)
- BFH V R 19/16 (03.08.2017): [otto-schmidt](https://www.otto-schmidt.de/news/steuerrecht/aufbau-eines-strukturvertriebes-nicht-steuerfrei-gem-4-nr-11-ustg-2017-10-10.html), [rewis](https://rewis.io/urteile/urteil/p3n-03-08-2017-v-r-1916/)
- Tippgeber und Umsatzsteuer (Gegenstimme): [IWW](https://www.iww.de/wvv/steuergestaltung/tippgeberumsatzsteuer-welche-tippgeber-sind-umsatzsteuerbefreit-welche-umsatzsteuerpflichtig-f116768)
- EuGH C-124/07 J.C.M. Beheer: [Haufe](https://www.haufe.de/id/entscheidung/eugh-urteil-vom-03042008-c-12407-HI1974649.html), [HMRC VATINS5230](https://www.gov.uk/hmrc-internal-manuals/vat-insurance/vatins5230); EuGH C-40/15 Aspiro: [Clifford Chance](https://www.cliffordchance.com/briefings/2016/07/vat_treatment_ofoutsourcedclaimshandlin.html), [vatupdate](https://www.vatupdate.com/2021/07/11/flashback-on-ecj-cases-c-40-15-aspiro-claims-settlement-services-provided-by-a-third-party-are-not-vat-exempted/)
- Insurancewide/Trader Media [2010] EWCA Civ 422: [National Archives](https://caselaw.nationalarchives.gov.uk/ewca/civ/2010/422), [CMS](https://cms.law/en/gbr/legal-updates/click-for-victory-online-price-comparison-sites-can-benefit-from-vat-insurance-exemption)
- BMF 13.02.2024 Vorsteueraufteilung: [PwC](https://blogs.pwc.de/de/steuern-und-recht/article/241998/bmf-vorsteueraufteilung-nach-dem-verhaeltnis-der-umsaetze-im-sinne-von-15-absatz-4-satz-3-umsatzsteuergesetz-ustg/), [Grant Thornton](https://www.grantthornton.de/themen/2024/bmf-praezisiert-vorsteueraufteilung-nach-dem-verhaeltnis-der-umsaetze/), [Rödl](https://www.roedl.com/insights/umsatzsteuer-vorsteueraufteilung-gesamtumsatz-schluessel/); Abschn. 15.16 UStAE: [Haufe](https://www.haufe.de/id/norm/umsatzsteuer-anwendungserlass-1516-grundsaetze-zur-aufteilung-der-vorsteuerbetraege-HI7554985_p15.16.html)
- Abschn. 15.12 UStAE (Sofortentscheidung): [Haufe Stand 31.12.2022](https://www.haufe.de/id/norm/umsatzsteuer-anwendungserlass-stand-zum-31122022-1512-allgemeines-zum-ausschluss-vom-vorsteuerabzug-HI15523290_p15.12.html); BFH V R 58/00: [Haufe](https://www.haufe.de/id/entscheidung/bfh-urteil-vom-25042002-v-r-5800-HI913401.html); BFH XI B 24/20: [IWW](https://www.iww.de/pfb/steuern-und-recht-aktuell/umsatzsteuer-rueckwirkend-geaenderte-verwendungsabsicht-ist-fuer-vorsteuerabzug-aus-den-akhk-irrelevant-f137741)
- BFH XI R 28/16 (Rückzahlung vor Berichtigung): [otto-schmidt](https://www.otto-schmidt.de/news/steuerrecht/zu-den-voraussetzungen-der-berichtigung-beim-unrichtigen-steuerausweis-2018-08-06.html), [IWW](https://www.iww.de/mbp/steuern-und-bilanzierung-aktuell/umsatzsteuer-berichtigung-eines-unrichtigen-steuerausweises-setzt-differenzrueckzahlung-an-kunden-voraus-f116581)
- BFH V R 5/18 (§ 15 Abs. 2, § 14c): [rewis](https://rewis.io/urteile/urteil/voi-13-11-2019-v-r-518/)
- EuGH C-378/21, BMF 27.02.2024, EuGH C-794/23: [Ebner Stolz](https://www.ebnerstolz.de/de/unser-angebot/leistungen/steuerberatung/umsatzsteuer/eugh-unrichtiger-steuerausweis-endverbraucher-93545.html), [Forvis Mazars](https://www.forvismazars.com/de/en/who-we-are/news/press-media/newsletters/newsletter-steuern/newsletter-steuern-4-2025/eugh-urteil-zu-14c-ustg-bei-endverbrauchern), [BMF-Schreiben (PDF)](https://www.steuerschroeder.de/blog/wp-content/uploads/2024/02/2024-02-27-ausweis-einer-falschen-steuer-in-rechnungen-an-endverbraucher.pdf)
- § 15a Abs. 4, § 22 Abs. 3 UStG, § 44 UStDV, §§ 153, 164, 168, 233a AO: Gesetzeskenntnis, Primärtext hier nicht abrufbar.
