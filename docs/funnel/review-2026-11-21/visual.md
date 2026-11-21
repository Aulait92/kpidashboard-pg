# Visuelles Review PKV-Funnel (Creative Director, 21.11.2026)

Quelle: Live-Funnel https://app.performancegrowth.de/f/pkv-beitrag, Stand 21.11.2026, Playwright 390 px (2x) und 1440 px,
alle Schritte bis vor dem Absenden (Messung und Absenden im Test blockiert). Screenshots (nicht im Repo):
`/tmp/claude-0/-home-user-kpidashboard-pg/bf89c659-cedd-579f-985a-0a606116153e/scratchpad/review-visual/` (`m-*` Handy, `d-*` Desktop).
Grundlage: `docs/funnel/pkv-tarife-ci.md`, `src/lib/funnel/marken.ts`, `src/app/f/[funnel]/funnel-client.tsx`, `marke.tsx`.

## Urteil

Solide, ruhig, seriös, Note etwa 7 von 10. Die Farbe (Petrol auf Warmweiß) passt zum Finanzthema, das Hero-Bild wirkt echt.
Zum Apple-Niveau fehlen vor allem: Ruhe in der Typografie (zu viel Fett), die Versicherer-Liste (47 Kacheln, kaputte
Silbentrennung), Kasten-in-Kasten auf dem Handy und einige CI-Verstöße (Symbolbild fehlt, Ausrufezeichen, private
E-Mail in der Einwilligung).

## Befunde je Bereich

| Bereich | Befund | Bewertung |
|---|---|---|
| Logo | Schild mit Pfeil klar, gut lesbar bei 26 px. Pfeil nach unten auf Schild kann „Schutz sinkt“ oder „Download“ lesen. | gut |
| Farben | Petrol #0E5F68 seriös, Kontrast Knopf ok. Fortschrittsspur Petrol 50 auf Weiß fast unsichtbar. Optionsrand 2 px #CFD6DC wirkt grob. | gut, Details |
| Typografie | Geist wirkt nach Tech-Startup, nicht nach Finanzhaus. Fast alles fett (H1, Fragen, Optionen, Häkchenzeile, Zwischentitel): keine Hierarchie. Fließtext 16 px für 45 bis 65 knapp. Zentrierter Fließtext auf „Fast fertig“ (3 Absätze) schwer lesbar. | Hauptbaustelle |
| Bildsprache | Hero: Paar Mitte 50 mit Tablet, natürlich, glaubwürdig. Linkes Drittel leere Wand verschenkt am Handy 30 % der Bildfläche. Zwischenseite: Beraterin mit Headset von hinten, sauber, aber Callcenter-Anmutung; Kennzeichnung „Symbolbild“ fehlt (`symbolbild` in `marken.ts` nicht gesetzt, CI verlangt sie). | gut, 2 Mängel |
| Icons | Häkchen und Schloss stimmig. „‹ Zurück“ als Textzeichen statt Chevron-Icon, wirkt unfertig. | Detail |
| Weißraum | Desktop luftig und gut. Handy: Karte mit Rand auf Warmweiß plus Bild mit Radius in der Karte = Kasten in Kasten, wirkt eng. | mittel |
| Versicherer-Schritt | 47 Kacheln, ca. 4 Bildschirmhöhen, ungleiche Höhen, Trennungen wie „Mecklenburgi-sche“, „Pax-Familienfür-sorge“, „Württembergi-sche“. Nach dem Tippen bleibt die Hover-Umrandung auf der Kachel unter dem Finger stehen (Sticky Hover, im Test bei „DBV“ sichtbar). | muss |
| Kontakt-Schritt | Einwilligung bricht die private Adresse „ole.kanna / pinn@…“ mitten im Wort, wirkt unseriös. Platzhalter slate-400 auf Weiß ca. 2,6:1, zu blass. | muss |
| Cookie-Hinweis | Gleichwertige Knöpfe korrekt. Vier Zeilen Text plus Knöpfe belegen am Handy ca. 30 % des ersten Bildschirms. | schön |
| Konsistenz mit Anzeigen | Nicht geprüft: Anzeigenmotive liegen nicht im Repo, Meta-Lesezugriff in dieser Sitzung nicht verfügbar. Siehe Vorgabe M8. | offen |

## Vorgaben MUSS (vor dem nächsten Budgetschritt)

M1 Typografie-Stack und Skala (angelehnt an Apple HIG, für 45 bis 65 eine Stufe größer):
- Schrift: `font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;`
  (iPhone zeigt SF Pro, Android Roboto: nativ, vertraut, keine Webfont-Ladezeit). Geist nur noch in der Wortmarke.
- Skala Handy: H1 28/34 px, Gewicht 700, Laufweite -0,02em; Frage 22/28, 600; Zwischentitel 17/24, 600;
  Fließtext 17/26, 400; Option 17/22, 500; Hinweis 15/21, 400; Kleingedrucktes und Einwilligung 13/19, 400.
  Desktop: H1 34/40, Frage 24/30, Rest gleich.
