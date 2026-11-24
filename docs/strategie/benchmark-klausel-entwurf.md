# Entwurf: Klausel für anonymisierte Branchenstatistiken und Creative-KI (Stand 24.11.2026)

Status: Entwurf zur anwaltlichen Prüfung. Nicht verwenden, bevor ein Anwalt freigegeben hat. Rechtliche Vorprüfung, keine Rechtsberatung. Recherche über Legal Data Hunter (Queue Nr. 11).

**Kennzeichnung.** [LDH] = Fundstelle aus Legal Data Hunter (Läufe 18.11. Abend und 24.11.). „Ohne Fundstelle“ = eigene Einschätzung. Am 24.11. belegt: GeschGehG §§ 2, 4, BGB §§ 305c, 307, 310. Weiter ohne Fundstelle (Limit, resets_at 2026-11-25T14:48:00+00:00): UrhG, KUG, EDSA-Leitlinien 07/2020.

**Änderungsmarkierung gegenüber Stand 17.11.:** **[NEU]** neu eingefügt, **[GEÄNDERT]** umformuliert, ~~durchgestrichen~~ entfällt.

## Zweck
performancegrowth will aus den Daten aller Vermittler anonymisierte, zusammengefasste Kennzahlen bilden (zum Beispiel Erscheinensquote, Abschlussquote, Kosten pro Termin je Sparte und Region), um
1. Vermittlern einen Vergleich mit dem Durchschnitt zu zeigen (Benchmark-Dashboard),
2. das Produkt zu verbessern (Assistent, Erinnerungen, Kampagnen),
3. aggregierte Branchenauswertungen gegenüber Partnern zu nutzen (zum Beispiel Versicherern), ohne Bezug zu einzelnen Vermittlern oder Endkunden,
4. **[NEU]** eine Creative-KI lernen zu lassen, welche Anzeigen bei Kunden desselben Produkts am besten laufen, und daraus Anzeigenvorschläge für andere Kunden zu erzeugen. Eingang: nur Kampagnenkennzahlen und Anzeigeninhalte, keine Lead-Daten. Das Lernen ist je Kunde abschaltbar.

## Kurzergebnis
- **Benchmarks: GELB.** Machbar, aber nicht über die bisherige AVV-Klausel „Nutzung für eigene Zwecke“. Ein Auftragsverarbeiter, der Zwecke selbst bestimmt, wird insoweit Verantwortlicher (Art. 28 Abs. 10 DSGVO [LDH]). Lösung: Anonymisierung als Weisung des Vermittlers in der AVV, Nutzung nur der anonymen Ergebnisse im Hauptvertrag, harte Mindestschwellen.
- **Creative-KI: GELB.** Machbar mit eigener Klausel im Hauptvertrag, Opt-out je Kunde, ohne Lead-Daten, ohne Übernahme von Namen, Bildern, Marken oder wiedererkennbaren Anzeigenteilen anderer Kunden und ohne Anzeige fremder Einzelkennzahlen. Die Kampagnenkennzahlen eines Einzelvermittlers sind personenbezogen; dafür ist performancegrowth selbst Verantwortlicher.
- **[NEU 24.11.] Code-Prüfung: ROT für den Ist-Zustand.** Das Creative-Lernen läuft nicht nur auf Oles eigenen Konten und Testkunden: Seit 24.11. lädt `vorlagenVon` Gewinner-Anzeigen samt Bildern aus dem Werbekonto eines anderen echten Kunden (Abschnitt „Code-Prüfung 24.11.“). Bis die Klausel gilt bzw. der Quellkunde zugestimmt hat, für Fremdkunden sperren.
- **Größte offene Punkte:** Urheberrecht und KUG nur ohne Fundstelle geprüft; Einordnung der Anonymisierung (Auftrag oder eigener Zweck) ist von der Aufsicht nicht abschließend geklärt.

## Rechtliche Einordnung

