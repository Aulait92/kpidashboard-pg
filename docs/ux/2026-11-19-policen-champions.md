# Policen auslesen: Umbauplan „Champions League“ (19.11.2026)

Rolle: CPO. Auftrag von Ole: „lasse ein viertes team das policen-auslesen optimieren“.
Grundlage: Berichte Sales, UX (SUS-Ist 68), Recht, Personas vom 19.11.2026; Code im Worktree `policen-champions`
(Stand Commit 0339610). Keine Live-Zahlen: Diagnose-Abruf war in dieser Nacht nicht freigegeben. Zahlen unten sind
Annahmen mit Spanne und werden über die Diagnose (`policen-flow`, `policen-auslesen`, `vertrieb-termine`) nachgezogen.

## Entscheidung zuerst

Empfehlung: Wir bauen heute Nacht **drei Pakete** (Logik richtig und als Gesprächsaufhänger, Vertragsseite mit einer
Hauptaktion, Spickzettel in der Terminvorbereitung) plus **ein kleines viertes** (Lead-Texte ohne Ersparnisversprechen).
Begründung: Der Umsatz entsteht im Termin, und heute steht das Wertvollste (Kündigungsfenster, doppelte Verträge) ganz
unten und teils mit falschem Datum; zugleich zeigt der Code heute „BU zweimal vorhanden“ (K8 rot), das muss vor allem
anderen weg. Risiko: Werte werden ungeprüft genutzt, darum bleibt K6 sichtbar; Fristdatum wird konservativ (eher früher)
berechnet. Kosten: nur Entwicklungszeit. Stufe B (Einwilligungs- und Formularwortlaut bleibt unverändert, sonst A;
Einschalten für alle Kunden ist Livegang einer großen Funktion: Stufe A, Ole).

SUS: Ist 68 (Spanne 62 bis 74). Ziel nach Paket 1 bis 3: 88 bis 92. 90+ halten wir nur, wenn der Spickzettel wirklich
oben steht, die Vertragsseite genau eine Hauptaktion hat und kein leerer Zustand ohne Handlung bleibt. Ehrlich: Ohne
Live-Durchklick am Handy (Speicher) ist das eine Schätzung; jedes Paket misst nach.

## Zielbild

> App öffnen, sehen, wen ich heute ansprechen soll und warum (mit Euro), ein Tipp, fertig.

- **Vermittler, im Auto vor dem Termin (390 px):** In der Terminvorbereitung steht oben in „Das will der Kunde“ eine
  Karte mit drei Zeilen: Beiträge im Monat und Jahr, die 1 bis 3 wichtigsten Fragen für den Termin (mit Euro laut
  Unterlage, Kündigungsfrist mit „noch X Tage“). Ein Tipp öffnet die Vertragsseite. Lesezeit unter 30 Sekunden.
- **Vermittler, nach dem Termin:** Ein Knopf „Alle als geprüft markieren“, danach ein Knopf „4 Verträge in Bestand
  übernehmen“ (nur wenn das Bestandsmodul sichtbar ist).
- **Lead, per WhatsApp:** Ein konkreter Nutzen in einem Satz (doppelt, Kündigungstermin, was fehlt), „ein Foto der
  ersten Seite reicht“, keine Ersparnisversprechen.
- **Software:** Liest nur, was im Dokument steht, rät nie die Sparte, bewertet nie, gibt nie Hinweise zu PKV, BU, Leben.

## Hauptablauf (der eine starke Weg)

1. Lead bekommt die Bitte (unverändert im Ablauf; nur Texte, Paket 4) und schickt ein Foto.
2. Sparte erkannt (Dateiname, Begleittext, PDF-Textebene, erweiterte Stichworte) oder offen.
   Offen: Vermittler sieht im Spickzettel „1 Unterlage wartet auf Ihre Sparten-Wahl“ und wählt mit **einem Tipp** einen
   Chip; danach wird ausgelesen (vorhandene `sparteAction`, K2 grün).
