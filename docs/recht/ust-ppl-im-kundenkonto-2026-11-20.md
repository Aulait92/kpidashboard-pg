# Umsatzsteuer: Pay-per-Lead im Werbekonto des Vermittlers (Recht, 20.11.2026)

Interne Recherche des Rechts-Agenten auf Auftrag von Ole, **keine verbindliche Steuerberatung**. Bereitet die Frage an den
Steuerberater (PhDr. Müller Treuhand GmbH) und Oles Entscheidung zum Pilot vor (Stufe A). Grundlage:
`docs/firma/protokolle/2026-11-20-ppl-im-kundenkonto.md`, `docs/recht/ust-leadverkauf-2026-11-19.md`,
`docs/recht/ust-leads-vorsteuer-recherche.md`, AGB „Leistungen: Leadgenerierung“ in `src/lib/legal-texts.ts` (Zeile 120 ff.).
Volltexte (bundesfinanzhof.de, gesetze-bayern.de, haufe.de, otto-schmidt.de, nrwe) sind in dieser Umgebung gesperrt;
Aussagen beruhen auf Suchergebnissen, Fachbeiträgen und Gesetzeskenntnis. „Verifiziert“ heißt: Aktenzeichen, Datum und
Kernaussage in mindestens einer Fachquelle gefunden.

## Ergebnis und Ampel

| Frage | Ampel | Kurzantwort |
|---|---|---|
| 1. Restvergütung je Lead steuerfrei nach § 4 Nr. 11? | **ROT** (Befreiung als Planungsannahme) | Nicht darauf bauen. Im neuen Modell verkaufen wir keinen Lead, sondern betreiben die Kundengewinnung des Vermittlers in dessen Namen, mit dessen Konto, Formular und Einwilligung, als sein Auftragsverarbeiter. Das ist nach BFH V R 50/05, Abschn. 4.11.1 Abs. 2 UStAE („reine Werbung genügt nicht“) und der Aspiro-Linie (ausgelagerte Hilfstätigkeit) eine steuerpflichtige Werbe- und Agenturleistung. Dafür sprechen nur die Vergütung je Lead und der Abschlussbezug der Sparte; das trägt nicht. Mit 19 % planen. |
| 1a. Gestaltung, die die Befreiung stützt | **ROT** | Etiketten (Vertragstitel „Zuführung“, Vergütung „je Interessent“) ändern die Leistung nicht. Was wirklich helfen könnte (Kontakt und Termin durch uns im eigenen Namen, eigene Einwilligung, Übergabe des Interessenten) zerstört die rechtlichen Vorteile des Modells (Vermittler als Verantwortlicher, kein Leadhandel) und ist gewerberechtlich heikel. Formale Umetikettierung bei unverändertem Ablauf: Umqualifizierung, im schlechtesten Fall Missbrauch (EuGH Halifax) und Steuerstrafrisiko bei falscher Sachverhaltsdarstellung. |
| 2. Einheitliche Leistung oder Aufteilung | **GRÜN** (bei Steuerpflicht) | Zwei Leistungen: (a) Kampagnenleistung mit Vergütung je Lead, (b) Software samt WhatsApp-Assistent als Abo. Beide 19 %. Die Abgrenzung wird erst wichtig, wenn jemand (a) befreien will; dann droht über die Paket-Rechtsprechung (EuGH Q-GmbH C-907/19, CPP, Levob) eher Steuerpflicht für alles als Befreiung für alles. |
| 3. Rechenbeispiel | grün (Rechnung) | Für den Kunden kostet es in beiden Varianten 35 € je Lead (Ole: Endpreis brutto). Der Unterschied trifft nur uns: steuerpflichtig 19,41 € (CPL 10) bzw. 9,41 € (CPL 20) netto je Lead, steuerfrei 23,10 € bzw. 11,20 €. |
| 4. Steuerberater | gelb | Fünf Fragen unten. Schwerpunkt: Steuerpflicht schriftlich bestätigen, Bemessungsgrundlage und Rechnungsbild „Leads × 35 € abzüglich Meta“, Wechselwirkung mit dem laufenden Auskunftsverfahren zum klassischen Leadverkauf. |

