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

