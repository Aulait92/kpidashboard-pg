# UX/UI-Review PKV-Funnel (pkv-beitrag), 21.11.2026

Auftrag Ole (21.11.2026): „UX/UI Champions-League-Level, Usability 90+, alles auf Apple-Niveau im Designstandard.“
Geprüft: live https://app.performancegrowth.de/f/pkv-beitrag (gleicher Code wie beitrag.pkv-tarife.com), Stand
21.11.2026, Code `src/app/f/[funnel]/`, `src/lib/funnel/`. Playwright (Chromium), iPhone 13 (390 × 664 sichtbare
Fläche, wie Safari mit Leisten) und Desktop 1440 × 900. Nicht abgesendet: Messung und Absenden wurden im Browser
abgefangen (keine Testbesuche in der Statistik, kein Lead). Danke-Seite, Ladezustand und Netzfehler mit lokal
erfundener Antwort gezeigt.

Screenshots: `/tmp/claude-0/-home-user-kpidashboard-pg/bf89c659-cedd-579f-985a-0a606116153e/scratchpad/review-ux/`
(Dateien `handy-*.png`, `desktop-*.png`, `fbinapp-*.png`, Messwerte `audit.json`). Der Ordner ist ein temporärer
Arbeitsordner; wer die Bilder behalten will, kopiert sie vor dem nächsten Neustart.

## Ergebnis zuerst

**SUS heute: etwa 79 (Spanne 75 bis 83).** Solide gebaut (Tippflächen 56 px, eine Frage je Schritt, automatisches
Weiter, richtige Tastaturen, Autofill, ruhige Marke), aber noch nicht Champions League.
**Mit den 10 Muss-Punkten: etwa 90 bis 92.**
**Größter einzelner Fehler:** Auf dem Handy verdeckt der Cookie-Hinweis die beiden Antwortknöpfe der ersten Frage.
Wer aus der Facebook-Anzeige kommt, sieht Bild, Überschrift und einen Banner, aber nichts zum Antippen
(`handy-01-start-cookie-viewport.png`). Mit dem geplanten Advertorial rutscht die Frage noch weiter nach unten.
**Zweitgrößter:** Die Fortschrittsanzeige sagt „Frage 7 von 7“, danach kommen noch drei Bildschirme ohne Anzeige
(Zwischenseite, Name, Kontakt). Das fühlt sich wie ein gebrochenes Versprechen an, genau vor dem wichtigsten Schritt.

Risiko: gering, alles umkehrbar; Texte an Leads und die Einwilligung sind Stufe A (Ole), Recht prüft Pflichtangaben
(L1, L6, L8). Kosten: etwa 1,5 bis 2 Tage Technik (CTO), 0 € extern. Stufe: Bewertung C, Umsetzung B, Texte A.

## Messwerte (390 px, aus `audit.json`)

| Punkt | Befund |
|---|---|
| Tippflächen Funnel | Optionen und Knöpfe 56 px oder mehr: gut. |
| Tippflächen unter 44 px | Fußzeilen-Links 37 px hoch; „Mehr dazu“ im Cookie-Hinweis 17 px; Links in der Einwilligung („Partnerliste“, „Datenschutz“) 17 px. |
| Schriftgrößen Felder | 16 px oder mehr: kein Zoom beim Antippen in iOS. Gut. |
| Tastaturen | Beitrag, Geburtsdatum, PLZ `inputMode=numeric`; Telefon `tel`; E-Mail `email`. Gut. |
| Autofill | `bday`, `postal-code`, `address-level2`, `given-name`, `family-name`, `tel`, `email`. Gut. |
| Erste Antwort sichtbar ohne Scrollen | Ohne Cookie-Hinweis knapp ja (Knöpfe bei etwa 563 bis 628 px von 664), mit Cookie-Hinweis nein. |
| Länge Schritt Versicherung | 2.018 px (42 Optionen), etwa drei Bildschirmhöhen. |
| Kontrast | Text #0F172A auf #FFFFFF und #F8F7F4: sehr gut. Leiser Text #475569: 7,5 : 1, gut. Platzhalter slate-400 auf Weiß etwa 2,6 : 1 (nur Beispiel, vertretbar). Petrol #0E5F68 auf Weiß etwa 7 : 1, gut. |