### 1. Art. 28 Abs. 3 lit. a und Abs. 10 DSGVO
- Wortlaut [LDH] ([EUR-Lex 32016R0679, Art. 28](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679)): Der Auftragsverarbeiter verarbeitet personenbezogene Daten „only on documented instructions from the controller“ (Abs. 3 lit. a). Bestimmt er unter Verstoß gegen die Verordnung Zwecke und Mittel selbst, „the processor shall be considered to be a controller in respect of that processing“ (Abs. 10).
- Folge für den Entwurf vom 17.11.: Die Formulierung „für eigene Zwecke nutzen, insbesondere ... zur Verbesserung seiner Leistungen und für statistische Branchenauswertungen“ beschreibt genau eigene Zwecke. Für den Anonymisierungsschritt wäre performancegrowth dann Verantwortlicher und bräuchte eine eigene Rechtsgrundlage; der Vermittler bräuchte eine Grundlage für die Übermittlung an performancegrowth. Der Satz „Die Anonymisierung selbst ist Teil der Verarbeitung im Auftrag“ trägt nicht, wenn der Zweck der Anonymisierung nicht der des Vermittlers ist.
- Tragfähiger: (a) Der Vermittler weist die Anonymisierung an, weil er selbst Vergleichswerte will (eigener Zweck des Vermittlers: Steuerung seines Vertriebs). (b) Nur das anonyme Ergebnis nutzt performancegrowth weiter; dieses fällt nicht mehr unter die DSGVO (ErwG 26 S. 5 und 6 [LDH]). Restrisiko: Aufsichtsbehörden können den Anonymisierungsschritt trotzdem als eigenen Zweck von performancegrowth werten (Art. 28 Abs. 10). Dann hilft die Vereinbarkeitsprüfung nach Art. 6 Abs. 4 beim Vermittler (unten 3). EDSA-Leitlinien 07/2020 zu Verantwortlichem und Auftragsverarbeiter konnten nicht über das Tool geprüft werden (ohne Fundstelle).

### 2. Anonymisierung: Art. 4 Nr. 1, ErwG 26, EuGH C-413/23 P
- Art. 4 Nr. 1 [LDH]: personenbezogen ist jede Information über eine identifizierte oder identifizierbare Person, auch über Merkmale ihrer „economic ... identity“.
- ErwG 26 [LDH]: Maßstab sind „all the means reasonably likely to be used, such as singling out, either by the controller or by another person“, nach objektiven Faktoren wie Kosten, Zeitaufwand und Stand der Technik. Anonyme Informationen, auch „for statistical or research purposes“, fallen nicht unter die Verordnung.
- EuGH, Urteil vom 4.9.2025, C-413/23 P, EDSB gegen SRB ([EUR-Lex CELEX:62023CJ0413](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62023CJ0413) [LDH]; zu VO 2018/1725, deren Begriff nach Rn. 52 mit Art. 4 Nr. 1 DSGVO gleich auszulegen ist):
  - Rn. 72 bis 75: Pseudonymisierung ist eine Schutzmaßnahme, kein Teil der Begriffsbestimmung; wenn Maßnahmen tatsächlich verhindern, dass Daten zugeordnet werden, kann das den Personenbezug entfallen lassen.
  - Rn. 77: Für den Empfänger fehlt der Personenbezug nur, wenn er die Maßnahmen nicht aufheben kann und die Zuordnung auch nicht durch Abgleich mit anderen Merkmalen möglich ist.
  - Rn. 82: Ein Mittel ist nicht vernünftigerweise einsetzbar, wenn die Identifizierung gesetzlich verboten oder praktisch unmöglich ist (unverhältnismäßiger Aufwand).
  - Rn. 84 bis 86: An sich unpersönliche Daten werden personenbezogen, wenn sie Personen zur Verfügung gestellt werden, die über Identifizierungsmittel verfügen; dann auch mittelbar für den Weitergebenden.
  - Rn. 100, 111: Die maßgebliche Perspektive hängt vom Einzelfall ab; für die Informationspflicht bei Erhebung zählt die Sicht des Verantwortlichen.
- Folgen für die Klausel: (a) Ein Benchmark ist nur dann anonym, wenn auch der Empfänger (anderer Vermittler, Versicherer) keinen einzelnen Vermittler herausrechnen kann. Ein Versicherer kennt seine Vertreter je Region; bei kleinen Zellen (eine Region, eine Sparte, wenige Vermittler) ist Herausrechnen realistisch (Rn. 84). Darum neben „mindestens fünf Auftraggeber“ zusätzlich Mindestfallzahl je Wert, Dominanzregel (kein Kunde über 40 % eines Werts) und keine Differenzbildung über aufeinanderfolgende Auswertungen. (b) Für performancegrowth selbst bleiben die Rohdaten personenbezogen; nur die aggregierten Werte sind anonym. (c) Die Datenschutzhinweise des Vermittlers sollten die Anonymisierung zu Statistikzwecken nennen (Transparenz bei Erhebung, Rn. 108 bis 111).