3. Auslesen, danach **Plausibilitätsregeln** (neu, rein): unplausible Felder auf „bitte prüfen“.
4. Zusammenfassung erzeugt **Fragen für den Termin** aus festen Vorlagen (nur Sach), sortiert:
   Kündigungsfrist (nach Tagen, dann Beitrag), doppelt (nach Beitrag), Bausteine „nein“, „Nicht geschickt“.
5. Terminvorbereitung: Spickzettel oben. Vertragsseite: Fragen oben mit Sprung zur Karte, Karten kompakt.
6. Nach dem Termin: Sammelprüfung, Sammelübernahme (nur Geprüftes, nur mit Tipp, K7).

## Seitenstruktur

### A. Terminvorbereitung `/buyer/termine/[id]/vorbereitung` (Karte „Das will der Kunde“)

Reihenfolge in der Karte, oben nach unten:
1. **Spickzettel „Verträge des Kunden“** (ersetzt die kleine Zeile unten, `policen-vergleich-kurz.tsx`):
   - Kopf: „107,40 € im Monat“, klein darunter „1.289 € im Jahr · 4 Verträge · 1 bitte prüfen“.
   - Bis zu 3 Fragen als Klartext (dieselben Vorlagen wie auf der Vertragsseite).
   - Badge „Maschinell ausgelesen, bitte prüfen“ (K6 auf der Kurzkarte).
   - Ganze Karte ist ein Link zur Vertragsseite (eine Handlung).
   - Zustände: siehe Tabelle unten.
2. Was der Kunde gesagt hat (bestehende Inhalte).
3. „Bestehende Verträge aus dem Chat“: Einträge einer Sparte, die ausgelesen vorliegt, werden ausgeblendet
   (ausgelesene ersetzen Chat-Angaben, kein doppeltes Konzept).
4. Dateiliste (`unterlagen-vom-kunden.tsx`) eingeklappt unter „Unterlagen (3)“. Der gelbe Zwei-Faktor-Kasten entfällt
   hier; die Sperre wird direkt am Link „Original“ erklärt („Zum Öffnen Zwei-Faktor einrichten“, Link zu Einstellungen).

Zustände des Spickzettels (jeder mit nächster Handlung):

| Zustand | Text | Handlung |
|---|---|---|
| Nie gebeten | „Noch keine Policen. Ihr Assistent bittet vor dem Termin darum.“ | keine (automatisch) |
| Gebeten, keine Antwort | „Um Policen gebeten am 17.11., noch keine Antwort.“ | „Sonst im Termin nach den Policen fragen.“ (Knopf „Erinnern“ erst in der nächsten Runde, Hebel 9) |
| Sparte offen | „1 Unterlage wartet auf Ihre Sparten-Wahl“ | Chips direkt in der Karte |
| Wird ausgelesen | „Wird ausgelesen …“ | keine |
| Ohne KI | „Nicht ausgelesen auf Wunsch des Kunden.“ | Link „Unterlagen ansehen“ (öffnet die Dateiliste, keine leere Seite) |
| Gesperrt (PKV/BU/Leben ohne Freigabe) | „Wird nicht automatisch ausgelesen.“ | Link „Im Original ansehen“ |
| Fertig | Kopf plus Fragen | Tipp öffnet Vertragsseite |

### B. Vertragsseite `/buyer/termine/[id]/vorbereitung/vertraege` (bisher „Vergleichsblatt“)

- Titel: „Verträge: {Name}“, **kein Untertitel**. Das Wort „Vergleichsblatt“ verschwindet aus der Oberfläche
  (es vergleicht nichts); Routen und Dateinamen bleiben.
- **Kopf:** Monatssumme groß, Jahressumme, Anzahl, „x bitte prüfen“. Ein Satz K6: „Maschinell ausgelesen: bitte vor dem
  Termin mit dem Original prüfen.“ (ersetzt Fußzeile; Badge je Karte bleibt kurz „bitte prüfen“ / „geprüft“).