**Empfehlung (Stufe A, Ole):** Das neue Modell als steuerpflichtige Leistung führen und so in Angebot, AGB und Rechnung
bauen: „Leads × 35 € (Endpreis inkl. Meta-Kosten und USt), abzüglich Ihrer Meta-Kosten; unsere Vergütung enthält 19 % USt“.
Den bisherigen Leadverkauf aus unserem Konto (befreit, gelb) davon strikt getrennt halten. Begründung: Im neuen Modell gibt
es keinen Gegenstand mehr, der einem Vermittler „zugeführt“ wird; er lässt seine eigene Werbung von uns machen. Unsere eigene
Prüfung vom 19.11.2026 hat genau diesen Fall (Kampagnen aus dem Budget des Kunden) schon als steuerpflichtig eingeordnet, und
das bestehende Paket „Leadgenerierung“ wird mit 19 % abgerechnet.
Risiko bei dieser Empfehlung: gering (wir zahlen höchstens zu viel Steuer, rund 3,69 € je Lead bei CPL 10). Kosten: keine
zusätzlichen; Steuerberater im ohnehin geplanten Termin (geschätzt 300 bis 800 € gesamt, CFO-Schätzung).

## 1. Steuerfrei nach § 4 Nr. 11 oder steuerpflichtige Werbeleistung?

### Maßstab

- § 4 Nr. 11 UStG, Art. 135 Abs. 1 Buchst. a MwStSystRL: befreit ist die „Tätigkeit als Versicherungsvertreter und
  Versicherungsmakler“. Unionsrechtlich zwei Prüfsteine (Taksatorringen C-8/01, Arthur Andersen C-472/03, Aspiro C-40/15):
  Beziehung zu Versicherer und Versichertem (mittelbar genügt, J.C.M. Beheer C-124/07, BFH V R 7/08) und eine Tätigkeit,
  die die **wesentlichen Aspekte der Vermittlung** umfasst: Kunden suchen und mit dem Versicherer zusammenbringen.
- BFH V R 9/13: Vermittlung kann in Nachweis, Kontaktherstellung oder Verhandeln bestehen, sie muss sich auf das einzelne
  zu vermittelnde Geschäft beziehen. BFH V R 19/16: Leistungen ohne spezifischen und wesentlichen Bezug zu einzelnen
  Vermittlungsgeschäften sind nicht befreit.
- BFH V R 50/05 („Werbeagent“): Wer nur Kundendaten einholt und nicht an Suche und Zusammenführung mitwirkt, ist
  steuerpflichtig.
- Abschn. 4.11.1 Abs. 2 UStAE (NWB, Stand 06/2026): Online-Dienstleister sind nur befreit, wenn sie über ihr System an der
  Anbahnung beteiligt sind und eine Zuführungsprovision erhalten; **reine Werbung genügt nicht**; die Grenze sei von der
  Rechtsprechung nicht geklärt.
- Aspiro C-40/15: Auch wenn ein Dritter Aufgaben für einen Versicherer übernimmt, ist das nur befreit, wenn die Tätigkeit
  selbst Vermittlung ist. Übertragen auf uns: Dass wir Aufgaben **des Vermittlers** übernehmen, macht uns nicht zum
  Vermittler.
- Bezeichnung und Vergütungsform sind nicht entscheidend (FG München 3 K 134/07: Fixkostenbeteiligung unabhängig vom
  Abschluss schadet nicht; BFH V R 66/05 und FG München 3 K 1932/21: erfolgsabhängige Vergütung ist nur Indiz). Das gilt in
  beide Richtungen: Ein Preis je Lead macht aus Werbung keine Vermittlung.

### Was für die Befreiung spricht

1. **Vergütung je Lead**, also je zugeführtem Interessenten, nicht je Stunde oder Budget. Das ähnelt der
   Zuführungsprovision (V R 7/08) und dem Datensatzpreis (FG Köln 8 K 3212/15).
