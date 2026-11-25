# Prüfung vor dem Commit

## 1. „Warum ist das noch schwer zu verstehen?“

Vor jedem Screenshot an Ole und vor jedem Livegang die Gründe auflisten und zuerst lösen. Je Punkt ehrlich prüfen:

| Punkt | Frage |
|---|---|
| Nutzer | Ist klar, für wen die Seite ist (Inhaber, Berater im Team, Lead)? |
| Aufgabe | Ist die eine Aufgabe der Seite in 3 Sekunden erkennbar? |
| Erster Blick | Was sieht man ohne Scrollen auf 390 px? Ist das das Wichtigste? |
| Hauptaktion | Genau ein blauer Knopf? Mit Verb beschriftet? |
| Begriffe | Dieselben Wörter wie im Rest der App? Keine internen oder technischen Begriffe? |
| Standardwerte | Muss der Nutzer etwas entscheiden, das wir sinnvoll vorbelegen könnten? |
| Farben | Nur Tokens? Farbe trägt Bedeutung (Status), nicht Schmuck? |
| Dichte | Ist die Seite übersichtlicher oder voller geworden? Was kann weg oder zusammen? |
| Handy | Tippziele ≥ 40 px, kein waagerechtes Scrollen, Text lesbar, nichts verdeckt? |
| Leer und Fehler | Gibt es eine klare nächste Handlung, wenn nichts da ist oder etwas schiefgeht? |

## 2. SUS-Schätzung (System Usability Scale)

Jede Frage aus Sicht eines Vermittlers ohne Einweisung mit 1 (stimme gar nicht zu) bis 5 (stimme voll zu) bewerten.

1. Ich würde diese Seite gern oft nutzen.
2. Die Seite ist unnötig komplex.
3. Die Seite ist leicht zu bedienen.
4. Ich bräuchte Hilfe, um die Seite zu nutzen.
5. Die Funktionen sind gut eingebunden.
6. Die Seite ist uneinheitlich.
7. Die meisten Menschen lernen die Bedienung sehr schnell.
8. Die Bedienung ist umständlich.
9. Ich fühle mich bei der Bedienung sicher.
10. Ich musste viel lernen, bevor ich loslegen konnte.

Rechnung: ungerade Fragen (Wert − 1), gerade Fragen (5 − Wert), Summe × 2,5. Ergebnis 0 bis 100.
Unter 90: nachbessern (weniger Elemente, klarere Beschriftung, eine Hauptaktion, bessere Standardwerte), dann neu
schätzen. Die Schätzung ehrlich begründen, nicht schönrechnen.

## 3. Technische Prüfung

- Skill `web-design-guidelines` auf die geänderten `.tsx`-Dateien anwenden (Abweichungen stehen in `SKILL.md`).
- `npx vitest run tests/unit/gedankenstriche.test.ts`
- `npm run lint`, `tsc --noEmit` (mit `NODE_OPTIONS=--max-old-space-size=6144`)

## 4. Rückmeldung an Ole

- Screenshot Handy (390 px) und, wenn relevant, Desktop.
- UX-Entscheidung in zwei Sätzen (was, warum so, was dafür weggefallen ist).
- Geschätzter SUS-Wert und die Liste der behobenen Punkte aus Schritt 1.
