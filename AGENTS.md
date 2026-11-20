<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Neuigkeiten für Kunden pflegen (Ole, 13.11.2026)

Die Seite „Neuigkeiten“ im Kundenbereich (`/buyer/neuigkeiten`, Modell `ProductUpdate`) wird von uns
automatisch geführt. Jede Änderung, die **Kunden (Vermittler) sehen oder nutzen**, bekommt im selben
Commit einen Eintrag – als eigene Migration `prisma/migrations/<zeitstempel>_neuigkeit_<kurzname>/migration.sql`
mit `INSERT INTO "ProductUpdate" (...) VALUES (...) ON CONFLICT ("id") DO NOTHING;`.

- `kind`: `neu` | `verbessert` | `behoben`; `audience`: `alle` | `software` | `betreuung`.
- `publishedAt` = Zeitpunkt des Livegangs (nicht in der Zukunft), `pushedAt` NULL (kein Push – Push nur, wenn Ole es will).
- Text: Sie-Form, 1–3 Sätze, Nutzen statt Technik, Weg in der App fett (z. B. **Konto & Rechnungen → Produkte**).
  Keine internen Namen, keine Admin-/Ole-Funktionen, nie das Wort „Garantie“, keine Versprechen.
- Kein Eintrag für: reine Admin-Funktionen, interne Technik, Sicherheits-Updates ohne sichtbare Änderung,
  kleine Korrekturen ohne spürbaren Unterschied. Fehlerbehebungen nur, wenn Kunden den Fehler bemerkt haben.
- Mehrere kleine Änderungen eines Tages zu einem Eintrag zusammenfassen.

## Webseite mitpflegen (Ole, 14.11.2026)

Die Marketing-Webseite (Lovable-Projekt „Growth Leads Hub“, Seite `/software`) wird an den aktuellen
Stand der App angepasst, aber **höchstens einmal pro Woche** (Ole, 14.11.2026: „es reicht, wenn wir 1x pro
woche die webseite updaten“). Nach jeder Änderung, die Kunden (Vermittler) sehen oder nutzen (also immer dann,
wenn auch eine Neuigkeit `ProductUpdate` entsteht), nur einen Eintrag in `docs/webseite-offen.md` ergänzen
(gewünschte Textänderung, Datum). Einmal pro Woche (montags) alle offenen Einträge gesammelt über die
Lovable-Tools umsetzen (`send_message` mit genauen Textänderungen, Ergebnis per `get_message`/`get_diff`
prüfen, dann `deploy_project`) und die Liste leeren. Nur auf Oles ausdrücklichen Wunsch zwischendurch.

- Du-Form, Nutzen statt Technik, keine Preise (Platzhalter bleibt), keine neuen Garantie- oder Ergebnisversprechen.
- Nur Verfügbares als verfügbar beschreiben; Angekündigtes als „demnächst“.
- Keine Admin-/Ole-Funktionen (z. B. LinkedIn, Vertrieb) auf die Webseite.
- Die Regeln stehen auch im Lovable-Projektwissen (Knowledge); bei Bedarf dort ergänzen.

## Texte an Leads und Kunden (Ole, 14.11.2026)

- Keine Gedankenstriche (– oder —) in Texten, die an Leads, Bestandskunden oder unsere Kunden rausgehen
  (WhatsApp, E-Mails, Vorlagen, öffentliche Seiten wie /book, /empfehlung, /angebot). Komma, Doppelpunkt oder neuer Satz.
  Bis-Striche in Zahlenbereichen („1–3 Tage“) sind ok. Code-Kommentare sind egal.
  Sicherheitsnetz (14.11.2026): `ohneGedankenstriche` aus `src/lib/gedankenstriche.ts` greift beim Versand
  (WhatsApp, Kunden- und Postfach-Mails), bei allen KI-Antworten (`runAgent`) und beim Speichern von Kundentexten.
  Der Test `tests/unit/gedankenstriche.test.ts` schlägt bei neuen Gedankenstrichen in festen Texten außerhalb
  des Admin-Bereichs an.
- Ansprache von Leads/Kunden folgt `Customer.leadAddress` (Standard „sie“, Helfer in `src/lib/ansprache.ts`).
  Neue Texte an Leads immer in beiden Fassungen (`a(an, du, sie)`); die Oberfläche für Vermittler bleibt Sie-Form.