### 3. Zweckbindung: Art. 5 Abs. 1 lit. b, Art. 6 Abs. 4, ErwG 50
- Art. 5 Abs. 1 lit. b [LDH]: Weiterverarbeitung für „statistical purposes“ gilt nach Maßgabe von Art. 89 Abs. 1 nicht als unvereinbar. Art. 6 Abs. 4 [LDH]: Kriterien der Vereinbarkeit (Verbindung der Zwecke, Kontext, Art der Daten, insbesondere Art. 9, Folgen, Garantien wie Verschlüsselung oder Pseudonymisierung). ErwG 50 [LDH]: bei vereinbarer Weiterverarbeitung keine gesonderte Rechtsgrundlage nötig; Information über die anderen Zwecke bleibt Pflicht.
- Bewertung: Anonymisierung von Termin- und Kampagnenergebnissen zu Vergleichswerten ist mit dem Erhebungszweck (Terminvertrieb) eng verbunden, berührt keine Art. 9-Daten (Policen und Gesundheitsangaben ausgeschlossen) und hat für Leads praktisch keine Folgen. Das spricht für Vereinbarkeit. Ob kommerzielle Branchenauswertungen „statistische Zwecke“ im Sinne von Art. 89 Abs. 1 sind, ist offen (ohne Fundstelle); die Klausel stützt sich deshalb nicht allein darauf.
- **Pay-per-Lead-Daten** (performancegrowth ist Verantwortlicher): dieselbe Prüfung nach Art. 6 Abs. 4 durch performancegrowth selbst; Datenschutzhinweis im Funnel um einen Satz zur Anonymisierung für Statistik ergänzen (Baustein D).

### 4. Sind Kampagnenkennzahlen und Anzeigen personenbezogen?
- **Kampagnenkennzahlen** (Reichweite, Klickrate, Kosten pro Lead, Erscheinensquote je Kampagne): beziehen sich auf den Kunden. Ist der Kunde ein Einzelvermittler oder eine Ein-Personen-Agentur, sind es Angaben über seine wirtschaftliche Identität (Art. 4 Nr. 1 „economic ... identity“ [LDH]) und damit personenbezogen. Bei einer GmbH mit mehreren Vermittlern regelmäßig nicht, außer die Kampagne läuft unter dem Namen einer Person.
- **Rolle:** Diese Daten verarbeitet performancegrowth nicht im Auftrag des Vermittlers über dessen Leads, sondern als eigene Kundendaten (Kampagnensteuerung als eigene Leistung). Dafür ist performancegrowth Verantwortlicher; Art. 28 passt nicht. Grundlage: Art. 6 Abs. 1 lit. f mit Opt-out (eigene Einschätzung, Art. 6 Abs. 1 lit. f nicht gesondert abgefragt; Wortlaut in derselben Quelle [LDH]).
- **Anzeigen**: Texte und Bilder enthalten oft Namen, Foto, Telefonnummer oder Stimme des Vermittlers; das sind personenbezogene Daten des Vermittlers. Anzeigen ohne solche Merkmale (Stockbild, Produktaussage) nicht.
- **Lead-Daten** sind nach der Vorgabe ausgeschlossen. Achtung: Kennzahlen wie „Erscheinensquote“ stammen aus Lead-Datensätzen. Für die Creative-KI nur aggregierte Kampagnenwerte je Anzeige verwenden, nie Einzeldatensätze.