## Bewertung je Schritt

Frage bei jedem Schritt: „Warum ist das noch schwer zu verstehen?“

| Nr. | Schritt | Screenshot | SUS | Warum noch schwer? |
|---|---|---|---|---|
| 1 | Start mit Frage 1 | `handy-01-start-cookie-viewport.png`, `handy-02-start-full.png`, `fbinapp-01-start-cookie.png`, `desktop-02-start-viewport.png` | 74 | Cookie-Hinweis deckt die Antworten ab; ohne ihn liegen sie ganz unten am Rand. Überschrift drei Zeilen plus drei Vertrauenszeilen plus Bild: vier Elemente kämpfen vor der eigentlichen Aufgabe. Erklärtext erst unter der Frage (gut für die Frage, aber zwei Lesewege). „7 kurze Fragen“ stimmt nicht (es sind 9 Bildschirme bis zum Absenden). |
| 2 | Versicherung | `handy-03-versicherung-viewport.png`, `handy-03-versicherung-full.png` | 70 | 42 Kacheln, drei Bildschirme lang, alphabetisch. Wer bei der Signal Iduna ist, sucht ganz unten. Silbentrennung „Beamtenkran-kenkasse“ in der Zweierspalte. Kein Suchfeld. |
| 3 | Beruf | `handy-04-situation.png` | 82 | 9 Optionen in ungerader Zweierreihe; „Schule“, „Studium“, „In Ausbildung“ passen kaum zur Zielgruppe 45 bis 65, stehen aber vor „In Rente“. Auf iOS bleibt der Hover-Rand nach dem Tippen auf der Kachel an derselben Stelle stehen (Rand dunkler bei „Beamtin/Beamter“ im Bild): wirkt wie schon ausgewählt. |
| 4 | Dauer | `handy-05-dauer.png` | 90 | Klar. Nichts Wesentliches. |
| 5 | Beitrag | `handy-06-beitrag.png`, `handy-06b-beitrag-fehler.png` | 84 | Hinweis drei Zeilen (zwei Sätze). Fehlermeldung bricht „z.“ und „B.“ auseinander. Fehler erst nach Klick, ohne Symbol. |
| 6 | Geburtsdatum | `handy-07-geburtsdatum.png`, `handy-07b-geburtsdatum-fehler.png` | 86 | Automatische Punkte sind gut. Fehlertext nennt nicht, was falsch war (31.02. ist kein Datum). |
| 7 | Wohnort | `handy-08-wohnort.png` | 85 | Ort muss getippt werden, obwohl die PLZ ihn fast immer verrät. |
| 8 | Zwischenseite „Fast fertig!“ | `handy-09-fast-fertig.png` | 70 | Drei zentrierte Absätze (rund 70 Wörter) auf einem Bildschirm, den der Nutzer nur wegklicken will. Fortschrittsbalken verschwindet. Ausrufezeichen in der Überschrift (CI: keine). Ein zusätzlicher Klick ohne Aufgabe. |
| 9 | Name | `handy-10-name.png`, `handy-10b-name-fehler.png` | 80 | Zwei Überschriften konkurrieren (Petrol „Spare bis zu 50 %“ mit Fußnote und schwarz „Wie darf dich dein Experte ansprechen?“). Kein Fortschritt. Sonst sauber. |
| 10 | Kontakt mit Einwilligung | `handy-11-kontakt.png`, `handy-11b-kontakt-fehler.png`, `handy-11c-kontakt-ausgefuellt.png`, `handy-11e-kontakt-laedt.png`, `handy-11d-kontakt-netzfehler.png` | 76 | Einwilligung 8 Zeilen Fließtext direkt über dem Knopf: der dichteste Block des ganzen Funnels, genau am Ziel. Widerrufsadresse ist eine persönliche Adresse und bricht mitten im Wort um („ole.kanna / pinn@…“). Kein Fortschritt, kein Signal „letzter Schritt“. Beim Fehler wird nicht zum ersten fehlerhaften Feld gesprungen. Ladezustand nur Text „Wird gesendet …“, Knopf blasser. Netzfehler-Meldung gut sichtbar (role=alert), aber ohne Handlung. |
| 11 | Danke | `handy-12-danke-mock.png` | 82 | Gut gegliedert. Es fehlt die eine Handlung, die die Erreichbarkeit hebt: Nummer des Experten sehen und speichern. Experte nur mit Namen und Firma. |
| 12 | Ende gesetzlich | `handy-13-ende-gesetzlich.png` | 80 | Ausrufezeichen; „Zurück“ oben und „Ich bin doch privat versichert“ tun dasselbe. Viel leere Fläche, aber in Ordnung. |
| 13 | Ende Beitrag unter 650 € | `handy-14-ende-beitrag.png` | 80 | Ausrufezeichen; sonst klar mit einer Handlung. |
| 14 | Partnerliste | `handy-15-partnerliste.png` | 85 | Klar; Links klein. |
| | Cookie-Hinweis | `handy-01-start-cookie-viewport.png` | 72 | 4 Zeilen plus zwei Knöpfe, etwa 150 px hoch, liegt über der ersten Antwort. Knöpfe gleichwertig (richtig so). |