2. **Abschlussbezug:** spartenbezogene Anzeige und Formular (z. B. Privatschutz), Lead exklusiv für einen Vermittler mit
   § 34d. Die mittelbare Beziehung zum Versicherer läuft über ihn (V R 7/08).
3. **Mitwirkung über unser System:** Der WhatsApp-Assistent schreibt den Interessenten an, qualifiziert und bucht einen
   Termin. FG München 02.07.2025, 3 K 1932/21 (Bankprodukte, § 4 Nr. 8; Revision zugelassen, BFH-Az. nicht gefunden) hat
   ein Online-Verfahren, das Interessenten wiederholt anspricht und zum Partner lenkt, als befreite Vermittlung gesehen,
   auch wenn der Anbieter gegenüber den Interessenten nicht offen als Vermittler auftrat. EuG T-657/24 Versãofast:
   Gesamtheit von Leistungen, die das Zustandekommen ermöglichen, insbesondere Kundensuche, kann genügen.

### Was dagegen spricht (überwiegt)

1. **Es gibt keinen Lead mehr, den wir liefern.** Im bisherigen Modell entsteht der Interessent bei uns und wird dem
   Vermittler übergeben (Nachweis, Kontaktherstellung). Jetzt entsteht er in dessen Werbekonto, in dessen Formular, mit
   Einwilligung für ihn; wir sind Auftragsverarbeiter (Protokoll, Recht). Wir weisen ihm niemanden nach, sondern betreiben
   seine Kundensuche. Das ist der Werbeagent aus V R 50/05 bzw. die ausgelagerte Hilfstätigkeit aus Aspiro.
2. **Unser eigener Vertrag sagt es so.** AGB „Leistungen: Leadgenerierung“: „Der Anbieter erstellt und betreut
   Werbekampagnen … im Werbekonto des Kunden“, „schuldet eine fachgerechte Dienstleistung, keinen bestimmten Erfolg“. Das
   ist die Beschreibung einer Agenturleistung.
3. **Gleiche Leistung, bisher 19 %.** Das Paket „Leadgenerierung“ (Kampagnen im Kundenkonto plus Monatsvergütung) wird mit
   19 % abgerechnet, und unsere Prüfung vom 19.11.2026 (Abschnitt 2, Punkt 3) ordnet Leads aus dem Budget des Kunden über
   unser Kampagnenmanagement als steuerpflichtig ein. Ändert sich nur die Preisformel, sieht das Finanzamt dieselbe Leistung
   mit anderem Preis. Unterschiedliche Steuer für dieselbe Leistung schadet zudem unserer Glaubwürdigkeit im laufenden
   Auskunftsverfahren zum klassischen Leadverkauf.
4. **Die Vergütung ist eine Restgröße des Werbebudgets** (35 € minus Meta). Wirtschaftlich ist das ein Agenturhonorar mit
   Kostendeckel, kein Preis für einen übertragenen Interessenten.
5. **Der Assistent ist Software des Vermittlers.** Er schreibt in dessen Namen, mit dessen Erstinformation, als
   Auftragsverarbeitung, und wird mit der Software separat bezahlt. Steuerlich ist das Tätigkeit des Vermittlers mit
   unserem Werkzeug, nicht unsere Vermittlung (so schon `ust-leadverkauf-2026-11-19.md`, Abschnitt 3). FG München
   3 K 1932/21 hilft deshalb kaum: Dort handelte der Anbieter selbst gegenüber den Interessenten.
6. **Nur wir profitieren.** Der Kunde zahlt 35 € in jedem Fall. Eine Befreiung erhöht allein unsere Marge um 19 %. Das ist
   für eine Prüfung offensichtlich.