- Höchstens zwei Gewichte je Bildschirm sichtbar (600/700 für Titel, 400/500 für alles andere).
  Häkchenzeile unter H1: 15 px, 500, Farbe Text leise statt Petrol 800.

M2 Versicherer-Liste: `hyphens: manual` (keine Auto-Trennung), Option 16 px/500, einheitlich `min-height: 56px`, lange Namen
zweizeilig ohne Trennung. Besser (mit UX/UI abstimmen): die 8 häufigsten als Kacheln, darunter „Andere Versicherung“ mit
Suchfeld. Kein Versicherer-Logo (Marken).

M3 Hover nur für echte Mäuse: Hover-Klassen in `@media (hover: hover)` (Tailwind `[@media(hover:hover)]:hover:`), sonst
bleibt auf dem Handy die Umrandung stehen.

M4 „Symbolbild“ auf der Zwischenseite einblenden (`symbolbild: true` für `zwischenseite`), wie CI und Alt-Text-Regel verlangen.

M5 Einwilligung: Rollen-Adresse statt Privatadresse (z. B. datenschutz@pkv-tarife.com, Entscheidung Ole/Datenschutz,
Stufe A da Rechtstext), Adresse mit `white-space: nowrap` bzw. ohne `break-all`.

M6 CI-Ton: kein Ausrufezeichen in Überschriften („Fast fertig! …“ verstößt gegen die eigene CI). Zwischenseite: Fließtext
linksbündig, höchstens 2 kurze Absätze.

M7 Kontrast: Platzhalter #6B7785 (ca. 4,6:1), Fortschrittsspur #D9E6E4 statt #EAF4F3.

M8 Message Match mit den Anzeigen: Hero-Foto und Headline-Aussage müssen zum laufenden Anzeigenmotiv passen (gleiches
Paar bzw. gleiche Szene, gleiche Farbstimmung Petrol/Warmweiß). Vor dem nächsten Motiv-Sprint stelle ich die aktuellen
PKV-Anzeigen neben den Hero und gleiche ab (Aufgabe Creative Director).

## Vorgaben SCHÖN

S1 Flächen und Tiefe: Handy ohne Kartenrand, Inhalt direkt auf Weiß (#FFFFFF Seite) oder Karte nur mit Schatten statt Rand:
`box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.06)`. Radius: Karte 20 px, Optionen/Felder/Knopf 14 px,
Bild 16 px. Ein Raster: 8 px (Abstände 8/16/24/32).

S2 Optionen: Rand 1 px #D5DADF plus `0 1px 2px rgba(15,23,42,.05)`; gewählt 2 px Petrol, Hintergrund #EAF4F3, Haken rechts.
Gedrückt `scale(.98)` 120 ms ist gut, bleibt.

S3 Knopf: 17 px/600, Höhe 56 px, Radius 14 px, kein `shadow-sm`; Hover #0B4A52 nur bei Maus.

S4 Hero-Bild am Handy: Bildausschnitt auf das Paar setzen (`object-position: 70% 50%`) oder eigener 4:3-Zuschnitt fürs
Handy (358 × 200), damit das Paar größer und näher wirkt; Desktop bleibt 12:5.

S5 Neues Bild Zwischenseite (ersetzt Headset-Motiv, weniger Callcenter): „Photorealistic editorial photo, natural window
light, a calm German insurance advisor in his fifties at a tidy wooden desk, seen from the side and slightly behind, face
not identifiable, reviewing unbranded paper documents with a pen, a laptop with blurred screen, warm muted colors with
soft teal shadows, shallow depth of field, no text, no readable writing, no logos.“ 16:9, ≤ 30 KB, „Symbolbild“.

S6 Zurück als Icon-Knopf: Chevron-SVG 20 px, Strich 2 px, plus Wort „Zurück“ 15 px/500.

S7 Logo: Pfeil im Schild optisch prüfen lassen (Variante „Pfeil nach unten mit Euro-Linie“ oder Schild mit Häkchen),
nur wenn die Anzeigen das Bildzeichen noch nicht tragen.

S8 Cookie-Hinweis kompakter: 2 Zeilen Text (Details hinter „Mehr dazu“), Knöpfe 48 px. Inhalt vorher mit Recht abstimmen.

## Kosten, Risiko, Stufe

- M1 bis M4, M6, M7, S1 bis S4, S6: reine Gestaltung, ca. 0,5 bis 1 Tag CTO/UX, keine externen Kosten. Stufe B.
  Risiko: Conversion-Änderung durch neues Schriftbild; daher als A/B-Variante „ruhige Typo“ laufen lassen (A/B-Labor).
- M5, S8: Rechtstext, Stufe A (Ole).
- S5: Bildgenerierung, Kosten unter 5 €. Stufe C (Entwurf), Livegang B.
- Hinweis: Änderungen am Funnel sind keine Vermittler-Oberfläche, daher kein ProductUpdate-Eintrag nötig.