**Gesamt (gewichtet nach Abbruchgefahr, Start und Kontakt doppelt): etwa 79.**

## Apple-Designstandard

| Kriterium | Heute | Bewertung |
|---|---|---|
| Typografie-Hierarchie | H1 25/30 px fett, Fragen 20/22 px, Text 16 px, Meta 13 bis 15 px. Sauber. Schwäche: Name-Schritt mit zwei Überschriften; Zwischenseite zentrierter Fließtext. | gut, 2 Brüche |
| 8er-Raster | Überwiegend Tailwind-Stufen (16, 20, 24 px). Ausnahmen 10 px (gap-2.5), 6 px, 14 px. Ruhig genug; vereinheitlichen auf 8/12/16/24. | gut |
| Touch-Ziele 44 px | Funnel 56 px, Fußzeile 37 px, Inline-Links 17 px. | fast |
| Kontrast | WCAG AA überall außer Platzhalter. | gut |
| Ruhe, ein Hauptelement | Schritte 2 bis 7 vorbildlich. Start und Kontakt zu voll. | gemischt |
| Mikrointeraktionen, Übergänge | Auswahl mit Haken und 160 ms Verzögerung, `active:scale`: gut. Kein Übergang zwischen Schritten (harter Sprung), Fortschrittsbalken animiert nur innerhalb der 7 Fragen. Hover bleibt auf Touch-Geräten hängen. | fehlt |
| Fortschrittsanzeige | Nur Fragen 1 bis 7, verschwindet bei den letzten drei Bildschirmen. | Muss |
| Tastatur-Typen, Autofill | Vollständig und richtig. | sehr gut |
| Fehlerzustände | Roter Rand und Text, `aria-invalid`, `aria-describedby`. Kein Sprung zum Feld, kein Symbol, Umbruch in „z. B.“, Prüfung erst beim Klick. | mittel |
| Ladezustand | Text im Knopf, blasser Knopf, kein Spinner. Bilder mit Petrol-Platzhalter. | mittel |
| Bilder | Hero passend (Paar mittleren Alters, ruhig, keine Texte). Linke Bildhälfte leer (Wand), am Handy verschenkte Höhe. Zwischenseite „Symbolbild“ korrekt. | gut |
| Logo | Klar, scharf (SVG), gute Größe. | sehr gut |
| Danke-Seite | Gute Struktur, fehlt Nummer und „Kontakt speichern“. | gut |
| Abbruchseiten | Freundlich, eine Handlung. Ausrufezeichen. | gut |
| Cookie-Hinweis | Rechtlich sauber, gestalterisch zu hoch und verdeckend. | Muss |