- **Fragen für den Termin:** 3 sichtbar, Rest unter „Mehr (n)“. Jede Frage springt per Anker zur Karte, die Karte trägt
  dieselbe Markierung. Kein eigener Block „Kündbar in den nächsten 3 Monaten“ mehr: Kündigungen sind die obersten Fragen.
- **Sparte offen:** Bereich „Welche Sparte ist das?“ mit Chips, wahrscheinlichste zuerst; PKV/BU/Leben-Chip bleibt
  sichtbar, führt ohne Freigabe zu „Wird nicht automatisch ausgelesen“ (nicht als „freischalten“ beworben).
- **Karten**, sortiert: mit Frage zuerst, dann „bitte prüfen“, dann Rest. Kopfzeile: Sparte · Versicherer ·
  Monatsbeitrag · Status. Sichtbar nur Gesprächsfelder (Laufzeit bzw. kündbar bis, Deckungs- bzw. Versicherungssumme,
  Bausteine mit „nein“, SF-Klassen) und **immer alle unsicheren Felder**. Rest (Tarif, Vers.-Nr. vollständig, SB,
  Wohnfläche, Fahrleistung, Wert 1914, Werkstattbindung) unter „Alle Angaben“. Am Handy Beschriftung über dem Wert
  (keine Silbentrennung wie „Elementarschä-den“). Je Karte nur „Bearbeiten“ (klein) und „Original“.
- **Eine Hauptaktion, unten fest am Handy:**
  - solange ungeprüfte Verträge: „Alle als geprüft markieren (n)“ (setzt `geprueftAt` nur für die angezeigten,
    ausgelesenen Verträge; der Vermittler hat sie gesehen).
  - danach, nur wenn `loadBestandVisible`: „n Verträge in Bestand übernehmen“. Sonst „Alle geprüft“ als Status, kein Knopf.
- „Werte stimmen“ je Karte entfällt.

### C. Lead-Seite `/datenschutz/policen` und Formular

Unverändert (Pflichtangaben, Stufe A bei Änderung). Kurzfassung oben auf der Datenschutzseite: nächste Runde.

## Texte

Vermittler (Sie-Form):
- Kopf: „107,40 € im Monat“ / „1.289 € im Jahr · 4 Verträge · 1 bitte prüfen“.
- Kündigung, mit Frist im Dokument: „Kfz (HUK), 612 € im Jahr laut Unterlage: Kündigung bis 30.11., noch 11 Tage.“
- Kündigung, ohne Frist im Dokument: „Kfz (HUK), Ablauf 01.01.2027: Kündigungsfrist im Original prüfen.“
- Kfz ohne Ablauf: „Kfz (HUK): Hauptfälligkeit im Original prüfen.“
- Verpasste Frist: „Hausrat (R+V): Frist 31.10. verpasst, nächste Kündigung bis 31.10.2027.“
- Ablauf in der Vergangenheit: „verlängert sich jährlich, nächster Ablauf 01.09.2027“ (in der Karte).
- Doppelt (beide Beiträge bekannt): „Haftpflicht zweimal (HUK und ERGO, zusammen 13 € im Monat laut Unterlagen): Werden
  beide noch gebraucht?“ Ohne beide Beiträge: ohne Euro.
- Baustein: „Hausrat ohne Elementarschäden laut Unterlage: Ist das so gewollt?“;
  „Haftpflicht ohne Forderungsausfall laut Unterlage: Ist das bewusst so gewählt?“
- Nicht geschickt: „Nicht geschickt: Hausrat, Rechtsschutz. Fragen Sie: Wo sind Sie dafür versichert?“
- K6: „Maschinell ausgelesen: bitte vor dem Termin mit dem Original prüfen.“
- Verboten in allen Texten: „zu teuer“, „unterversichert“, „sollte“, „empfehlen“, „lohnt sich“, „sparen“, „Lücke“,
  „fehlt“, „Garantie“, „Umsatzpotenzial“, Ersparnisbeträge, Rankings.