**Ergebnis:** Befreiung allenfalls mit Mühe vertretbar, Wahrscheinlichkeit grob 20 bis 35 % (Schätzung, keine
Rechtsprechung zum Fall „Kampagne im Konto des Vermittlers, Vergütung je Lead“). Ampel ROT für die Annahme
„steuerfrei“, GRÜN für „steuerpflichtig behandeln“. § 9 UStG erlaubt für Nr. 11 keinen Verzicht; Steuerpflicht ergibt sich
hier aber ohnehin aus der Leistung.

### Gestaltungen: was hilft, was nicht, wo Missbrauch beginnt

| Gestaltung | Wirkung auf die Befreiung | Bewertung |
|---|---|---|
| Vertragstitel „Zuführung von Interessenten“, Vergütung „je Interessent“ | keine, solange der Ablauf gleich bleibt (Bezeichnung unerheblich) | nicht empfehlen; widerspricht AGB und Rollenverteilung |
| Vergütung nur je vorqualifiziertem Lead oder je vereinbartem Termin | schwaches Indiz (Erfolgsbezug, V R 66/05), mehr nicht | wirtschaftlich prüfbar, steuerlich kein Durchbruch |
| Assistent in die Lead-Vergütung ziehen statt Software | stärkt die „Mitwirkung über unser System“ ein wenig, mischt aber Software in das Paket (Q-GmbH: dann eher alles steuerpflichtig) | nicht empfehlen |
| Kontakt und Terminvereinbarung durch uns **im eigenen Namen**, eigene Einwilligung, danach Übergabe | würde die Befreiung echt stützen (Kontaktherstellung, V R 9/13; FG München 2025) | nicht empfehlen: wir würden Verantwortliche und Leadhändler (Rechtsvorteile des Modells weg, § 7 UWG, Partnerliste), Nähe zu § 34d (BGH I ZR 7/13: Tippgeber nur ohne Beratung), und der Kunde zahlt Meta für unsere Werbung (Leistungsempfänger von Meta unklar) |
| Formular weiter im Namen des Vermittlers, aber im Vertrag „Lieferung von Leads durch den Anbieter“ | keine; widersprüchlicher Sachverhalt | **Missbrauchsgrenze:** Ein künstlicher Vertragsaufbau, dessen wesentlicher Zweck der Steuervorteil ist (EuGH Halifax C-255/02, § 42 AO), wird umqualifiziert. Wer dem Finanzamt den Ablauf anders darstellt, als er ist, riskiert § 370 AO. |

Wer die Befreiung will, nimmt das **klassische PPL aus unserem Konto** (Lead entsteht bei uns, wird übergeben, gelb). Das
neue Modell ist bewusst die andere Leistung.

## 2. Einheitliche Leistung oder Aufteilung

- Maßstab (EuGH Card Protection Plan C-349/96, Levob C-41/04; ATP PensionService C-464/12 überlässt die Würdigung dem
  nationalen Gericht): einheitlich, wenn die Elemente aus Sicht des Durchschnittskunden so eng verbunden sind, dass ihre
  Aufspaltung wirklichkeitsfremd wäre, oder wenn eines nur Nebenleistung ist. Getrennte Preise sind ein Indiz, nicht
  entscheidend (Levob).
- **Software samt Assistent:** eigenständig (gibt es auch ohne Kampagnen, eigener Monatspreis, Ole: „Software zusätzlich“).
  Eigene Leistung, 19 %.
- **Kampagnenleistung:** Erstellung der Anzeigen und Formulare, Steuerung per Partnerzugriff, Optimierung, Abrechnung je
  Lead. Das ist eine einheitliche sonstige Leistung (Werbeleistung), 19 %. Ort: Sitz des Kunden im Inland (§ 3a Abs. 2).
- **Meta-Kosten** sind nicht unser Entgelt: Der Kunde ist Leistungsempfänger von Meta und schuldet selbst die Steuer nach
  § 13b. Bemessungsgrundlage für uns ist nur unsere Restvergütung (Abrechnungsmechanik siehe Steuerberater-Frage 2).