## Muss (für 90+)

1. **Cookie-Hinweis darf die erste Frage nicht verdecken.**
   Datei: `src/app/f/[funnel]/cookie-hinweis.tsx`, `funnel-client.tsx`.
   Was: Hinweis kompakt (Text 2 Zeilen sichtbar, Rest hinter „Mehr dazu“ aufklappbar, nur wenn Recht zustimmt;
   sonst Text 13 px auf max. 3 Zeilen bei voller Breite), Knöpfe nebeneinander 44 px. Zusätzlich am Start den Platz
   unten so bemessen, dass die Antwortknöpfe über dem Hinweis liegen (heute nur `pb-44` am Seitenende, das hilft oben
   nicht). Alternative, falls Recht die Kürzung ablehnt: Hinweis erst nach der ersten Antwort einblenden (Pixel lädt
   ohnehin erst nach Einwilligung, also kein Rechtsnachteil; Recht kurz bestätigen lassen).
   Warum: Der erste Bildschirm aus der Anzeige hat heute nichts zum Antippen. Effekt: höchster Hebel im ganzen
   Funnel, geschätzt +5 bis +15 % Start-Quote (Klick auf Frage 1).
2. **Fortschritt über alle Schritte bis zum Absenden.**
   Datei: `src/lib/funnel/definition.ts` (Schritte `fast-fertig`, `name`, `kontakt` bekommen eine Position),
   `funnel-client.tsx` (`Fortschritt`), `pkv-beitrag-texte.ts` (`fortschritt`, `start.vertrauen`).
   Was: Balken ohne Zähler oder „Schritt x von 9“; Kontakt zeigt „Letzter Schritt“. Vertrauenszeile „7 kurze Fragen“
   ersetzen durch „Dauert etwa 1 Minute“ (Text: Conversion-Texter, Freigabe Ole).
   Warum: „Frage 7 von 7“ und danach drei weitere Bildschirme bricht ein Versprechen genau vor den Kontaktdaten.
   Effekt: weniger Abbruch auf Zwischenseite und Name (geschätzt −10 bis −20 % Abbruch dort).
3. **Zwischenseite auf das Nötige kürzen.**
   Datei: `pkv-beitrag-texte.ts` (`fastFertig`), `funnel-client.tsx` (Info-Schritt links ausrichten).
   Was: Überschrift ohne Ausrufezeichen („Fast geschafft. Bei Beiträgen in deiner Höhe lohnt sich die Prüfung oft.“
   o. ä.), statt drei Absätzen drei kurze Haken-Zeilen (Experte prüft kostenlos · ruft dich mit dem Ergebnis an · du
   entscheidest danach in Ruhe), linksbündig, Knopf „Weiter“ bleibt. Keine Ergebnisversprechen.
   Warum: Textwand auf einem Bildschirm ohne Aufgabe. Effekt: schnellerer Durchlauf, ruhigeres Bild.
4. **Name-Schritt: eine Überschrift.**
   Datei: `funnel-client.tsx` (Block `texte.ueberschrift` im Formular), `definition.ts` (Schritt `name`).
   Was: „Spare bis zu 50 %“ samt Fußnote (L8, muss bleiben) als kleine Petrol-Zeile 15 px über der Frage, Fußnote
   direkt darunter 13 px; Frage bleibt die einzige große Überschrift. Fußnote nicht kürzen.
   Warum: Zwei gleich starke Überschriften, der Blick weiß nicht, wohin. Effekt: klarere Aufgabe.