Lead (beide Ansprachen über `a(an, du, sie)`, keine Gedankenstriche), nur `src/lib/policen/flow/texte.ts`:
- Chat-Nachricht Sie: „Schicken Sie {Name} vorab Ihre Policen. Dann sieht {er} schon vor dem Termin, *wo Sie doppelt
  zahlen, wann Sie kündigen können und was fehlt.* So wird der Termin kürzer und konkreter.“
  Du: „Schick {Name} vorab deine Policen. Dann sieht {er} schon vor dem Termin, *wo du doppelt zahlst, wann du kündigen
  kannst und was fehlt.* So wird der Termin kürzer und konkreter.“ Ohne Pronomen: „Dann ist schon vor dem Termin klar, …“.
  Zeile darunter bleibt („*Meist reicht ein Foto der ersten Seite.* Dauert etwa eine Minute.“), Fußzeile bleibt.
- Bestätigung: „{Name} sieht sie sich vor {Tag} an. Bis dahin müssen Sie nichts weiter tun.“ / „… musst du nichts weiter
  tun.“ Dann „Noch eine Police, etwa Kfz oder Hausrat? Einfach nachsenden.“ Ohne KI: „Alles klar, wir lesen nichts
  automatisch aus.“ steht direkt nach dem Dank, vor dem Ansehen-Satz. Widerrufs-Fußzeile und `BESTAETIGUNG_RE` bleiben.
- Erinnerung 1 Sie: „Kurze Frage zu Ihrem Termin am {Tag}: Haben Sie Ihre Policen gerade zur Hand? Ein Foto der ersten
  Seite reicht. Dann sieht {Name} vorab, wann Sie kündigen können und wo Sie doppelt zahlen.“ Du analog. Fußzeile
  „Nein, danke“/STOP wörtlich unverändert.
- Erinnerung 2 Sie: „Morgen um {Uhrzeit} ist Ihr {Art}. Noch schnell ein Foto Ihrer Policen? Dann kann {Name} gezielt
  vorbereiten. Sonst zeigen Sie sie einfach im Termin.“ Du analog.
- Formular (punkt1 bis 4, Häkchen, Hinweis, Knopf, Intro) und `bitte.ts` (Branch `policen-bitte-sparten`): **nicht
  ändern**. Hinweis an jenes Team: „der Termin geht deutlich schneller“ durch „der Termin wird kürzer“ ersetzen,
  „Ein Foto der ersten Seite reicht meist“ ergänzen.

## Kennzahlen (Quelle später: Diagnose; Stand heute keine Werte)

| Kennzahl | Definition | Annahme heute | Ziel |
|---|---|---|---|
| Policen-Quote | Leads mit mind. 1 Unterlage vor Termin / Leads mit Bitte | 15 bis 30 % | 30 bis 40 % |
| Fertigquote | Termine mit mind. 1 Auszug „ausgelesen“ vor Termin / Termine mit Unterlagen; Gründe offen: sparte_offen, ohne_ki, gesperrt, limit, fehler | 40 bis 60 % (Fotos hängen) | über 80 % |
| Verträge je Lead mit Unterlagen | Durchschnitt | 1,3 bis 1,8 | 2 oder mehr |
| Nutzung | Vertragsseite oder Spickzettel vor Termin geöffnet / fertige Blätter | unbekannt | über 70 % |
| Prüf- und Übernahmequote | geprüft / ausgelesen; übernommen / geprüft | unbekannt | über 60 % |
| Opt-out-Rate | „Nein, danke“ plus STOP / gesendete Erinnerungen | unbekannt | unter 10 % |
| Haupt-KPI | Abschlüsse je Vermittler und Monat, eigene Quote mit/ohne Unterlagen nur für den Vermittler selbst und erst nach Datenschutz-Abstimmung (Hebel 10) | | |

Kundenübergreifende Auswertung (Präsentationsquote für Demos) ist **rot** (AVV § 9), wird nicht gebaut.

## Was wegfällt oder zurückgestellt wird

