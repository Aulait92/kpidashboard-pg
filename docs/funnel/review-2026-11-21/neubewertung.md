# Neubewertung PKV-Funnel nach Redesign (UX/UI, 21.11.2026)

Auftrag Ole (21.11.2026): SUS 90+ und Apple-Designstandard. Frisch bewertet, live
https://app.performancegrowth.de/f/pkv-beitrag, Stand 21.11.2026. Playwright (Chromium), 390 × 664, 390 mit 130 % Schrift
(nachgebildet: jede Schriftgröße × 1,3), 1440 × 900. Nichts abgesendet: `/api/funnel/**` im Browser mit Fake-Antwort
abgefangen, Meta blockiert, Cookie-Hinweis mit „Nein danke“ geschlossen. Kein Lead, kein Testbesuch.
Screenshots und Messwerte: `/tmp/claude-0/-home-user-kpidashboard-pg/bf89c659-cedd-579f-985a-0a606116153e/scratchpad/neubewertung/`
(`handy-*`, `handy130-*`, `desktop-*`, `audit.json`, `audit130.json`; temporärer Ordner).

## Ergebnis zuerst

**SUS gesamt: etwa 87 (Spanne 84 bis 90).** Fragen 2 bis 7 sind Champions League, Start und Kontakt ziehen herunter.
**Apple-Niveau: weitgehend erreicht** (Ruhe, Typo, Touch-Ziele), es fehlen Feinheiten an Start, Kontakt und großer Schrift.
Mit den 6 Punkten unten: etwa 90 bis 92. Risiko gering, umkehrbar. Kosten etwa 0,5 Tag Technik, 0 € extern.
Stufe: Bewertung C, Umsetzung B, Textänderungen an Leads A (Ole).

## SUS je Schritt (390 px)

| Schritt | SUS | Warum nicht höher |
|---|---|---|
| Start (Advertorial + Frage 1) | 83 | Erste Antwort erst bei etwa 1.420 px (gut 2 Bildschirme). Beim Laden deckt der Cookie-Hinweis ein Viertel. Der Sticky-Knopf „Zur kostenlosen Prüfung“ kommt erst nach dem Hinweis und beim Scrollen, das rettet viel. |
| Versicherung | 92 | 8 Kacheln + Suche, klar. |
| Beruf | 89 | 9 Optionen, bei 130 % ragen „Selbstständig“ und „erwerbstätig“ über den Kachelrand. |
| Dauer | 93 | Eine Spalte, klar. |
| Beitrag | 91 | Einheit im Feld, Hinweis passend zum Beruf. Hinweis 3 Zeilen, etwas lang. |
| Geburtsdatum | 91 | Ruhig. |
| Wohnort | 90 | Fehler sauber am Feld. |
| Zwischenseite | 88 | Knopf „Noch 2 Angaben“ ist ein Status, keine Handlung. |
| Name | 88 | „Spare bis zu 50 %“ samt 3 Zeilen Fußnote über der Frage: Werbung vor der Aufgabe. |
| Kontakt | 84 | Dichteste Seite: Werbezeile + Fußnote, Hinweis, Feldhinweis, 8 Zeilen Einwilligung, Satz unter dem Knopf. Fortschritt steht schon auf 100 % vor dem Absenden. Knopf bei 390 px erst bei y≈805. |
| Ende „nur Privatversicherte“ | 92 | Eine Aussage, ein Knopf. |

## Apple-Standard-Check

| Kriterium | Befund |
|---|---|
| Typografie | Gut: eine Schrift, 17/26 Fließtext, Fragen 22 px fett, Felder ≥ 16 px (kein iOS-Zoom). Zu viele Stufen: 11, 11,9, 12, 13, 15, 17, 18, 19, 22, 28 px (10 statt etwa 6). |
| Abstände | Gleichmäßig, Karte mit 20 px Innenabstand, viel Luft. Desktop: schmale Spalte, ruhig. |
| Touch-Ziele | Optionen 56 bis 70 px, Knöpfe 58 px, Zurück 44 px: gut. Unter 44 px: „Mehr dazu“ im Cookie-Hinweis (24 px), Links in der Einwilligung (24 px, als Textlinks zulässig, WCAG 2.2 AA erfüllt). |
| Kontrast | Keine Texte unter 4,5:1 gemessen (ohne Platzhalter). |
| Ruhe | Fragen 2 bis 7 sehr ruhig. Start lang (bewusst, Advertorial), Kontakt voll. |
| Übergänge | Fade mit 8 px, „weniger Bewegung“ beachtet, Auto-Weiter nach 160 ms, Zurück per Browser-Taste. Gut. |
| Handy 130 % | Kein waagerechtes Scrollen, aber Wortüberlauf in 2-Spalten-Kacheln (Beruf). |

## Was zwischen heute und 90+/Apple steht

1. **Kontakt entlasten** (`src/lib/funnel/definition.ts` Schritt `kontakt`, `src/lib/funnel/pkv-beitrag-texte.ts` `kontakt`):
   Satz unter dem Knopf („Das Absenden kostet nichts …“) streichen, „kostenlos“ steht schon im Knopf; Telefon-Hinweis
   nur zeigen, wenn das Feld Fokus hat oder als Platzhalter-nahe Zeile in 13 px. Einwilligung bleibt im Wortlaut. (A)
2. **50-%-Zeile nur einmal** (`definition.ts` Schritt `name`, `texte.ueberschrift`/`fussnote` entfernen): auf Kontakt
   bleibt sie mit Fußnote (L8). Name-Seite wird reine Frage. (A, Recht kurz gegenlesen)
3. **Fortschritt ehrlich** (`src/lib/funnel/definition.ts` `fortschrittFuer`, Z. 220): auf Kontakt höchstens 90 %,
   100 % erst auf der Danke-Seite. (B)
4. **Knopf als Handlung** (`pkv-beitrag-texte.ts` `fastFertig.knopf`, Z. 91): „Weiter, noch 2 Angaben“. (A)
5. **130 % Schrift** (`src/app/f/[funnel]/funnel-client.tsx` Z. 542 und 825, `[hyphens:manual]`): weiche Trennstellen in
   den Labels („Selbst­ständig“, „erwerbs­tätig“) oder `hyphens:auto` mit `lang="de"`. (B)
6. **Typo-Stufen bündeln** (`funnel-client.tsx`, `cookie-hinweis.tsx`): 11/11,9/12 → 13, 18/19 → 17 oder 22; Ziel 13, 15,
   17, 22, 28. „Mehr dazu“ im Cookie-Hinweis mit Innenabstand auf 44 px Tippfläche. (B)

Nicht empfohlen: Advertorial auf dem Start kürzen. Der Sticky-Knopf löst den Weg zur Frage; Kürzen erst nach Daten
(Abbruch Start vs. Frage 2 aus dem Funnel-Test).