5. **Einwilligung lesbar gliedern, ohne Inhalt zu verlieren (L1).**
   Datei: `funnel-client.tsx` (`Einwilligung`), `src/lib/funnel/einstellungen.ts` bzw. Railway-Variable
   `FUNNEL_DATENSCHUTZ_EMAIL`.
   Was: Wortlaut unverändert (sonst neue `EINWILLIGUNG_VERSION` und Freigabe A). Gestaltung: 13 px, Zeilenhöhe 1.5,
   Farbe leiser Text statt Volltext, Abstand 16 px über dem Knopf; Links mit größerer Tippfläche (Padding 4 px oben und
   unten). Widerrufsadresse auf eine kurze Funktionsadresse umstellen (z. B. datenschutz@…), damit sie nicht
   umbricht und keine persönliche Adresse öffentlich steht; `break-all` entfernen. Adresswechsel ist Stufe A (Ole),
   Recht bestätigt.
   Warum: Dichtester Block genau am Ziel, persönliche Adresse wirkt unprofessionell. Effekt: ruhigerer letzter
   Schritt, mehr Vertrauen.
6. **Versicherer finden statt scrollen.**
   Datei: `funnel-client.tsx` (Auswahl-Schritt), `definition.ts` (Schritt `versicherung`), `pkv-beitrag-texte.ts`.
   Was: Oben die 8 häufigsten Versicherer als Kacheln (Reihenfolge aus den bisherigen Perspective-Leads, Data/BI
   liefert die Zahlen über die Diagnose-Schnittstelle), darunter ein Feld „Andere Versicherung suchen“ mit
   Vorschlagsliste aller 42 (gespeicherter Wert unverändert). Kacheln einspaltig für lange Namen oder Namen kürzen
   (kein Trennstrich mitten im Wort).
   Warum: 3 Bildschirme Scrollen für eine Antwort, die der Nutzer im Kopf hat. Effekt: Schritt 2 deutlich schneller,
   weniger Fehlklicks.
7. **Beruf nach Zielgruppe ordnen.**
   Datei: `pkv-beitrag-texte.ts` (`PKV_SITUATIONEN` nur Reihenfolge, Werte bleiben).
   Was: Angestellt, Selbstständig, Beamtin/Beamter, In Rente, dann Nicht erwerbstätig, Hausfrau/Hausmann, In
   Ausbildung, Studium, Schule. Hover nur bei echter Maus: `hover:` in `[@media(hover:hover)]` einschließen (auch in
   `cookie-hinweis.tsx`).
   Warum: Die vier häufigsten Antworten stehen sofort oben; kein Schein-Auswahlrand auf dem iPhone. Effekt: weniger
   Fehlklicks.
8. **Fehler: zum Feld springen, sauber umbrechen.**
   Datei: `funnel-client.tsx` (`weiter`, `absenden`, `Feld`), `pkv-beitrag-texte.ts` (alle „z. B.“ mit
   geschütztem Leerzeichen `z. B.`).
   Was: Nach fehlgeschlagener Prüfung Fokus und Scroll auf das erste fehlerhafte Feld; kleines Warnsymbol vor dem Text;
   Telefon und E-Mail zusätzlich beim Verlassen des Feldes prüfen. Geburtsdatum: eigener Text für unmögliches Datum
   und für Alter außerhalb 18 bis 99.
   Warum: Am Handy mit offener Tastatur sieht man den Fehler sonst nicht. Effekt: weniger Abbruch bei Kontakt.
9. **Übergänge und Ladezustand.**
   Datei: `funnel-client.tsx`.
   Was: Schrittwechsel als kurzer Fade und 8 px Versatz (180 bis 220 ms, `prefers-reduced-motion` respektieren);
   Fortschrittsbalken gleitet. Beim Absenden Spinner im Knopf, Knopf behält Farbe und Breite. Netzfehler: Meldung mit
   Knopf „Noch einmal senden“ (Eingaben bleiben).
   Warum: Harte Sprünge wirken billig, ein blasser Knopf wirkt wie kaputt. Effekt: wahrgenommene Qualität, weniger
   Doppelklicks.