- **Folge für den Steuersatz:** Bei Steuerpflicht ändert die Aufteilung nichts (alles 19 %). Sie hat nur Bedeutung, wenn
  jemand die Kampagnenleistung befreien will; dann gilt: Software und Kampagne strikt getrennt vereinbaren und abrechnen,
  sonst zieht das Paket die Befreiung herunter (Q-GmbH). Das spricht zusätzlich gegen den Versuch.
- Gutschrift bei hohem CPL (Vergütung unter null) nur gegen die Gebühr desselben Monats: Das ist eine Entgeltminderung
  unserer steuerpflichtigen Leistung (§ 17 UStG), keine eigene Leistung. Gegen die Software-Gebühr verrechnet würde sie
  deren Entgelt mindern; dann sauber als Minderung ausweisen.

## 3. Rechenbeispiel je abrechenbarem Lead (Endpreis 35 €)

Annahmen: Meta-CPL netto laut Werbeanzeigenmanager; der Vermittler zahlt darauf 19 % nach § 13b ohne Vorsteuerabzug
(seine Umsätze sind nach § 4 Nr. 11 frei), echte Meta-Kosten also CPL × 1,19. Unsere Bruttovergütung = 35 € minus echte
Meta-Kosten (Ole, Protokoll 20.11.2026). Zeile „90 %“: 100 Leads erzeugt, 90 abrechenbar (wie CFO-Stückrechnung).

| Fall | Meta je abrechenbarem Lead inkl. 13b | Unsere Vergütung brutto | Steuerpflichtig: netto für uns | darin USt | Steuerfrei: für uns | Kunde zahlt gesamt |
|---|---|---|---|---|---|---|
| CPL 10 €, alle abrechenbar | 11,90 € | 23,10 € | **19,41 €** | 3,69 € | 23,10 € | 35,00 € |
| CPL 20 €, alle abrechenbar | 23,80 € | 11,20 € | **9,41 €** | 1,79 € | 11,20 € | 35,00 € |
| CPL 10 €, 90 % abrechenbar | 13,22 € | 21,78 € | **18,30 €** | 3,48 € | 21,78 € | 35,00 € |
| CPL 20 €, 90 % abrechenbar | 26,44 € | 8,56 € | **7,19 €** | 1,37 € | 8,56 € | 35,00 € |

- Für den Kunden kein Unterschied: Er zahlt 35 € je Lead, die Steuer auf unsere Vergütung kann er (wie die 13b-Steuer)
  nicht abziehen. Rechnungsbild: „90 Leads × 35,00 € = 3.150,00 €, abzüglich Ihrer Meta-Kosten 1.190,00 €, unsere
  Vergütung 1.960,00 € inkl. 19 % USt (312,94 €)“ (Beispiel CPL 10 €, 100 Leads erzeugt, 90 abrechenbar).
- Nullpunkt unserer Vergütung: echter CPL 29,41 € (alle abrechenbar) bzw. 26,47 € (90 %).
- Fehler-Risiko der steuerfreien Variante: Stuft das Finanzamt später um, schulden wir 19/119 der Vergütung (3,69 € bzw.
  1,79 € je Lead) zuzüglich Zinsen; nachberechnen können wir beim Endpreis 35 € nicht, ohne das Preisversprechen zu brechen.
  Gegenposten: Vorsteuer auf unsere eigenen Kosten des Modells (Motive, KI, Tools) wird dann abziehbar; klein.
- Vorteil der Steuerpflicht für uns: voller Vorsteuerabzug auf die Kosten dieses Modells; keine Aufteilung nach § 15 Abs. 4
  für diese Kosten nötig.

## 4. Fragen an den Steuerberater

1. **Einordnung:** Bestätigen Sie schriftlich, dass unsere Restvergütung im Modell „Kampagne im Meta-Konto des Vermittlers,
   Formular und Einwilligung für ihn, wir Auftragsverarbeiter, Vergütung je Lead“ eine steuerpflichtige Werbeleistung ist
   und nicht nach § 4 Nr. 11 befreit (V R 50/05, Abschn. 4.11.1 Abs. 2 UStAE gegen V R 7/08, FG München 3 K 1932/21)?
