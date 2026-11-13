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