10. **Danke-Seite mit Handlung „Nummer speichern“.**
    Datei: `funnel-client.tsx` (Danke), `src/app/api/funnel/absenden` (Experte mit Telefonnummer, wenn vorhanden),
    `pkv-beitrag-texte.ts`.
    Was: In der Experten-Karte Telefonnummer und ein Knopf „Nummer speichern“ (vCard-Datei), damit der Anruf erkannt
    wird. Ohne zugeteilten Experten: Schritt 2 „Geh auch bei unbekannten Nummern ran“ bleibt. Ausrufezeichen aus den
    Endseiten-Überschriften entfernen (CI).
    Warum: Hauptkennzahl ist der erreichte, verkaufte Lead; Erreichbarkeit entsteht hier. Effekt: höhere
    Erreichbarkeit (auch L3b aus der Rechtsprüfung).

## Schön

- **PLZ füllt den Ort** (`funnel-client.tsx`, statische PLZ-Liste unter `public/` oder kleines Server-Endpunkt;
  Feld bleibt änderbar). Ein Feld weniger zu tippen.
- **Hero zuschneiden**: Personen mittiger, weniger leere Wand; am Handy 16:7 statt 12:5 (spart etwa 20 px).
- **Fußzeile**: Links mit 44 px Höhe (Padding), Anbieterzeile 12 px.
- **Ende gesetzlich**: oberes „Zurück“ dort ausblenden (der Knopf macht dasselbe).
- **Abstände** auf 8/12/16/24 vereinheitlichen (gap-2.5 → gap-3).
- **Desktop**: Karte und Text sind auf 576 px begrenzt, gut; Hero dort auf 200 px Höhe begrenzen, damit Frage 1
  im ersten Bildschirm voll sichtbar ist (`desktop-02-start-viewport.png`: knapp).
- **Zwischenseite als A/B-Test weglassen** und die drei Haken-Zeilen in den Name-Schritt ziehen (ein Klick weniger).
  Nur als Test über das A/B-Test-Labor, nicht einfach umbauen.
- **Haptik**: `navigator.vibrate` gibt es in iOS nicht; nicht nachbauen.

## Advertorial auf der Startseite (Ergänzung Ole, 21.11.2026)

Vorgabe: vorn ein kurzes Advertorial, gekennzeichnet als Anzeige, Überschrift, 3 bis 5 kurze Absätze, dann die erste
Frage. Text vom Conversion-Texter. Gestaltung auf 390 px:

**Aufbau von oben nach unten**

1. Kopfzeile wie heute (Logo), darunter klein „Anzeige“ (12 px, Großbuchstaben, Laufweite +0,04 em, leiser Text,
   links). Kennzeichnung immer sichtbar im ersten Bildschirm, nicht im Bild.
2. Überschrift H1 25 px fett, höchstens 3 Zeilen (etwa 60 Zeichen). Keine Vertrauenszeile direkt darunter (wandert
   in die Frage-Karte, siehe 6).
3. Einleitungssatz 18 px, Text dunkel, höchstens 2 Zeilen: der Nutzen in einem Satz.
4. **Sofortlink** unter dem Einleitungssatz: „Direkt zur kostenlosen Prüfung“ mit Pfeil nach unten, 44 px hoch,
   Petrol, scrollt weich zur Frage-Karte und setzt den Fokus. Für alle, die nicht lesen wollen.
5. Absätze: 17 px, Zeilenhöhe 1,55, Text #0F172A (nicht leise, sonst wirkt es wie Kleingedrucktes), Absatzabstand
   16 px, linksbündig. Jeder Absatz höchstens 3 Zeilen bei 390 px (etwa 35 bis 40 Wörter), insgesamt höchstens 160
   Wörter. Ein fett gesetzter Kernsatz je Absatz statt Zwischenüberschriften. Keine Gedankenstriche, Du-Form, keine
   Prozentzahlen außer mit L8-Fußnote, keine Ergebnisversprechen.
6. Bild: das heutige Hero **nach dem ersten Absatz**, 16:9, Radius 16 px (nicht über der Überschrift: das Bild
   kostet sonst 150 px vor dem ersten Wort). Optional ohne Bild testen.
7. Frage-Karte wie heute, mit Vertrauenszeile („Kostenlos und unverbindlich · Du bleibst bei deiner Versicherung ·
   Dauert etwa 1 Minute“) direkt über der Frage innerhalb der Karte.
