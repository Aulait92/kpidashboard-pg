---
name: pg-design
description: Gestaltung und UX-Prüfung für die performancegrowth-App (Vermittlerbereich /buyer, Admin, öffentliche Seiten wie /book, /w, /angebot). Vor JEDER Arbeit an einer Oberfläche laden, die Nutzer sehen (neue Seite, Karte, Knopf, Formular, Text in der Oberfläche, Umbau), und vor jedem Commit mit Oberflächenänderung. Enthält Designsystem (Tokens, Bausteine aus src/components/ui), Oles UX-Regeln, Textregeln (Sie-Form, keine Gedankenstriche), Screenshot-Werkzeug für Desktop und 390 px und die SUS-Prüfung (Ziel 90+).
---

# Gestaltung in der performancegrowth-App

Ziel (Ole, 17.11.2026): Champions-League-Niveau, geschätzter SUS-Wert mindestens 90 für jede neue oder geänderte Oberfläche.
Die Regeln aus AGENTS.md gelten weiter; dieser Skill bündelt sie zu einem Ablauf.

## Ablauf (immer in dieser Reihenfolge)

1. **Erst denken, dann bauen.** Drei Sätze festhalten (Commit oder Rückmeldung):
   - Wer nutzt es, in welcher Situation, und was ist die eine Aufgabe?
   - Wo gehört es hin? Erst bestehende Abläufe, Karten, Knöpfe prüfen. Erweitern oder ersetzen statt stapeln.
   - Was fällt dafür weg oder wird zusammengelegt?
2. **Nur mit Bausteinen bauen.** Siehe `references/bausteine.md`. Keine eigenen Klassen für Knöpfe, Karten, Chips,
   keine neuen Farben, keine neuen Muster ohne Grund. Neuer Baustein nur, wenn er an mindestens zwei Stellen gebraucht
   wird, dann in `src/components/ui/` und in `docs/design-system.md`.
3. **Texte nach den Textregeln** (unten). Vermittler-Oberfläche Sie-Form, Texte an Leads in beiden Fassungen.
4. **Screenshots ansehen** (Desktop 1280 px und Handy 390 px), siehe „Screenshots“. Wirklich ansehen, nicht nur erzeugen.
5. **Prüfen** nach `references/pruefung.md`: „Warum ist das noch schwer zu verstehen?“, SUS schätzen, unter 90 nachbessern.
6. **Technische Prüfung** der geänderten `.tsx`-Dateien mit dem Skill `web-design-guidelines` (Vercel-Regeln), mit den
   Abweichungen unten. Funde beheben oder begründet stehen lassen.
7. **Rückmeldung an Ole:** Screenshot(s), UX-Entscheidung in zwei Sätzen, SUS-Schätzung, Liste der behobenen Punkte.

## Die Regeln in Kürze

- **Eine Hauptaktion** je Seite und je Karte/Zeile (blauer `primary`-Knopf). Alles andere `secondary`, `ghost`,
  `ActionMenu` oder `ActionSheet`.
- **Handy zuerst:** Vermittler nutzen die App unterwegs. Tippziele mindestens 40 px, Eingaben `text-base` auf dem Handy
  (kein Zoom in iOS), nichts horizontal scrollen, Hauptaktion mit dem Daumen erreichbar.
- **Weniger ist mehr:** kein erklärender Absatz, wo ein guter Titel reicht. Hinweistexte höchstens ein Satz.
- **Seltenes verstecken** (aufklappen, „Mehr“, Einstellungen), Häufiges sichtbar und mit einem Klick erreichbar.
- **Standardwerte statt Pflichtfelder.** Automatisch, wo möglich.
- **Sofortige Rückmeldung:** Aktion wirkt sofort, Toast mit „Rückgängig“, wo möglich. Kein `alert()`.
- **Nichts Leeres:** jede Liste mit `EmptyState` und klarer nächster Handlung, beim Laden `Skeleton`.
- **Fehler** sagen, was zu tun ist („Bitte anrufen oder …“), nicht nur, was schiefging.
- **Icons nur `lucide-react`**, keine Emojis in der Oberfläche.
- **Gleiche Dinge gleich:** Status-Chips immer über `statusToneClass()`, gleiche Begriffe überall (Lead, Termin,
  Abschluss, Einrichtung, Heute, Zahlen, Chats).