Weg (Oberfläche):
- „Werte stimmen“ je Karte (12 gleichwertige Knöpfe) → eine Hauptaktion unten.
- Untertitel der Vertragsseite, doppelter Prüfsatz (Fußzeile plus langes Badge) → ein Satz oben, kurzes Badge.
- Block „Kündbar in den nächsten 3 Monaten“ mit „Keine“ → Kündigungen sind Fragen; leer heißt nichts anzeigen.
- Kleine Zeile „Vergleichsblatt · 7 Hinweise“ unten in der Karte → Spickzettel oben.
- Sackgassen-Seite „ohne KI“ → Link direkt zu den Unterlagen.
- Gelber Zwei-Faktor-Kasten über der Dateiliste → Erklärung am Original-Link.
- Seltene Felder sichtbar auf jeder Karte → „Alle Angaben“ (nicht gelöscht, Vers.-Nr. vollständig dort für Nacharbeit).
- Begriff „Vergleichsblatt“ in der Oberfläche.

Zurückgestellt (nicht heute Nacht, Begründung):
- Hebel 3 Bitte früher in der Strecke: `termin-strecke.ts` wird parallel im Branch `tkv-umfang` geändert; mit CTO abstimmen.
- Hebel 5 Push „Unterlagen eingegangen“ und Kennzeichen in der Terminliste: Terminliste gehört dem Team Termine; Push
  nur neutral mit Anzahl (A7). Nächste Runde, hoher Wert für Allianz-Vertreter (Push ist ihr einziger Kanal).
- Hebel 9 Knopf „Kunden erinnern“: gelb (A8, UWG, Pay-per-Lead-Sperre, gemeinsamer Zähler mit dem Cron). Nächste Runde.
- Hebel 10 Wirkungsnachweis: erst Datenschutz.
- Option „eigene Gesellschaft“ (Allianz-Vertreter: Doppelt-Hinweis nur bei Wettbewerb): nächste Runde, Kundeneinstellung.
- Export ins Maklerverwaltungsprogramm, Vollmachtsanfrage: eigener Zweck, Stufe A wegen Rechtstext.

## Rechtliche Auflagen (verbindlich für alle Pakete)

- K1 bis K8 bleiben unverändert wirksam (`docs/recht/policen-whatsapp-gesundheitsdaten.md`). Keine Änderung an
  `kiEinwilligung`, `textVersionKi`, Anbieter, Schema-Strenge, Gesundheitsfilter, Löschfrist.
- **K8-Fund beheben (zuerst):** `doppelt` nur für Haftpflicht, Hausrat, Rechtsschutz. Kfz und Wohngebäude nie als
  doppelt (es gibt kein Kennzeichen- bzw. Risikoanschrift-Feld; zwei Autos sind normal). Nie PKV, BU, Leben.
- Kündigungsfragen nur Sach (Haftpflicht, Hausrat, Wohngebäude, Rechtsschutz, Kfz). PKV/BU/Leben-Termine stehen nur als
  Feld in der Karte.
- Fristdatum konservativ: „bis“ = (Kündigungstermin minus Frist in Monaten) minus 1 Tag. Lieber einen Tag zu früh als zu
  spät. Countdown nur mit Frist aus dem Dokument, Tagesgrenze Europe/Berlin; ohne Frist kein Countdown, keine
  Standardfrist annehmen.
- Euro nur als Beitrag laut Unterlage („laut Unterlage“), nie Ersparnis, nie Vergleichspreis.
- Fragen nur aus festen Vorlagen im Code, keine KI-Formulierung, kein neuer KI-Aufruf.
- „Nicht geschickt“ nur Haftpflicht, Hausrat, Rechtsschutz; Abgleich gegen **alle** Unterlagen mit bekannter Sparte
  (auch nicht ausgelesene); ausgeblendet bei „ohne KI“ oder ohne einen einzigen Auszug.
- Sammelprüfung nur auf ausdrücklichen Tipp; Sammelübernahme nur Auszüge mit `geprueftAt` (keine stille
  Prüfungsfiktion `geprueftAt ?? new Date()` im Sammelweg), nur mit `loadBestandVisible`, nie automatisch (K7).