### 5. GeschGehG ([LDH] seit 24.11.)
- Welche Anzeige bei einem Kunden gewinnt und zu welchen Kosten, ist für ihn wirtschaftlich wertvoll und nicht öffentlich. Die Anzeigen selbst sind öffentlich (Werbebibliothek), ihre Leistungszahlen nicht. Das kann ein Geschäftsgeheimnis im Sinne von § 2 Nr. 1 GeschGehG sein ([gesetze-im-internet.de, § 2](https://www.gesetze-im-internet.de/geschgehg/__2.html) [LDH]; Tooltext nur lit. a: Information, die in den Kreisen, die üblicherweise damit umgehen, weder allgemein bekannt noch ohne Weiteres zugänglich ist; lit. b und c, wirtschaftlicher Wert und angemessene Geheimhaltungsmaßnahmen, ohne Fundstelle), wenn der Kunde angemessene Geheimhaltungsmaßnahmen trifft; ein Vertrag mit Vertraulichkeitsklausel oder eine NDA (wie mit Deibel) spricht dafür.
- Nutzt performancegrowth diese Zahlen zugunsten anderer Kunden, ohne dass der Vertrag das erlaubt, droht ein Verstoß gegen § 4 Abs. 2 Nr. 2 GeschGehG („gegen eine Verpflichtung zur Beschränkung der Nutzung des Geschäftsgeheimnisses verstößt“) bzw. Nr. 3 bei Offenlegung ([gesetze-im-internet.de, § 4](https://www.gesetze-im-internet.de/geschgehg/__4.html) [LDH], Wortlaut bestätigt) und gegen die eigene Vertraulichkeitsklausel. Wo eine NDA Vertragsstrafen vorsieht (NDA Deibel: bis 5.000 € je Verstoß), kommen diese hinzu.
- Abhilfe: ausdrückliche Gestattung im Hauptvertrag (Baustein A Abs. 2 und 6), nur aggregierte Erfolgssignale über mehrere Kunden, keine Anzeige fremder Einzelkennzahlen, Opt-out. Bestehende NDAs brauchen eine Ausnahme (Baustein E). Normtext geprüft (24.11.).

### 6. Urheberrecht und Recht am eigenen Bild (ohne Fundstelle, Limit)
- Anzeigentexte und Bilder können Werke (§ 2 UrhG) oder Lichtbilder (§ 72 UrhG) sein. Wer die Rechte hat, hängt davon ab, wer die Anzeige erstellt hat: performancegrowth (eigenes Team oder eigene KI), der Kunde oder ein Fotograf des Kunden.
- Das Analysieren für das Training ist als Text und Data Mining nach § 44b UrhG grundsätzlich erlaubt, sofern kein maschinenlesbarer Nutzungsvorbehalt besteht; die Ausgabe ähnlicher Anzeigen für einen anderen Kunden kann aber eine Bearbeitung (§ 23 UrhG) sein, wenn wiedererkennbare Teile übernommen werden.
- Porträts des Vermittlers: § 22 KUG; das Foto darf nicht in Anzeigen anderer Kunden auftauchen.
- Abhilfe: Rechteeinräumung für Analyse und Training (Baustein A Abs. 3), Ausschluss der Übernahme wiedererkennbarer Teile, Personenbilder nur als abstraktes Gestaltungsmerkmal auswerten, Gewährleistung des Kunden für zugelieferte Inhalte.

### 7. AGB-Kontrolle §§ 305c, 307 BGB ([LDH] seit 24.11.)
- Die Kunden sind Unternehmer; § 305c und § 307 Abs. 1 und 2 gelten nach § 310 Abs. 1 BGB auch im B2B; § 310 Abs. 1 nimmt nur § 305 Abs. 2 und 3, § 308 Nr. 1, 2 bis 9 und § 309 aus und verlangt Rücksicht auf Handelsbräuche ([gesetze-im-internet.de, BGB](https://www.gesetze-im-internet.de/bgb/) [LDH]).
- **§ 305c Abs. 1 (überraschende Klausel):** Wortlaut [LDH]: Bestimmungen, die „nach den Umständen, insbesondere nach dem äußeren Erscheinungsbild des Vertrags, so ungewöhnlich sind, dass der Vertragspartner des Verwenders mit ihnen nicht zu rechnen braucht“, werden nicht Vertragsbestandteil; Abs. 2: Zweifel gehen zulasten des Verwenders. Eine Erlaubnis zur Nutzung für eigene Zwecke in einer Anlage zur AVV ist ungewöhnlich, weil eine AVV gerade die Weisungsbindung regelt. Risiko: Die Klausel wird nicht Vertragsbestandteil. Darum in den Hauptvertrag mit eigener Überschrift und Hinweis bei Vertragsschluss.
- **§ 307 Abs. 1 S. 2 (Transparenz):** Wortlaut [LDH] ([gesetze-im-internet.de, § 307](https://www.gesetze-im-internet.de/bgb/__307.html)): unangemessene Benachteiligung „kann sich auch daraus ergeben, dass die Bestimmung nicht klar und verständlich ist“. Kunde muss erkennen, welche Daten wofür genutzt werden und wie er abschaltet.
- **§ 307 Abs. 2 Nr. 1 (Leitbild):** Eine AVV-Klausel, die vom gesetzlichen Leitbild des Art. 28 (keine eigenen Zwecke) abweicht, ist angreifbar. Abhilfe: AVV bleibt weisungsgebunden; die eigene Nutzung bezieht sich nur auf anonyme Ergebnisse und auf eigene Kundendaten; Gegenleistung (Benchmark-Dashboard, bessere Vorschläge) und Opt-out sprechen für Angemessenheit.
- **Bestandskunden:** Änderung nicht über eine bloße Fiktionsklausel einführen, sondern aktive Zustimmung im Konto (Klick) oder Änderungsmitteilung mit Widerspruchsrecht und Opt-out ab Tag 1.

### 8. **[NEU 24.11.]** Code-Prüfung: Laufen Creative-Lernen und Benchmarks nur auf Oles Konten und Testkunden?

Geprüft: pgmain Live (`origin/claude/facebook-ad-media-buyer-GdTgt`, Stand f3c34b16). **Antwort: nein.**

| Funktion | Code | Datenbasis | Bewertung |
|---|---|---|---|
| Creative-Vorlagen aus fremdem Werbekonto (`vorlagenVon`, Commit 6f668ead vom 24.11.) | `src/lib/kampagnen/context.ts:44` bis `:49`, `:87` bis `:92`; `src/app/api/ops/kampagne/route.ts:115` f.; `src/lib/kampagnen/run.ts:105`, `:111` | Gewinner-Anzeigen (Texte, Bilder, Kosten je Lead/Termin) eines anderen echten Kunden, Auslöser Ole („Schwarzkopf an Lohmanns Gewinnern anlehnen, auch die Bilder“) | **ROT** ohne Zustimmung des Quellkunden: § 4 Abs. 2 Nr. 2 GeschGehG [LDH], Vertraulichkeit/NDA, Bildrechte (§§ 2, 72 UrhG, § 22 KUG ohne Fundstelle). Kein Opt-out, kein Ausgabefilter (T4 fehlt). |
| Eigene Gewinner | `src/lib/kampagnen/eigene-gewinner.ts` | nur das eigene Werbekonto des Kunden | grün |
| Tipps „Schnitt aller Kunden“ | `src/lib/zahlen-tipps-server.ts:30` bis `:36` | Quoten aller Kunden (bezahlte Leads, 90 Tage), ohne Mindestzahl an Kunden | **GELB**: T1 fehlt; bei wenigen Kunden rückrechenbar (C-413/23 P Rn. 84 bis 86 [LDH]) |
| Verlustgründe im Vergleich | `src/lib/verlustgruende.ts:59` bis `:69` | anonymer Schnitt ab 5 Kunden mit je 5 Verlusten | GELB bis grün: Fallzahl und Dominanzregel aus T1 fehlen |

Folgen: (1) `vorlagenVon` nur für Quellkunden zulassen, die Ole selbst, Testkunden (`isTest`) oder Kunden mit Zustimmung nach Baustein A bzw. F sind; Bilder fremder Kunden nie als Bildvorlage. (2) T1 im Code für beide Vergleichswerte. (3) Bestehende NDAs mit Ausnahme nach Baustein E.

## Klauseln (überarbeitet)

### A. **[NEU]** Hauptvertrag/AGB, neue Ziffer (ersetzt die Nutzung „für eigene Zwecke“ aus der AVV)

„**§ {X} Anonymisierte Auswertungen und lernende Funktionen**

(1) performancegrowth bildet aus den Ergebnissen der Nutzung der Plattform (zum Beispiel Erscheinensquote, Abschlussquote, Kosten pro Termin je Sparte und Region) anonymisierte, zusammengefasste Kennzahlen, um dem Kunden Vergleichswerte anzuzeigen, die eigenen Leistungen zu verbessern und zusammengefasste Branchenauswertungen zu erstellen. Ein Wert wird nur gebildet, angezeigt oder weitergegeben, wenn er auf Daten von mindestens fünf Kunden und mindestens {50} Einzelfällen beruht und kein einzelner Kunde mehr als 40 % dazu beiträgt. Auswertungen werden so gestaltet, dass auch durch Vergleich mehrerer Auswertungen kein Rückschluss auf einzelne Kunden, deren Kampagnen oder deren Interessenten möglich ist.

(2) Für die Kreativfunktionen (Creative-KI) wertet performancegrowth die Leistungskennzahlen der Kampagnen (zum Beispiel Klickrate, Kosten pro Lead) und die Inhalte der geschalteten Anzeigen (Texte, Bildmotive, Aufbau) der Kunden desselben Produkts aus, um zu erkennen, welche Gestaltungsmerkmale erfolgreich sind, und erstellt daraus Anzeigenvorschläge, auch für andere Kunden. Daten über Interessenten (Leads), Nachrichteninhalte, Versicherungsunterlagen und Gesundheitsangaben werden dafür nicht verwendet. Vorschläge für andere Kunden enthalten keine Namen, Bilder, Stimmen, Logos, Marken, Kontaktdaten oder Kennzahlen des Kunden und übernehmen keine Texte oder Bilder des Kunden ganz oder in wiedererkennbaren Teilen. Personenbilder werden nur als allgemeines Gestaltungsmerkmal ausgewertet (zum Beispiel „Porträt mit Blickkontakt“).

(3) Soweit der Kunde Rechte an Anzeigeninhalten hat, räumt er performancegrowth das einfache, nicht übertragbare, auf die Vertragsdauer beschränkte Recht ein, diese Inhalte für die Zwecke nach Abs. 2 zu analysieren und dafür zu vervielfältigen. Der Kunde sichert zu, dass er zugelieferte Inhalte hierfür bereitstellen darf.

(4) Der Kunde kann die Nutzung nach Abs. 2 jederzeit in seinem Konto (Einstellungen, Datennutzung) mit Wirkung für die Zukunft abschalten. Seine Kennzahlen und Anzeigen fließen dann ab der nächsten Aktualisierung nicht mehr in das Lernen ein; bereits vorher gebildete, nicht auf ihn rückführbare Modellstände bleiben bestehen. {Option Ole: Auch die Nutzung nach Abs. 1 ist abschaltbar; dann stehen dem Kunden keine Vergleichswerte zur Verfügung.}

(5) Personenbezogene Daten des Kunden selbst (zum Beispiel Kampagnenkennzahlen eines Einzelunternehmers, Name oder Bild in Anzeigen) verarbeitet performancegrowth hierfür in eigener Verantwortung auf Grundlage seines berechtigten Interesses (Art. 6 Abs. 1 lit. f DSGVO); Einzelheiten in der Datenschutzerklärung. Daten, die performancegrowth im Auftrag des Kunden verarbeitet, werden nur nach Maßgabe der Weisung in Ziffer {Y} der Auftragsverarbeitungsvereinbarung anonymisiert.

(6) Mit Abs. 1 bis 3 gestattet der Kunde die dort beschriebene Nutzung auch, soweit es sich um seine Geschäftsgeheimnisse handelt. Im Übrigen bleiben die Vertraulichkeitspflichten unberührt; Einzelkennzahlen des Kunden werden Dritten nicht offengelegt.“

### B. **[GEÄNDERT]** AVV (Anlage, neue Ziffer {Y})

Bisher (17.11.): ~~„Der Auftragsverarbeiter ist berechtigt, die im Auftrag verarbeiteten Daten zu anonymisieren und in anonymisierter, zusammengefasster Form für eigene Zwecke zu nutzen, insbesondere zur Erstellung von Vergleichswerten für Kunden, zur Verbesserung seiner Leistungen und für statistische Branchenauswertungen. Anonymisiert sind Daten, wenn ein Bezug zu einer natürlichen Person, zum Auftraggeber oder zu dessen Kunden mit allen vernünftigerweise einsetzbaren Mitteln nicht mehr hergestellt werden kann. Auswertungen werden nur veröffentlicht oder weitergegeben, wenn jeder Wert auf Daten von mindestens fünf Auftraggebern beruht. Die Anonymisierung selbst ist Teil der Verarbeitung im Auftrag und erfolgt nach dem Stand der Technik.“~~

Neu:

„**Ziffer {Y} Anonymisierung auf Weisung.** (1) Der Verantwortliche weist den Auftragsverarbeiter an, Daten über Termine und Vertriebsergebnisse (ohne Nachrichteninhalte, ohne Versicherungsunterlagen und ohne Gesundheitsangaben) nach dem Stand der Technik zu anonymisieren, damit dem Verantwortlichen Vergleichswerte mit anderen Kunden bereitgestellt werden können. **[GEÄNDERT: Weisung des Verantwortlichen mit dessen Zweck statt Berechtigung für eigene Zwecke]**

(2) Anonym ist ein Ergebnis nur, wenn weder der Auftragsverarbeiter noch ein Empfänger der Auswertung einen Bezug zu einer natürlichen Person mit Mitteln herstellen kann, die nach allgemeinem Ermessen wahrscheinlich genutzt werden, auch nicht durch Herausgreifen einzelner Werte oder Abgleich mit anderen Informationen (ErwG 26 DSGVO). Dafür gelten mindestens die Schwellen nach § {X} Abs. 1 des Hauptvertrags (fünf Kunden, {50} Einzelfälle, höchstens 40 % Anteil eines Kunden). **[GEÄNDERT: Empfängersicht und Zusatzschwellen nach EuGH C-413/23 P]**

(3) Nur so anonymisierte Ergebnisse darf der Auftragsverarbeiter nach § {X} des Hauptvertrags weiter nutzen. Personenbezogene Daten aus dieser Auftragsverarbeitung nutzt er nicht für eigene Zwecke, auch nicht zum Training von KI-Modellen. Daten nach der Anlage „Versicherungsunterlagen über WhatsApp“ sind vollständig ausgeschlossen. **[NEU]**

(4) Die Rohdaten bleiben in der Auftragsverarbeitung und werden nach den Löschfristen dieses Vertrags gelöscht; die Anonymisierung ändert daran nichts. **[NEU]**“

### C. **[GEÄNDERT]** AGB, kundenfreundlicher Text in der Leistungsbeschreibung

Bisher: ~~„Wir bilden aus den Daten aller Kunden anonymisierte Durchschnittswerte, damit du deine Ergebnisse vergleichen kannst. Dabei werden weder deine Daten noch die deiner Kunden einzeln erkennbar oder an Dritte weitergegeben.“~~

Neu: „Wir bilden aus den Ergebnissen aller Kunden anonymisierte Durchschnittswerte, damit du deine Ergebnisse vergleichen kannst. Ein Wert entsteht erst ab fünf Kunden, und niemand kann daraus deine Zahlen oder die deiner Interessenten herauslesen. Unsere Creative-KI lernt aus den Kampagnenzahlen und Anzeigen aller Kunden desselben Produkts, welche Anzeigen gut laufen, und schlägt dir und anderen Kunden neue Anzeigen vor. Daten deiner Interessenten nutzen wir dafür nicht, und deinen Namen, dein Bild, deine Texte oder deine Zahlen sehen andere Kunden nicht. Du kannst das Lernen aus deinen Kampagnen jederzeit unter Einstellungen, Datennutzung abschalten.“ (Grund: § 307 Abs. 1 S. 2 BGB Transparenz, § 305c Abs. 1 BGB keine Überraschung; Satz „nicht an Dritte weitergegeben“ entfällt, weil aggregierte Auswertungen an Partner gehen.)

### D. **[NEU]** Bausteine für Datenschutzhinweise
- Vermittler (Art. 13, Empfehlung): „Ergebnisse von Terminen (zum Beispiel ob ein Termin stattfand) werden in anonymisierter, zusammengefasster Form für Vergleichswerte und Statistiken genutzt; Rückschlüsse auf Sie sind dabei ausgeschlossen.“
- Pay-per-Lead-Funnel (performancegrowth als Verantwortlicher): derselbe Satz; Prüfung nach Art. 6 Abs. 4 dokumentieren.
- Datenschutzerklärung performancegrowth (für Kunden): Absatz zur Creative-KI mit Zweck, Daten (Kampagnenkennzahlen, Anzeigeninhalte), Rechtsgrundlage Art. 6 Abs. 1 lit. f, Widerspruch über den Schalter, Speicherdauer.

### E. **[NEU 24.11.]** Ausnahme in bestehenden NDAs (zum Beispiel Ergänzung Deibel, neue Nr. 4)

„4. Zu § 3: Nicht unter die Geheimhaltung fallen anonymisierte, zusammengefasste Auswertungen, die keinen Rückschluss auf den Auftraggeber, seine Kampagnen oder seine Kunden zulassen. Für personenbezogene Daten gilt vorrangig der Auftragsverarbeitungsvertrag.“

### F. **[NEU 24.11.]** Einzelzustimmung des Quellkunden für `vorlagenVon` (Textform genügt)

„Ich bin einverstanden, dass performancegrowth meine Anzeigen und ihre Kennzahlen nutzt, um Anzeigen für andere Kunden zu entwickeln. Mein Name, mein Bild, mein Logo und meine Zahlen werden dabei nicht übernommen oder gezeigt. Ich kann das jederzeit in den Einstellungen abschalten.“

## Technische Auflagen
- T1 Schwellen im Code erzwingen: kein Wert unter fünf Kunden, {50} Fällen oder über 40 % Anteil eines Kunden; Zellen unter der Schwelle zusammenfassen oder unterdrücken.
- T2 Keine Differenzangriffe: Filter (Region, Sparte, Zeitraum) nur so fein, dass Schwellen je Kombination halten; Auswertungen für Partner nur aus festen Berichten, keine freie Abfrage.
- T3 Datentrennung: Policen, Nachrichteninhalte und Lead-Einzeldaten haben keine Anbindung an Benchmark und Creative-KI.
- T4 Creative-KI: Eingang nur Anzeigeninhalt plus aggregierte Kennzahl je Anzeige; Opt-out-Flag je Kunde wird vor jedem Trainings- oder Abruflauf geprüft; Ausgabefilter gegen Namen, Telefonnummern, Logos und nahezu wörtliche Übernahmen (Ähnlichkeitsprüfung gegen Anzeigen anderer Kunden).
- T5 Protokoll: wer wann abgeschaltet hat; Nachweis für Bestandskunden-Zustimmung.

## Offene Prüfpunkte (aktualisiert)
- ~~Ist die Anonymisierung selbst eine Verarbeitung im Auftrag oder braucht der Vermittler eine eigene Rechtsgrundlage?~~ Teilweise beantwortet (oben 1 und 3, [LDH]): Weisungsmodell plus Vereinbarkeit nach Art. 6 Abs. 4; Restrisiko Art. 28 Abs. 10. Für die Anwältin: Hält sie das Weisungsmodell für tragfähig, oder soll performancegrowth als eigener Verantwortlicher für den Anonymisierungsschritt auftreten?
- ~~Reicht die Schwelle „mindestens fünf Auftraggeber“?~~ Nein, nach C-413/23 P Rn. 84 bis 86 [LDH] zusätzlich Fallzahl und Dominanzregel (eingearbeitet). Konkrete Zahlen ({50}, 40 %) sind fachliche Annahmen, kein Rechtsmaßstab.
- Pay-per-Lead-Daten: Datenschutzhinweis im Funnel ergänzen (Baustein D); Art. 89 Abs. 1 für kommerzielle Statistik offen.
- § 203 StGB: Wortlaut jetzt [LDH] ([gesetze-im-internet.de, § 203](https://www.gesetze-im-internet.de/stgb/__203.html)). Benchmarks nutzen keine Geheimnisse im Sinne von § 203 (keine Policen, keine Gesundheitsangaben, nur anonyme Ergebnisse); trotzdem keine Termin-Notizen oder Freitexte einbeziehen.
- ~~GeschGehG, §§ 305c, 307, 310 BGB mit Normtext prüfen~~ erledigt 24.11. [LDH]. Weiter offen: § 44b UrhG, § 22 KUG, Rechtsprechung zu AVV-Klauseln für eigene Zwecke.
- **[NEU 24.11.]** `vorlagenVon` für Fremdkunden sperren oder Zustimmung nach Baustein F einholen (Entscheidung Ole, siehe `docs/recht/rechtspruefung-2026-11-23.md` F9).
- **[NEU]** EDSA-Leitlinien 07/2020 zu Verantwortlichem und Auftragsverarbeiter (Abschnitt zu eigenen Zwecken des Auftragsverarbeiters) über das Tool suchen.
- Änderung bestehender Verträge: aktive Zustimmung im Konto oder Änderungsmitteilung mit Widerspruchsrecht; Opt-out für Creative-KI ab Tag 1.

## Fundstellen
[LDH] Legal Data Hunter, Lauf 18.11.2026 Abend:
- [Verordnung (EU) 2016/679, Art. 4 Nr. 1, Art. 5 Abs. 1 lit. b, Art. 6 Abs. 4, Art. 28, ErwG 26 und 50](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679)
- [EuGH, Urteil vom 4.9.2025, C-413/23 P, EDSB gegen SRB](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62023CJ0413), Rn. 52, 72 bis 77, 82, 84 bis 86, 100, 108 bis 111
- [§ 203 StGB](https://www.gesetze-im-internet.de/stgb/__203.html)

[LDH] Legal Data Hunter, Lauf 24.11.2026:
- [GeschGehG § 2](https://www.gesetze-im-internet.de/geschgehg/__2.html) (Tooltext nur lit. a), [GeschGehG § 4](https://www.gesetze-im-internet.de/geschgehg/__4.html)
- [BGB § 307](https://www.gesetze-im-internet.de/bgb/__307.html), [BGB §§ 305c, 310](https://www.gesetze-im-internet.de/bgb/)

Ohne Fundstelle (Limit, resets_at 2026-11-25T14:48:00+00:00): UrhG, KUG, EDSA-Leitlinien 07/2020.