2. **Bemessungsgrundlage und Rechnung:** Ist Entgelt nur „Leads × 35 € minus vom Kunden an Meta gezahlte Kosten inkl. 13b“
   (35 € als Bruttoobergrenze, USt herausgerechnet), und genügt das Rechnungsbild „Leads × 35 € abzüglich Meta, Vergütung
   inkl. 19 % USt“ den Pflichtangaben nach § 14 Abs. 4, ohne dass die 35 € als unser Entgelt gelten? Wie sind
   Mindestgebühr, Monatsminimum und Gutschriften bei hohem CPL (§ 17) zu buchen?
3. **Wechselwirkung mit dem Auskunftsverfahren** (FA für Körperschaften III, Az. 29/461/33668): Schwächt ein steuerpflichtiges
   Kundenkonto-Modell neben dem befreiten Leadverkauf aus unserem Konto die Befreiung des Letzteren, oder stützt die klare
   Abgrenzung (wer ist Kontoinhaber, Verantwortlicher, Werbender) sie? Sollen wir das neue Modell im Antrag offenlegen?
4. **Trennung Software und Kampagne:** Tragen getrennte Vereinbarung und Rechnung (Software-Abo inkl. Assistent, Kampagne je
   Lead) zwei Leistungen, auch wenn der Kunde beides zusammen bucht?
5. **Vorsteuer:** Kosten dieses Modells (Motive, KI-Dienste, Tools) voll abziehbar; Gemeinkosten weiter nach dem
   Schlüssel aus `ust-leads-vorsteuer-recherche.md` zwischen befreitem Leadverkauf und steuerpflichtigen Leistungen
   aufteilen. Einverstanden?

## Umsetzung (nach Freigabe Ole, Stufe A)

- Angebot und AGB-Zusatz für den Pilot: Vergütung inkl. 19 % USt, Meta zahlt der Kunde direkt; nicht auf den Absatz
  „Umsatzsteuer auf Leads“ (§ 4 Nr. 11) verweisen, der gilt nur für den Leadverkauf aus unserem Konto. Kundensichtbarer
  Text vorher durch Conversion-Texter/UX (AGENTS.md), danach Pflichtangaben prüfen; kein „Garantie“.
- App: eigenes Steuerkennzeichen „Kampagne Kundenkonto, 19 %“; keine Vermischung mit `effektiveSteuer` der PPL-Pools.

## Quellen