- Lead-Texte: keine Wörter „sparen“, „günstiger“, „zu teuer“, „Garantie“, „deutlich schneller“. Abmeldehinweise
  wörtlich. Neue Vorlagentexte brauchen neue Meta-Freigabe (Vorlagenname mit Hash).
- Vor dem Bauen von Paket 4: Texte vom Hilfsagenten als Conversion-Texter prüfen lassen (AGENTS.md, Rechtliches mit
  Conversion-Blick); danach gegen die Pflichtangaben-Liste des Rechtsberichts prüfen.
- Nach Abnahme: Abschnitt „Umbau Vergleichsblatt 19.11.“ in `docs/recht/policen-whatsapp-gesundheitsdaten.md`.

## Was beim Einschalten für alle Kunden nötig wäre (Stufe A, Ole)

1. Ole-Freigabe für den Livegang (große Funktion) nach Pilot; Pilotkennzahlen Policen-Quote, Fertigquote, Opt-out.
2. Neue WhatsApp-Vorlagen (Chat-Nachricht, Erinnerung 1 und 2) bei Meta eingereicht und freigegeben, Kategorie UTILITY.
3. `POLICEN_FLOW_KUNDEN` (Ole testet) ausgewertet und auf alle erweitert; Merge mit `policen-bitte-sparten` und `tkv-umfang`.
4. Bestand-Team: `ExistingContract.renewalDate` soll die Frist („bis“) tragen oder ein eigenes Feld bekommen;
   bis dahin geben wir die Frist als Notiz mit. Werbeeinwilligung für Bestandskampagnen an Kunden (§ 7 UWG) dort.
5. Erklärvideos: `python3 tools/erklaervideos/betroffen.py` auf den Branch; betroffene Videos neu aufnehmen, außerhalb
   8 bis 20 Uhr deployen.
6. Neuigkeit (eine Migration `…_neuigkeit_policen_vertraege`, `kind` verbessert, `audience` software, `pushedAt` NULL) und
   Eintrag in `docs/webseite-offen.md` (Du-Form, „demnächst“ wo Pilot) gesammelt durch die Abnahme. Textvorschlag
   Neuigkeit: „Die Verträge Ihres Kunden sehen Sie jetzt oben in der **Terminvorbereitung**: Beiträge im Monat und Jahr,
   Kündigungsfristen mit verbleibenden Tagen und passende Fragen für den Termin. Alle geprüften Verträge übernehmen Sie
   mit einem Tipp.“
7. Datenschutzhinweise: keine neue Fassung nötig (Zweck „Vertragsdaten vergleichen und im Termin beraten“ bleibt).

## Umsetzung in Paketen (nacheinander, je ein Agent, Reihenfolge nach Wirkung)

### Paket 1: Richtige Fristen und Fragen für den Termin (Logik, rein, mit Tests)

Ziel: Jede Zahl auf dem Blatt stimmt und ist als Gesprächsaufhänger formuliert; K8-Fund behoben; weniger Fotos hängen.

Änderungen:
- `src/lib/policen/auslesen/zusammenfassung.ts`: Frist minus 1 Tag; `Kuendigung` um `jahresbetrag`, `tageBis`,
  `verpasst` (letzte verpasste Frist plus nächste) erweitern; Kündigungen nur Sach; `doppelt` nur Haftpflicht, Hausrat,
  Rechtsschutz, mit Versicherern, IDs und Summe (nur wenn alle Beiträge bekannt); neue Liste `fragen` (Typ, Text, IDs,
  Sortierschlüssel) aus festen Vorlagen; `nichtGeschickt` gegen übergebene Sparten aller Unterlagen; `jahrSumme`.
- neu `src/lib/policen/auslesen/plausibel.ts`: nach `bereinige()` Felder auf `pruefen` setzen bei Ablauf vor Beginn,
  Kündigungsfrist über 12, Monatsbeitrag Sach über 500 €, Deckungssumme unter 1 Mio., Versicherungssumme unter 1.000 €;
  Aufruf in `server.ts` nach `bereinige` (eine Zeile, keine Änderung an Gates).