- **Admin** (`/admin`) nach denselben Regeln, Priorität hat aber der Vermittlerbereich `/buyer`.

## Textregeln

- Vermittler-Oberfläche, Neuigkeiten, Hilfe: **Sie-Form**. (In `docs/design-system.md` stand früher „Du-Form“; das
  ist überholt.)
- Texte an Leads (WhatsApp, E-Mail, /book, /w, /angebot): Ansprache nach `Customer.leadAddress`, immer beide Fassungen
  über `a(an, du, sie)` aus `src/lib/ansprache.ts`. Marketing-Webseite: Du-Form.
- **Keine Gedankenstriche** (– oder —) in Texten an Leads und Kunden; Komma, Doppelpunkt oder neuer Satz. Bis-Strich
  in Zahlenbereichen ist ok. Der Test `tests/unit/gedankenstriche.test.ts` muss grün bleiben.
- Knöpfe als Handlung mit Verb („Anrufen“, „Termin buchen“, „Jetzt WhatsApp verbinden“), nicht „Weiter“ oder „OK“.
- Nutzen statt Technik, keine internen Namen, keine Anglizismen, wo es ein deutsches Wort gibt.
- Nie „Garantie“ und keine Ergebnisversprechen in Kundentexten.
- Deutsche Anführungszeichen „…“, Auslassung als „…“, Zahlen und Beträge mit `Intl.NumberFormat("de-DE")`,
  Datum mit `Intl.DateTimeFormat("de-DE")`.

## Abweichungen von den Vercel-Regeln (`web-design-guidelines`)

- „Title Case“ gilt nicht: deutsche Groß- und Kleinschreibung.
- „Curly quotes“ heißt bei uns „…“ (deutsch), nicht “…”.
- „Second person“ heißt bei uns Sie-Form in der Vermittler-Oberfläche.
- „URL reflects state“: für Filter, Reiter und Seiten ja (so macht es `FilterChips`), für kurzlebige Fenster nicht nötig.
- Virtualisieren erst, wenn eine Liste wirklich über 50 Einträge zeigt; sonst Seitenweise laden wie bisher.

## Screenshots

Lokal mit Demo-Daten (nie gegen die Produktion):

```bash
# 1) lokale Datenbank mit aktuellem Schema (siehe AGENTS.md/Tests), dann Demo-Vermittler anlegen
DATABASE_URL=postgresql://postgres:pg@localhost:5432/<db> node .claude/skills/pg-design/scripts/demo-vermittler.mjs
# 2) App starten (Turbopack spart Speicher)
DATABASE_URL=… AUTH_SECRET=… npx next dev -p 3925
# 3) Seiten aufnehmen: Desktop 1280 px und iPhone 390 px, ganze Seite
node .claude/skills/pg-design/scripts/screenshots.mjs http://localhost:3925 <ausgabeordner> /buyer /buyer/einrichtung
```

Je Seite und Gerät entstehen zwei Bilder: `…-oben.png` (erster Blick ohne Scrollen, das Wichtigste muss hier
stehen) und die ganze Seite. Turbopack braucht `node_modules` als echte Dateien im Worktree (`cp -al` statt Symlink).
Bilder in den Scratchpad legen, ansehen (Read-Werkzeug), an Ole mit `SendUserFile` schicken. Für Bilder an Ole
`SKALA=2`, für eigene Prüfung reicht 1. Weitere Logins/Zustände: Skript `demo-vermittler.mjs` anpassen
(Hinweis im Kopf des Skripts), nicht die Produktion verändern.

## Wann noch was gilt

- Ändert sich eine Oberfläche, die in einem Erklärvideo vorkommt: `python3 tools/erklaervideos/betroffen.py <bereich>`
  (AGENTS.md, „Erklärvideos aktuell halten“).
- Sehen Kunden die Änderung: Neuigkeit (`ProductUpdate`-Migration) und Eintrag in `docs/webseite-offen.md`.
- Rechtlich bedingte Texte: erst Conversion-/UX-Optimierung durch einen Hilfsagenten, dann Pflichtangaben prüfen
  (AGENTS.md, „Rechtliches mit Conversion-Blick“).