- Abschn. 4.11.1 UStAE, „reine Werbung genügt nicht“, Grenze ungeklärt: [NWB Stand 06/2026](https://datenbank.nwb.de/Dokument/Anzeigen/848793/), [Haufe Stand 31.12.2023](https://www.haufe.de/id/norm/umsatzsteuer-anwendungserlass-stand-zum-31122023-4111-bausparkassenvertreter-versicherungsvertreter-versicherungsmakler-HI16172612_p4.11.1.html); Abschn. 4.8.1 UStAE: [Haufe](https://www.haufe.de/id/norm/umsatzsteuer-anwendungserlass-481-vermittlungsleistungen-im-sinne-des-4-nr-8-und-11-ustg-HI7554985_p4.8.1.html)
- BFH 28.05.2009, V R 7/08 (Zuführungsprovision befreit): [IWW](https://www.iww.de/wvm/archiv/untervermittlung-zufuehrungsprovision-ist-umsatzsteuerfrei-f14519), [Betriebs-Berater](https://betriebs-berater.ruw.de/steuerrecht/urteile/Steuerbefreiung-fuer-Versicherungsvertreter-als-Untervermittler-18064), [lexetius](https://lexetius.com/2009,2175)
- BFH 06.09.2007, V R 50/05 (Werbeagent): [IWW](https://www.iww.de/wvv/archiv/taetigkeit-als-werbeagent-reines-einholen-von-kundendaten-verguetung-ist-umsatzsteuerpflichtig-f7037)
- BFH 24.07.2014, V R 9/13 (Nachweis, Kontakt, Verhandeln; Bezug zum Einzelgeschäft): [anwalt24](https://www.anwalt24.de/urteile/bfh/2014-07-24/v-r-9_13), [IWW](https://www.iww.de/wvv/steuergestaltung/umsatzsteuer-umsatzsteuerfreiheit-auch-ohne-direkten-kontakt-zum-versicherer-und-zum-endkunden-f91927)
- BFH 03.08.2017, V R 19/16 (Strukturvertrieb nicht befreit): [experten.de (PDF)](https://www.experten.de/id/4944841/aufbau-eines-strukturvertriebs-ist-nicht-umsatzsteuerfrei/index.pdf)
- Untervermittler und Tippgeber, Literatur: [IWW Untervermittler](https://www.iww.de/vvp/steuergestaltung/umsatzsteuer-das-sind-die-umsatzsteuerlichen-spielregeln-beim-einsatz-von-untervermittlern-f152117), [IWW Tippgeber](https://www.iww.de/wvv/steuergestaltung/tippgeberumsatzsteuer-welche-tippgeber-sind-umsatzsteuerbefreit-welche-umsatzsteuerpflichtig-f116768)
- FG München 02.07.2025, 3 K 1932/21 (verdeckte Online-Vermittlung, Bankprodukte; Erfolgsvergütung nur Indiz; Revision zugelassen, Az. nicht gefunden): [otto-schmidt](https://www.otto-schmidt.de/news/steuerrecht/umsatzsteuerfreie-vermittlung-von-bankgeschaften-bei-verdecktem-vorgehen-eines-online-vermittlers-2025-10-09.html), [Haufe](https://www.haufe.de/id/entscheidungen/fg-muenchen-urteil-vom-02072025-3-k-193221-veroeffentlicht-am-10082025-HI16908113.html), [Deubner](https://www.deubner-steuern.de/produkte/umsatzsteuer-praxis/doc/steuerfreiheit-von-vermittlungsleistungen-bei-verdecktem-vorgehen-eines-online-vermittlers-1234905), [NWB (EFG 2025, 1480)](https://datenbank.nwb.de/Dokument/1075967/), [gesetze-bayern](https://www.gesetze-bayern.de/Content/Document/Y-300-Z-BECKRS-B-2025-N-20148) (Volltext hier nicht abrufbar)
- FG München 3 K 134/07, FG Köln 8 K 3212/15, EuG T-657/24 Versãofast, EuGH J.C.M. Beheer C-124/07, Q-GmbH C-907/19, BGH I ZR 7/13: Nachweise in `docs/recht/ust-leadverkauf-2026-11-19.md` und `docs/recht/ust-leads-vorsteuer-recherche.md`
- EuGH 17.03.2016, C-40/15 Aspiro (ausgelagerte Tätigkeit nicht befreit): [taxlive](https://www.taxlive.nl/nl/documenten/nieuws/aspiro-no-vat-exemption-for-outsourced-claim-handling-court-of-justice/), [dejure](https://dejure.org/dienste/vernetzung/rechtsprechung?Text=C-40%2F15)
- EuGH 13.03.2014, C-464/12 ATP PensionService (einheitliche Leistung, Würdigung durch nationales Gericht): [BAILII](https://mansfield.bailii.org/eu/cases/EUECJ/2014/C46412.html), [vatupdate](https://www.vatupdate.com/2022/05/17/flashback-on-ecj-cases-c-464-12-atp-pensionservice-asset-management-still-exempt-from-vat-for-certain-pension-funds)
- EuGH Card Protection Plan C-349/96, Levob C-41/04, Halifax C-255/02: aus Kenntnis, hier nicht abgerufen
- § 3a Abs. 2, § 4 Nr. 11, § 9, § 13b, § 14 Abs. 4, § 15, § 17 UStG; § 42, § 370 AO: Gesetzeskenntnis, Primärtext hier nicht abrufbar