- `src/lib/policen/auslesen/sparte.ts`: Stichworte PHV, „Haftpflicht“ allein, Autoversicherung, „Kfz“ allein,
  Glas (→ Hausrat/Wohngebäude nur wenn eindeutig, sonst offen), Begleittext der WhatsApp-Nachricht, falls schon als
  `text` übergeben. Nie PKV/BU/Leben aus schwachen Stichworten.
- Tests: `tests/unit/policen-auslesen.test.ts` bzw. neue `tests/unit/policen-zusammenfassung.test.ts`.

Abnahme:
- Ablauf 01.01.2027, Frist 1 Monat → bis 30.11.2026; Ablauf 01.03.2027 → 31.01.2027; Test grün.
- Zwei BU, zwei PKV, zwei Kfz, zwei Wohngebäude erzeugen keine Doppelt-Frage; zwei Haftpflicht mit Beiträgen erzeugen
  die Frage mit beiden Versicherern und Summe.
- Keine Frage und keine Kündigung zu PKV/BU/Leben; Wortliste verbotener Begriffe als Test über alle Vorlagen.
- Plausibilitätsregeln je Regel ein Test; ohne Frist kein `tageBis`.
- `npx vitest run tests/unit` und `npx eslint src tests --quiet` grün; keine Schemaänderung, kein KI-Aufruf.

### Paket 2: Vertragsseite mit einer Hauptaktion

Ziel: Vermittler sieht oben die Fragen, springt zur Karte, prüft und übernimmt mit je einem Tipp; SUS-Schätzung 90+.

Änderungen:
- `src/components/policen-vergleichsblatt.tsx`: Kopf mit Monat/Jahr, ein K6-Satz, „Fragen für den Termin“ (3 plus
  „Mehr“) mit Ankern, Karten kompakt und sortiert, „Alle Angaben“ aufklappbar, Beschriftung über Wert am Handy,
  Sparten-Chips im Offen-Bereich, Original-Link mit 2FA-Erklärung, Markierung der Karte mit Frage.
- `src/app/buyer/termine/[id]/vorbereitung/vertraege/page.tsx`: Titel „Verträge: {Name}“, kein Untertitel, leere
  Zustände laut Tabelle, sticky Hauptaktion unten am Handy.
- `.../vertraege/actions.ts`: `alleGeprueftAction` (nur angezeigte, ausgelesene Auszüge des Termins, Audit),
  `alleUebernehmenAction` (nur mit `geprueftAt`, nur mit `loadBestandVisible`, ruft vorhandenes `uebernimmInBestand` je
  Auszug; Frist „bis“ als Notiz „Kündigung bis TT.MM.JJJJ laut Unterlage, bitte prüfen“, falls die Funktion eine Notiz
  annimmt, sonst als Berührungspunkt melden). „Werte stimmen“ je Karte entfernen.
- Keine Änderungen in `src/lib/bestand`, `src/lib/vertraege.ts`.

Abnahme:
- Screenshots 390 und 1280 px vorher/nachher für Termin 3, 4, 2 und 6 (Testdaten `tools/policen/testdaten.ts`),
  statisch gerendert falls kein Speicher; Seite Termin 3 bei 390 px höchstens halb so hoch wie vorher (3.724 px).
- Genau ein primärer Knopf je Zustand; kein Knopf „In Bestand übernehmen“ ohne Bestandsmodul.
- Sammelübernahme übernimmt keine ungeprüften Auszüge (Test oder Code-Nachweis).
- K6: „bitte prüfen“ an jedem ungeprüften Feld und Satz oben sichtbar.
- SUS-Schätzung mit den 10 Fragen und Liste behobener Punkte in der Rückgabe; `betroffen.py` ausgeführt.

### Paket 3: Spickzettel oben in der Terminvorbereitung