## A/B-Tests bei Conversion-Nachrichten (Ole, 19.11.2026)

Bei allen conversion-wichtigen Nachrichten an Leads (Erstanschreiben, Terminvorschlag, Erinnerungen, Nachfassen,
Angebot) läuft immer ein A/B-Test, und es wird ständig neu getestet:
- Jede dieser Nachrichten hat eine B-Fassung mit einer klaren Hypothese (im Kommentar), technisch über `TEMPLATE_BODY_B`
  (`src/lib/whatsapp/templates.ts`, Auswertung `src/lib/whatsapp/ab-test.ts`) bzw. `src/lib/experimente.ts`.
- Ist ein Test entschieden, wird der Gewinner Standard und im selben Arbeitsgang die nächste B-Fassung angelegt.
  Kein Zeitraum ohne laufenden Test.
- Neue Fassungen, die Ole direkt freigibt, werden sofort Standard (kein Test nötig); die B-Fassung kommt trotzdem dazu.
- Erstanschreiben: Entscheidung erst ab 150 Sendungen je Fassung (Antwortquote 72 h), Terminquote mit ansehen.
- Entschieden wird nur bei statistischer Signifikanz (Ole, 19.11.2026): p unter 0,01 (strenger als üblich, weil laufend
  nachgerechnet wird), mindestens 10 Treffer und 10 Nicht-Treffer je Fassung, dazu die Mindestmenge. Vorher keine
  Entscheidung, auch nicht von Hand.
- Jeder neue Test wird von einem ganzen Team entwickelt (Ole, 19.11.2026), geführt vom A/B-Test-Labor
  (`.claude/agents/ab-test-labor.md`): Conversion-Texter, UX/UI, Kunden-Personas, Data/BI, bei Pflichtangaben Recht und
  Datenschutz, kurz Red Team. Das Team lernt aus allen bisherigen Tests, stellt Hypothesen auf und entwickelt sie weiter.
  Gedächtnis und Ablauf: `docs/firma/ab-tests.md` (vor dem Start eintragen, nach der Entscheidung Ergebnis und Lehre).

## UX-Regel (Ole, 15.11.2026): Jedes Feature wird gestaltet, nicht angehängt

Vor dem Bauen jedes Features, das Nutzer sehen, kurz festhalten (im Commit oder in der Rückmeldung):
- Wer nutzt es, in welcher Situation, und was ist die eine Aufgabe, die er damit erledigen will?
- Wo gehört es hin? Erst prüfen, ob es in einen bestehenden Ablauf, eine bestehende Karte oder einen bestehenden
  Button passt, bevor etwas Neues dazukommt. Lieber erweitern oder ersetzen als stapeln.
- Was fällt dafür weg oder wird zusammengelegt? Jede Seite hat einen klaren Hauptzweck und höchstens eine
  Hauptaktion (primärer Button).

Gestaltungsregeln:
- Weniger ist mehr: keine erklärenden Absätze, wo ein guter Titel oder eine Beschriftung reicht. Hinweistexte höchstens ein Satz.
- Seltenes und Einstellungen verstecken (aufklappen, Einstellungen, „Mehr“), Häufiges sichtbar und mit einem Klick erreichbar.
- Sinnvolle Standardwerte statt Pflichtfelder und Entscheidungen. Automatisch, wo möglich.
- Gleiche Dinge sehen überall gleich aus (bestehende Komponenten, Abstände, Begriffe wiederverwenden). Keine neuen Muster ohne Grund.
- Handy zuerst: Vermittler nutzen die App unterwegs. Jede Änderung auf 390 px Breite prüfen.
- Leere Zustände und Fehler mit einer klaren nächsten Handlung, nicht nur Text.

