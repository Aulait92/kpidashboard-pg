# Neuer Admin (/admin/neu): Konventionen für die Bereiche

Grundlage: `demo.html` (Entwurf, Struktur, Look) und `funktionsinventar.json` (419 Funktionen: 409 aus dem Entwurf, 10 später auf claude/whatsapp-crm ergänzt; verbindliche
Abnahmeliste: keine Funktion darf verloren gehen). Regeln aus `AGENTS.md` gelten (UX-Regel, keine Gedankenstriche
in Texten an Kunden). Der alte Admin bleibt vollständig erreichbar, bis Ole abnimmt.

## Wo was liegt

| Was | Ort |
|---|---|
| Seiten eines Bereichs | `src/app/admin/neu/<bereich>/…` (`vertrieb`, `kunden`, `leads`, `marketing`, `zahlen`, `einstellungen`) |
| Bausteine eines Bereichs | `src/components/admin-neu/<bereich>/` |
| Gemeinsame Bausteine (nur hier) | `src/components/admin-neu/ui/` (`Seite`, `Platzhalter`). Sonst `src/components/ui` (Card, Badge, Button, Sheet, EmptyState) |
| Rahmen (Seitenleiste, Leiste unten, Suche, „+ Neu“, Profil) | `src/components/admin-neu/rahmen/`, Layout `src/app/admin/neu/layout.tsx` |
| Navigation, Reiter, „+ Neu“, Seitenliste der Suche | `src/lib/admin-neu/navigation.ts` (einzige Quelle) |
| Umzug alt → neu (noch nicht aktiv) | `src/lib/admin-neu/umzug.ts` |
| Offene Funktionen je Bereich | `src/lib/admin-neu/offen/<bereich>.ts` |
| Schalter „Neue Oberfläche“ | Profilmenü; Cookie `pg_admin_neu` (`src/lib/admin-neu/schalter.ts`) |
| Rückweg nach dem Speichern (gemeinsame Actions) | `adminZiel` in `src/components/admin-neu/ui/rueckweg.ts` (Referer /admin/neu → neue Seite) |
| Rücksprung nach Kalender, LinkedIn, Bank, 360dialog | `src/lib/admin-neu/ruecksprung.ts` (Cookie `pg_neu_back`, nur wenn der Start aus /admin/neu kam) |

Andere Bereiche nicht anfassen. Was mehrere Bereiche brauchen, gehört nach `components/admin-neu/ui/` (kurz im
Commit begründen).

## Eine Seite bauen

1. Platzhalter `src/app/admin/neu/<pfad>/page.tsx` durch die echte Seite ersetzen. Gerüst immer mit
   `<Seite titel=… reiter="<bereich>">` (Kopf, Reiter, Abstände wie überall). Reiter-Seiten eines Bereichs
   tragen als Titel den Bereich (wie in der Demo), Detailseiten ihren Namen und `zurueck`.
2. In `navigation.ts` bei der Seite `fertig: true` setzen. Dann führen Links auf die alte Seite innerhalb der
   neuen Oberfläche automatisch auf die neue (Heute-Liste, Suche, „+ Neu“).
3. **Server Actions und Daten der alten Seiten importieren, nicht kopieren** (`@/app/admin/…/actions`,
   `@/lib/…`). Bestehende Bausteine wiederverwenden; muss einer anders aussehen, mit Prop erweitern statt
   duplizieren (Beispiel: `components/admin/aufgaben-liste.tsx` dient alter und neuer Oberfläche).
4. Revalidieren: Actions, die Daten ändern, rufen zusätzlich `revalidatePath("/admin/neu", "layout")` auf, falls
   sie bisher nur alte Pfade revalidieren.

## Navigation und Suche ergänzen

- Neue Seite: Eintrag in `seiten` des Bereichs in `navigation.ts` (`view` aus der Demo, `pfad`, `titel`, `alt`
  = heutige Seite(n), optional `reiter`, `suchwoerter`). Danach `node tools/admin-neu/platzhalter.mjs` legt
  fehlende `page.tsx` an.
- Suche: Seiten ohne `[id]` erscheinen automatisch (Abschnitt „Seiten“). Kontakte, Kunden, Leads und Logins
  liefert `/api/admin/search` (gemeinsam mit der alten Oberfläche); neue Trefferarten dort ergänzen.
- „+ Neu“: Einträge in `NEU_EINTRAEGE` (`art: "link"` auf eine Seite, `art: "dialog"` für einen Ablauf im Fenster).
  Wenn ein Bereich den Ablauf neu baut, `href` auf die neue Seite umstellen.

## Abnahme: data-funktion und Inventar

- Jede Funktion aus dem Inventar bekommt im neuen UI `data-funktion="<id>"` an dem Element, das sie ausführt
  oder zeigt (mehrere ids mit Leerzeichen getrennt). Die id steht im Inventar (Feld `id`), Liste je Bereich in
  `src/lib/admin-neu/offen/<bereich>.ts` mit Funktionstext als Kommentar.
- Gebaut → id aus `offen/<bereich>.ts` streichen und `node tools/admin-neu/inventar-stand.mjs` laufen lassen
  (schreibt `status_neu` = vorhanden | offen | bleibt und `ort_neu` ins Inventar). Beides mit committen.
- `npx vitest run tests/unit/admin-neu-inventar.test.ts` schlägt an, wenn eine Funktion weder vorhanden noch
  offen ist, eine gebaute noch in `offen` steht, eine `data-funktion` keine Inventar-id ist oder der Stand nicht
  fortgeschrieben ist.
- Merge-Konflikt in `funktionsinventar.json`: eine Seite nehmen, Skript neu laufen lassen.
- Funktion bewusst woanders als im Inventar unter `neu` vorgesehen? Im Commit begründen.

## Prüfen vor dem Commit (Pflicht)

- `npx tsc --noEmit`, `npx eslint src tests --quiet`, `npx vitest run tests/unit`.
- Screenshots jeder geänderten Seite auf **390 px und 1280 px** ansehen (UX-Regel: übersichtlicher oder voller?).
- `node tools/admin-neu/durchklick.mjs` (Server mit Admin-Login nötig, siehe Kopf des Skripts): klickt alle
  Ansichten auf 390 und 1280 px ab und meldet Konsolenfehler und waagrechtes Scrollen.
- Keine Gedankenstriche in Texten, die an Leads oder Kunden gehen. Im Admin Sie-Form wie in Heute.