Ziel: In der Terminvorbereitung in 30 Sekunden sehen, wo Geld liegt, ohne Scrollen; kein leerer Zustand ohne Handlung.

Änderungen:
- `src/components/policen-vergleich-kurz.tsx`: Spickzettel mit Kopf, bis zu 3 Fragen, K6-Badge, Zuständen (nie
  gebeten, gebeten am, Sparte offen mit Chips, wird ausgelesen, ohne KI, gesperrt, fertig).
- `src/app/buyer/termine/[id]/vorbereitung/neu-seite.tsx`: Spickzettel an den Anfang von „Das will der Kunde“; Chat-
  Verträge mit ausgelesener Sparte ausblenden; Dateiliste eingeklappt; gelber 2FA-Kasten nur noch am Original-Link.
- `src/components/unterlagen-vom-kunden.tsx`: eingeklappt „Unterlagen (n)“, Original-Link mit 2FA-Erklärung.
- Datum „gebeten am“ aus vorhandenen Flow-/Bitte-Daten lesen (keine neue Spalte).

Abnahme:
- 390 px: Spickzettel ohne Scrollen sichtbar (oberhalb der ersten Bildschirmhöhe nach dem Seitenkopf) für Termin 3.
- Jeder der 7 Zustände mit Testdaten-Termin 1 bis 6 gerendert und als Screenshot abgelegt.
- Texte identisch zur Vertragsseite (gleiche Vorlagen, eine Quelle).
- `npx tsc --noEmit` einmal am Ende, eslint und vitest grün.

### Paket 4: Lead-Texte ohne Ersparnisversprechen (klein)

Ziel: Mehr Rücklauf durch konkreten Nutzen, kein Versprechen, das der Termin nicht hält (§ 5 UWG, K8).

Änderungen:
- Zuerst Hilfsagent als Conversion-Texter auf die Texte oben (AGENTS.md), dann Pflichtangaben-Abgleich.
- `src/lib/policen/flow/texte.ts`: Chat-Nachricht, Bestätigung (mit und ohne KI), Erinnerung 1 und 2 in beiden
  Ansprachen; Formular, Fußzeilen, `BESTAETIGUNG_RE`, `istNeinDanke` unverändert; Vorlagennamen mit neuem Hash, falls der
  Code sie aus dem Text ableitet; `FLOW_TEXT_VERSION` nur hochzählen, wenn `formularWortlaut` betroffen ist (soll nicht).
- `tests/unit/policen-flow.test.ts` anpassen; Test, dass „sparen“, „zu teuer“, „Garantie“ in keinem Lead-Text stehen.
- `bitte.ts` nicht anfassen; Hinweis an Team `policen-bitte-sparten` in der Rückgabe.

Abnahme:
- Beide Ansprachen, keine Gedankenstriche (`tests/unit/gedankenstriche.test.ts` grün).
- Formularwortlaut-Hash unverändert (Test vergleicht `textHash` vorher/nachher).
- Abmeldehinweis wörtlich in beiden Erinnerungen.
- In der Rückgabe: Liste der Vorlagen, die neu bei Meta eingereicht werden müssen (Stufe B, Einreichung erst nach
  Freigabe durch Ole in einer Sitzung).

## Berührungspunkte zu anderen Teams

- Bestand: `src/lib/bestand/sichtbar-server.ts` `loadBestandVisible`, `src/lib/vertraege.ts`
  `bestandskundeZuLead`/`refreshBestandSummary` werden nur aufgerufen. `renewalDate`-Semantik (Frist statt Termin)
  und Werbeeinwilligung für Bestandskampagnen liegen beim Bestand-Team.
- Branch `policen-bitte-sparten` (bitte.ts, Sparte vom Lead) und `tkv-umfang` (Strecke): nicht anfassen.
- Termine-Team: Kennzeichen „Unterlagen da“ in der Terminliste (nächste Runde).
- CTO: Reihenfolge `termin-strecke.ts` (Hebel 3) als A/B je Kunde.