Qualitätsziel (Ole, 17.11.2026): Bei jeder Design-Entscheidung streben wir einen Usability-Score von 90+ an (System
Usability Scale, „Champions League“). Vor dem Commit die betroffene Seite ehrlich an den 10 SUS-Fragen messen (würde ein
Vermittler sie gern oft nutzen, ist sie unnötig komplex, ohne Hilfe nutzbar, Funktionen gut eingebunden, einheitlich,
schnell erlernbar, nicht umständlich, sicher bedienbar, ohne Vorwissen nutzbar) und den geschätzten Wert in der
Rückmeldung nennen. Unter 90: erst nachbessern (weniger Elemente, klarere Beschriftung, eine Hauptaktion, bessere
Standardwerte), dann committen. Die wöchentliche UX-Auswertung der Sitzungsaufnahmen prüft, ob das in der Praxis hält.

Prüfung vor dem Commit:
- Screenshot Desktop und Handy (390 px) der betroffenen Seite ansehen und ehrlich fragen: Ist die Seite übersichtlicher
  oder voller geworden? Würde ein Vermittler ohne Erklärung verstehen, was zu tun ist?
- Wenn die Seite voller geworden ist: aufräumen, bevor committet wird.
- In der Rückmeldung an Ole den Screenshot bzw. die UX-Entscheidung in zwei Sätzen nennen.
- Priorität: Vermittlerbereich (/buyer) zuerst, der Admin-Bereich wird später nachgezogen.

Qualitätsziel (Ole, 17.11.2026) für alle neuen Screens und UX/UI-Arbeiten: Champions-League-Niveau, Ziel-Score mindestens 90/100.
Vor jedem Screenshot an Ole und vor jedem Livegang fragen: „Warum ist das noch schwer zu verstehen?“ Gründe auflisten (Nutzer,
Aufgabe, erster Blick, Hauptaktion, Begriffe, Standardwerte, Farben, Dichte, Handy) und zuerst lösen. Erst dann vorlegen, mit Score
und kurzer Liste der behobenen Punkte.

Rechtliches mit Conversion-Blick (Ole, 18.11.2026): Jede rechtlich bedingte Änderung, die Leads, Kunden oder Vermittler sehen
(Einwilligungen, Pflichtangaben, Hinweise, Formulare, Abläufe), wird vor dem Bauen erst von einem eigenen Hilfsagenten als
Conversion-Texter/UX optimiert: kurz, Nutzen zuerst, Knöpfe als Handlung, Rechtliches an die Stelle der Handlung oder hinter einen
Klick, wo zulässig. Danach prüfen, dass alle Pflichtangaben erhalten sind. Aufträge von Ole mit rechtlichem Hintergrund kommen
meist schon optimiert; bei eigenen Funden (z. B. aus Tests) gilt die Regel selbst.
Rechtsprüfung erfolgt intern (Ole, 18.11.2026: bis Budget für eine Anwältin da ist, keine Anwaltsfreigabe abwarten); Ergebnis
und Auflagen stehen in docs/recht/.

## Erklärvideos aktuell halten (Ole, 15.11.2026)

Ändert ein Commit eine Oberfläche, Navigation, Knopfbeschriftung oder einen Ablauf, der in einem Erklärvideo vorkommt
(Liste der Seiten und Begriffe je Video in `tools/erklaervideos/README.md`, Abschnitt „Was jedes Video zeigt“), wird im
selben Arbeitsgang geprüft (README Abschnitt 2) und das betroffene Video neu aufgenommen, vertont und gegengehört
(`check_oa.py`). Schnellprüfung: `python3 tools/erklaervideos/betroffen.py [git-Bereich]` nennt die Videos, deren Seiten
sich geändert haben.
- Ausgeblendete Module (z. B. Bestandskunden-Modul, Empfehlungen & Bewertungen) dürfen in keinem Video vorkommen.
- Neu aufgenommene Videos nur außerhalb der Hauptzeiten deployen (nicht werktags 8 bis 20 Uhr).

## Agenten-Führungsteam (Ole, 19.11.2026)

22 Rollen (CEO, Chief of Staff, CFO, CTO, CPO, CMO, Sales, Recht, Datenschutz, UX/UI, Personas, Red Team …) liegen als
Subagenten in `.claude/agents/`. Gemeinsames Gedächtnis: `docs/firma/` (README mit Freigabestufen und Meetings,
Entscheidungslog, offene Aufgaben, Kalt-Mail-Regeln, Protokolle). Wer hier weiterarbeitet, liest zuerst
`docs/firma/offene-aufgaben.md` und trägt Beschlüsse ins Entscheidungslog ein.