8. Unter der Karte nichts mehr außer Fußzeile (der heutige Erklärtext unter der Frage geht im Advertorial auf).

**Wo steht die erste Frage?** Ziel: Oberkante der Frage-Karte bei höchstens etwa 1,8 Bildschirmhöhen (etwa 1.200 px
bei 664 px sichtbarer Höhe). Rechnung: Kopf 56 + Anzeige 24 + H1 96 + Einleitung 60 + Sofortlink 52 + 4 Absätze je
etwa 90 + Bild 210 ≈ 860 bis 1.100 px. Mehr als 5 Absätze oder längere Absätze sprengen das: dann kürzen, nicht
kleiner setzen.

**Sticky-Knopf: ja, aber nur auf dem Handy und nur bedingt.**
- Leiste unten (64 px plus sichere Fläche, weiß, Schatten oben) mit einem Primärknopf „Kostenlos prüfen lassen“ oder
  besser „Zur Prüfung, 1 Minute“ (Text: Conversion-Texter). Tippen scrollt zur Frage-Karte und fokussiert die Frage.
- Erscheint erst, wenn der Sofortlink aus dem Bild gescrollt ist; verschwindet, sobald die Frage-Karte zu mindestens
  einem Viertel sichtbar ist (IntersectionObserver). So gibt es nie zwei Hauptaktionen gleichzeitig.
- Nie gleichzeitig mit dem Cookie-Hinweis: solange der Hinweis offen ist, keine Leiste (Hinweis zuerst).
- Kein Sticky auf Desktop (dort ist die Karte nah genug).
- Warum nicht die Antworten selbst sticky: zwei Antwortknöpfe ohne Fragezusammenhang führen zu Fehlklicks bei
  „Gesetzlich“.

**Messung:** Schritt „start“ getrennt messen nach „Advertorial gesehen“ und „Frage-Karte sichtbar“ (neues Ereignis
`karte_sichtbar` in `ereignisSenden`), sonst ist der Verlust im Text nicht vom Verlust in der Frage zu trennen.
Einführen als A/B-Test gegen die heutige Startseite (A/B-Test-Labor, `docs/firma/ab-tests.md`).

## Was nicht verloren gehen darf

- L1 Einwilligung: Wortlaut, Partnerliste-Link, Kanäle Telefon/E-Mail/WhatsApp, Widerrufsweg, Datenschutz-Link,
  Position direkt über dem Knopf, Knopftext „Kostenlos prüfen lassen“ (steht wörtlich in der Einwilligung).
- L6 Cookie-Hinweis gleichwertige Knöpfe, Ablehnen auf erster Ebene, Fußzeile mit Anbieter und Links; jede Kürzung des
  Cookie-Texts nur nach Recht.
- L8 Fußnote zu „bis zu 50 %“ direkt bei der Aussage, auch im Advertorial, falls die Zahl dort auftaucht.

## Selbstprüfung „Warum ist das noch schwer zu verstehen?“ nach den Muss-Punkten

| Grund | gelöst durch |
|---|---|
| Erster Blick ohne Handlung | 1, Advertorial-Sofortlink |
| Versprechen „7 Fragen“ gebrochen | 2 |
| Textwand vor dem Ziel | 3, 5 |
| Zwei Überschriften | 4 |
| Lange Suche | 6, 7 |
| Fehler unsichtbar mit Tastatur | 8 |
| Wirkt technisch, nicht hochwertig | 9 |
| Anruf wird nicht erkannt | 10 |

Erwarteter SUS danach: 90 bis 92 (Start 90, Versicherung 88, Zwischenseite 86, Name 90, Kontakt 88, Danke 92, übrige
unverändert 85 bis 90). Prüfung nach Umsetzung: gleiche Playwright-Strecke (Skript
`/tmp/claude-0/-home-user-kpidashboard-pg/bf89c659-cedd-579f-985a-0a606116153e/scratchpad/review.js`) plus erste
Sitzungsaufnahmen nach 100 Besuchen.
