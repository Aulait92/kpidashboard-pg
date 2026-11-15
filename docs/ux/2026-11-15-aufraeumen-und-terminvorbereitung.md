# Aufräumen Vermittlerbereich und neue Terminvorbereitung (15.11.2026)

Analyse und Entwurf nach der UX-Regel (AGENTS.md, Ole 15.11.2026). Nichts davon ist umgesetzt, Ole entscheidet.
Grundlage: App lokal mit Demo-Daten (eigene DB, `newUi = true`, Login demo@pg.local), Stand `origin/claude/whatsapp-crm` f8414ff.
Gesprächsleitfaden und Diktat werden gerade entfernt und fehlen hier bewusst. Die „Zurück zum Kontakt“-Links auf
Vorbereitung, Präsentation und Angebote repariert der Koordinator selbst, sie fehlen hier ebenfalls.

Bilder (Desktop 1440 × 900 links, Handy 390 × 844 rechts) liegen in `docs/ux/bilder/`, alle Einzelbilder (auch ganze
Seiten) im Scratchpad unter `…/scratchpad/ux/` (Liste am Ende). Hinweis: Auf den ganzen Handy-Seiten steht die untere
Leiste mitten im Bild, das ist ein Effekt des Ganzseiten-Screenshots, kein Fehler der App.

---

## Teil 1: Aufräum-Liste

### Die 10 wichtigsten Punkte (nach Wirkung)

1. **Heute: nur eine Hauptaktion.** Jede Anruf-Zeile hat einen blauen „Anrufen“-Knopf (6 plus „Anrufliste starten“, dazu „Antworten“, „Anrufen“ beim Termin). Zeilen-Knopf als Symbol bzw. `secondary`, blau bleibt nur „Anrufliste starten“.
2. **Heute: die vier Zahlen-Kacheln weg** (Chats 1, Termine 1, Wie lief's 0, Anrufen 20). Sie wiederholen die Zähler der Abschnitte direkt darunter.
3. **Heute: „Termine vorbereiten“ in „Termine“ aufgehen lassen.** Verena Martin steht zweimal untereinander. Eine Termin-Zeile mit Hinweis „8 Angaben offen · vorbereiten“ reicht.
4. **Terminvorbereitung neu** (Teil 2): heute 4.450 px Desktop bzw. 6.700 px Handy, drei Rohdaten-Karten, zwei blaue Knöpfe, und auf dem Handy fehlen Datum und Uhrzeit des Termins ganz.
5. **Präsentation: nichts mehr abschneiden.** Die Vergleichsfolie läuft heute 286 px über den Folienrand, Tarifnamen werden mitten im Wort gekappt (Befunde in Teil 3). Grenzen 3 Tarife, 5 Merkmale, 2 Bausteine plus Kurznamen.
6. **Kontakt: „Gewonnen“ und „Verloren“ aus dem Kopf.** Zwei laute Farbknöpfe konkurrieren mit „Anrufen“ und stehen auch bei Status „Abschluss“ noch da. In den Status-Auswahl bzw. „Mehr“, bei Abschluss gar nicht.
7. **Kontakt: Angaben nur einmal.** Lebenssituation und Interesse stehen in der Terminkarte und in „Angaben zum Lead“; Vorname, Nachname, Telefon, E-Mail wiederholen Titel und Anruf-Knopf. Eine Karte, Kontaktdaten zugeklappt.
8. **Wachstum: Zwischenseite streichen.** „Wachstum“ zeigt drei Karten, die nur weiterleiten, und andere Zahlen als „Zahlen“ (20 Leads im November gegenüber 28 in 30 Tagen). Klick auf Wachstum öffnet direkt Zahlen, Budget und Hochrechnung als Karten dort.
9. **Konto & Rechnungen kürzen.** 3.800 px, 11 Karten, 8 blaue Knöpfe, „Vertrag hier kündigen“ als zweites Element der Seite. Kündigen nach unten, die fünf buchbaren Produkte zugeklappt („Weitere Sparte dazubuchen (5)“), Doppeltes (Kollegen empfehlen, Provisionen) nur noch in Einstellungen.
10. **Hilfe, Neuigkeiten, Rechtliches nur einmal.** Hilfe gibt es dreimal (Seitenleiste „KI-Hilfe“, Kopfzeile „Hilfe“, Menü „Hilfe“), Neuigkeiten zweimal (Menü, Einstellungen), Impressum zweimal. Dazu zeigt das Menü bei „Einstellungen“ ein „Neu“ für das ausgeblendete Modul Empfehlungen (`showNewBadge()` prüft `EMPFEHLUNG_MODULE_AVAILABLE` nicht, `src/components/buyer-shell.tsx:410`).

### Heute (`/buyer`)
Bild: `bilder/uebersicht-01-heute.png`. Zweck: wissen, was jetzt zu tun ist. Hauptaktion: Anrufliste starten.

| Was | Wie | Warum |
|---|---|---|
| Anrufen-Knöpfe je Zeile | als Symbol-Knopf, nicht blau | eine Hauptaktion je Seite |
| Vier Zahlen-Kacheln | entfernen | doppeln die Abschnitt-Zähler |
| „Termine vorbereiten“ + „Termine“ | zusammenlegen | gleiche Person zweimal |
| „+1 Tag / +1 Woche“ an jeder Zeile (rund 30 Chips) | in Wischgeste bzw. „⋯“ | Lärm in jeder Zeile |
| „Nächste Tage“ (23 Einträge, meist Wiedervorlagen) | zugeklappt, nur Termine zeigen | gehört nicht zu „jetzt“ |
| Willkommens-Video oben | nach dem ersten Ansehen nur noch im Menü | schiebt die Aufgaben nach unten |
| Leere rechte Spalte „Wählen Sie links eine Aufgabe“ | erst bei Auswahl zeigen, sonst Liste breiter | 40 % leere Fläche |

### Kontakt / Lead-Detail (`/buyer/kontakte/[id]`)
Bilder: `bilder/uebersicht-02-kontakt.png`, `bilder/uebersicht-02b-kontakt-abschluss.png`. Zweck: diesen Kontakt weiterbringen. Hauptaktion: Anrufen.

| Was | Wie | Warum |
|---|---|---|
| „Gewonnen“ / „Verloren“ im Kopf | in Status-Auswahl bzw. „Mehr“; bei Abschluss ausblenden | konkurrieren mit Anrufen, bei Abschluss sinnlos |
| Termin-Karte (Assistent + 4 Angaben) und „Angaben zum Lead“ | zu einer Karte „Das will der Kunde“ | gleiche Angaben zweimal |
| Vorname, Nachname, Telefon, E-Mail | zuklappen („Kontaktdaten“) | stehen schon im Titel und im Anruf-Knopf |
| Vertragszeilen: „Bearbeiten“, „Vertrag gekündigt bzw. storniert“ als lose Links, Mülleimer nur bei 2 von 3 Verträgen | je Vertrag ein „⋯“-Menü rechts; Zeile: oben Produkt, Kennzeichen, Datum, darunter Beitrag, Provision, Bestand | ruhige, gleich aufgebaute Zeilen; am Handy heute 5 Zeilen je Vertrag |
| Kopf-Aktionen (Anrufen, Chat, E-Mail, Termin, Wiedervorlage, Mehr) | so anordnen, dass alles am Desktop in eine Zeile passt und am Handy sauber umbricht; „Termin“ ausblenden, wenn ein Termin steht | „Mehr“ rutscht sonst in eine eigene Zeile |
| „Wiedervorlage“-Knopf und Wiedervorlage-Leiste | ein Element: die Leiste mit Ändern/Erledigt, Knopf nur ohne Wiedervorlage | doppelt; am Handy ist das Datum in der Leiste abgeschnitten („Wiedervorl…“) |
| Termin-Karte am Handy: Datum bricht auf 4 Zeilen | „Vorbereiten“ und „Verschieben“ unter das Datum bzw. „Vorbereiten“ als Link | Platz |
| Abschluss-Karte: „Police erledigt“ blau neben blauem Anruf-Knopf | `secondary` | eine Hauptaktion |
| Dokumente: blauer Hinweis zur Terminvorbereitung + Tabs bei leerer Liste | Hinweis weg (Angebote gehören in den Termin), Tabs erst mit Dateien | Erklärtext statt Ablauf |

### Terminvorbereitung (`/buyer/termine/[id]/vorbereitung`, Ist)
Bild: `bilder/uebersicht-03-terminvorbereitung-ist.png`. Wird durch den Entwurf in Teil 2 ersetzt. Die größten Probleme heute:
- Zwei blaue Knöpfe („Vorbereitet“, „Bestätigt“), „Präsentation“ nur als Nebenknopf, obwohl sie das Ziel der Seite ist.
- „Im Termin klären“ (8) und die drei Karten darunter („Für alle Sparten“, „Allianz-Rechner Hausrat“, „… Rechtsschutz“) zeigen dieselben offenen Punkte zweimal, dazu „Aus dem Leadformular“ ein drittes Mal.
- Angebots-Tabelle zum Abtippen von 9 Merkmalen × 3 Stufen; Merkmalnamen in zweizeiligen Feldern abgeschnitten (`angebote-editor.tsx:265–267`), Tarifnamen in den Stufen-Feldern gekappt (`:217`), am Handy sieht man nur eine Stufe (Tabelle scrollt seitlich).
- Am Handy fehlen Datum, Uhrzeit und Art des Termins: `PageHeader` blendet den Untertitel unter 640 px aus (`src/components/buyer-shell.tsx:661`, `hidden sm:block`).
- Zwei Hinweis-Absätze zum Hochladen und Datenschutz über der Tabelle.

### Präsentation (`/buyer/termine/[id]/praesentation`)
Bild: `bilder/uebersicht-04-praesentation-ist.png`. Zweck: im Termin zeigen. Hauptaktion: Weiter/Vollbild.
- „Link für Ihren Kunden“ als eigene Karte mit Erklärsatz → Knopf „Teilen“ neben „Als PDF“.
- „Eigenes Logo auf die Folien bringen“ als Link in der Kopfzeile → einmalig in den Einstellungen bzw. unter „Mehr zum Kunden“ in der Vorbereitung.
- Abgeschnittene Inhalte: siehe Teil 3.

### Zahlen und Wachstum (`/buyer/wachstum`, `/buyer/zahlen`)
Bilder: `bilder/uebersicht-05-wachstum.png`, `bilder/uebersicht-06-zahlen.png`. Zweck: lohnt sich das, wo kann ich drehen. Hauptaktion: keine (Leseseite); Budget ändern als einzige Handlung.

| Was | Wie | Warum |
|---|---|---|
| Wachstum-Zwischenseite | weg, Navigation „Wachstum“ öffnet Zahlen | ein Klick mehr, abweichende Zahlen |
| „Hochrechnung“ (Wachstum-Karte und zugeklappt in Zahlen) | nur in Zahlen | doppelt |
| „Dein Vertriebstrichter“ | „Ihr Vertriebstrichter“ | Vermittler-Oberfläche ist Sie-Form |
| Fünf Kosten-Karten mit je 2–5 Kleintext-Zeilen, „So rechnen wir“ zweimal | je Karte eine Zahl und eine Zeile, Rechenweg hinter einem „So rechnen wir“ | Lesbarkeit |
| „Arbeitsweise: 100 %“ | nur zeigen, wenn unter 100 % (dann als Hinweis mit Link zu den Leads) | ohne Handlung kein Platz |
| „So holen Sie mehr raus“ + Monatsberichte-Absatz | Tipps als eine Zeile mit Knopf; Monatsberichte nur, wenn es einen gibt | Erklärtexte |
| Seitenbreite und Titel-Einzug anders als alle anderen Seiten | gleiche Breite wie der Rest | „gleiche Dinge sehen gleich aus“ |

### Einstellungen, Konto, Kalender (`/buyer/einstellungen`, `/buyer/konto`, `/buyer/kalender`)
Bilder: `bilder/uebersicht-07-einstellungen.png`, `bilder/uebersicht-08-konto.png`, `bilder/uebersicht-09-kalender.png`.

| Was | Wie | Warum |
|---|---|---|
| Konto: „Vertrag hier kündigen“ ganz oben | ans Seitenende | Seltenes nach hinten |
| Konto: 5 Produkte mit je blauem „Produkt buchen“ und 3 Zeilen Text | zugeklappt „Weitere Sparte dazubuchen (5)“, Knöpfe `secondary` | 8 blaue Knöpfe auf einer Seite |
| Konto: Pause-Formular immer offen | Knopf „Pause eintragen“ öffnet das Formular (gleicher Ablauf wie „Ich bin abwesend“) | Seltenes |
| Konto: Kollegen empfehlen, Meine Provisionen | nur in Einstellungen | doppelt |
| Konto: „Ihre Daten herunterladen“ (5 Zeilen Text) | ein Satz plus Knopf | Hinweistexte höchstens ein Satz |
| Einstellungen: „Bestandskunden“ | in die Navigation bzw. unter Wachstum | Arbeitsbereich, keine Einstellung |
| Einstellungen: „Rückmeldung an Meta“ | unsichtbar, immer an (Admin) | interne Technik |
| Einstellungen: „Neuigkeiten“, „Kollegen empfehlen“, Rechtliches | nur im Profilmenü | doppelt |
| Kalender: 15 Zeilen Einzelzeiten (je Tag 3 Slots à 30 Min.) | Zeitfenster je Tag („10–17 Uhr“) plus Termindauer | 75 Felder für eine Entscheidung |
| Kalender: „Zeit blockieren“ und Menü „Ich bin abwesend“ | ein Ablauf | doppelt |
| Kalender: Buchungsseite mit gelber Warnung vor „Kalender verbinden“ | Reihenfolge tauschen, Warnung weg | erst verbinden, dann teilen |

### Navigation und Profilmenü
Bilder: `…/scratchpad/ux/10-menue-desktop.png`, `10-menue-phone.png`.
- Hilfe dreimal (Seitenleiste, Handy-Kopf, Menü) → Seitenleiste bzw. Handy-Kopf, aus dem Menü raus.
- Menü hat 9 Einträge plus 3 Links; „Einführung ansehen“, „Neuigkeiten“, „Etwas unklar? Feedback“ unter einen Punkt „Hilfe & Neues“.
- „Benachrichtigungen im Browser gesperrt“ mit Erklärsatz im Menü → nur ein Punkt „Benachrichtigungen“, Erklärung erst beim Antippen.
- Kalender ist nur über Einstellungen erreichbar; die nächsten Termine stehen auf Heute. Passt, solange „Nächste Tage“ dort bleibt (Punkt oben: zugeklappt, nicht gelöscht).
- „Neu“-Markierung bei Einstellungen für ein ausgeblendetes Modul: Fehler, siehe Punkt 10.

---

## Teil 2: Entwurf neue Terminvorbereitung

Klickbarer Entwurf: `docs/ux/terminvorbereitung-entwurf.html` (im Browser öffnen; oben „Ansicht als Allianz-Vertreter / Makler“
nur für den Entwurf). Tokens aus `src/app/globals.css`, Folie mit dem CSS aus `src/lib/praesentation.ts`.
Bilder: `bilder/20-entwurf-terminvorbereitung-desktop-ganz.png`, `bilder/20-entwurf-terminvorbereitung-phone-ganz.png`,
`bilder/21-entwurf-angebot-wird-gelesen-desktop.png`, `bilder/22-entwurf-beitraege-uebernommen-phone.png`,
`bilder/23-entwurf-makler-katalog-merkmal-getauscht-desktop.png`, Vergleich alt/neu `bilder/uebersicht-20-entwurf-terminvorbereitung.png`.

**Wer, wann, eine Aufgabe:** Der Vermittler öffnet die Seite am Vortag oder 5 Minuten vor dem Termin, oft am Handy, und muss
in 30 Sekunden wissen: Wer ist das, was will er, was muss ich noch fragen, und dann mit einem Klick präsentieren.
**Wo es hingehört:** ersetzt die heutige Seite komplett (gleiche URL). **Was wegfällt:** drei Rohdaten-Karten, Formular-Karte,
Angebots-Tabelle zum Abtippen, Bestätigen-Knopf, PDF-Knopf und Hinweistexte (PDF und Rohdaten unter „Mehr zum Kunden“).

### Aufbau
1. **Kopf:** Name, Termin als Chips (Datum und Uhrzeit, Telefon bzw. Video mit Nummer, Produkt), auch am Handy sichtbar.
   Rechts **„Präsentation öffnen“** (einzige blaue Aktion), daneben schlicht „Als vorbereitet markieren“. Am Handy beides in
   einer festen Leiste über der Navigation.
2. **Das will der Kunde:** 3 bis 5 Punkte in Alltagssprache aus Formular und Chat (KI-Zusammenfassung), Quelle in einer Zeile.
3. **Noch klären im Termin:** höchstens 5 offene Punkte als Häkchenliste (zusammengeführt und ohne Doppelungen), im Termin
   abhakbar, Zähler zählt runter.
4. **Angebote** (Tarifkatalog statt Hochladen, Ole 15.11.2026):
   - Sparten-Reiter, vorausgewählt aus dem Formular (Lead wählte Hausrat und Rechtsschutz → beide Reiter mit Tarifen), je
     Reiter der Beitrag der Empfehlung oder „Beitrag fehlt“; „+ Sparte“ für die übrigen Privatschutz-Sparten.
   - Je Sparte sind 3 Katalogtarife vorgewählt (Vertreter: die mittleren Stufen seiner Gesellschaft, Stern in der Mitte, wie
     der Leitfaden es empfiehlt: `termin-vorbereitung.ts:205`). Je Tarif eine kompakte Karte: Gesellschaft, Tarif, Stand,
     **Beitrag** (Monat/Jahr), Stern „Empfehlung“ (genau einer je Sparte), Schalter „In Präsentation“ (Standard an),
     Bausteine an/aus mit Preis.
   - „Angebot ablegen“ (optional, Ziehen und Ablegen bzw. am Handy Datei oder Foto, mehrere PDFs): Die KI liest nur Beiträge
     und Bausteinpreise und ordnet sie den Katalogtarifen zu, Fortschritt an der Datei, kein weiterer Klick, kein Formular.
   - **Merkmale auf der Folie 5 von 5**: aus „Meine Merkmale“ (Einstellungen je Produkt) bzw. sinnvollem Standard,
     gleich für alle Tarife einer Sparte. Weitere Merkmale zugeklappt; ein Klick tauscht gegen das letzte (Toast mit
     Rückgängig). Nie mehr als die Grenze, also wird nichts abgeschnitten. **Bausteine auf der Folie 2 von 2** gleich.
   - „Tarife ändern“ (zugeklappt): Suche, Gesellschaften (Vertreter: nur seine, fest; Makler: Gesellschaften wählen, dann
     Tarife), höchstens 3 wählbar, „Tarif fehlt? Eigenen Tarif anlegen“ (von Hand oder PDF, KI füllt das Merkmal-Schema vor,
     nur für ihn sichtbar, Ole kann ihn in den Katalog übernehmen).
   - **Live-Vorschau** der Vergleichsfolie rechts (am Handy darunter), ändert sich bei jeder Eingabe; darunter „Empfehlung
     gesamt“. Kein Speichern-Knopf: „Automatisch gespeichert“.
5. **Mehr zum Kunden** (zugeklappt): Kontakt, Formular, bestehende Verträge, Chat-Auszug, erbetene Unterlagen, PDF, Logo-Hinweis.

### Grenzen für die Vergleichsfolie (gemessen, nicht geschätzt)
Gemessen mit `folien()` aus `src/lib/praesentation.ts` (72 Varianten: 2 bis 4 Tarife, 3 bis 6 Merkmale, 0/2/4 Bausteine,
kurze und lange Tarifnamen) in Chromium bei 1280 × 720; Grenze ist der Beginn der Fußzeile (y = 671 px, die Folie hat
`overflow:hidden`). Zeile 44 px, Tabellenkopf 152 px (einzeiliger Tarifname), Bausteinzeile 99 px (2) bzw. 187 px (4).

| 3 Tarife, einzeilige Namen | 0 Bausteine | 2 Bausteine | 4 Bausteine |
|---|---|---|---|
| 4 Merkmale | 498 | 597 | 685 ✗ |
| 5 Merkmale | 542 | **641** | 729 ✗ |
| 6 Merkmale | 586 | 685 ✗ | 773 ✗ |

Mit 4 Tarifen passen bei 2 Bausteinen nur 4 Merkmale (5 Merkmale: 664 ✗), mit dreizeiligen Tarifnamen nur 4 (699 ✗).

**In der App ist es enger:** Dort erbt die Folie die Zeilenhöhe 1,5 der App (gemessen 28,5 px statt normal), der Kopf
wird 172 statt 152 px, jede Zeile 50 statt 44 px, und mit 2 Bausteinen passen nur 4 Merkmale (5: 694 ✗). Ansicht in der
App, Kundenlink und PDF sind heute also unterschiedlich hoch.

**Vorschlag:** `.slide { line-height: 1.2 }` in `praesentationCss` (eine Zeile, dann sehen App, Kundenlink und PDF gleich
aus) und damit die Grenzen **3 Tarife, 5 Merkmale, 2 Bausteine** je Vergleichsfolie, Tarif-Kurzname einzeilig. Ohne die
Zeilenhöhe wären es 4 Merkmale. Der Entwurf rendert mit dieser Zeilenhöhe: 653 px bei 5 Merkmalen und 2 Bausteinen.

### Kurzformen statt „…“
- Tarif-Kurzname höchstens 18 Zeichen (≈ 270 px Spaltenbreite bei 24 px fett), ohne Spartenwort („Komfort“, nicht
  „Hausrat Komfort“, die Folie heißt schon „Ihre Auswahl: Hausrat“).
- Merkmal-Kurzname höchstens 28 Zeichen (Spalte 28 % bei 19 px), Wert höchstens 16 Zeichen („unbegrenzt“ statt „unbegrenzt
  bis Wiederbezug“).
- Im Katalog stehen die Kurzformen fest im Schema (keine KI im Termin). Nur bei eigenen Tarifen schlägt die KI Kurzformen vor,
  der Vermittler sieht sie in der Karte. Nie hart kürzen; passt etwas trotzdem nicht, eine Schriftstufe kleiner, nie abschneiden.
- Eine Prüfung im Test: `folien()` mit Höchstwerten rendern und sicherstellen, dass nichts unter die Fußzeile ragt
  (Playwright, wie in diesem Dokument gemessen).

---

## Teil 3: Wo die Präsentation heute abschneidet

Gemessen an der echten Präsentation (Demo-Termin Verena Martin, Allianz-Angebote Hausrat 3 Stufen, Rechtsschutz 2 Stufen),
Bilder `bilder/04-folie-ist-05.png`, `bilder/04-folie-ist-06.png`, `bilder/uebersicht-folien-abgeschnitten.png`.

| # | Befund | Stelle | Vorschlag |
|---|---|---|---|
| 1 | Vergleichsfolie Hausrat: Inhalt reicht bis y = 1006 px bei 720 px Folie. „Phishing …“ liegt über der Fußzeile, „Hotelkosten“ und die ganze Bausteinzeile sind unsichtbar. | `src/lib/praesentation.ts:202` (`anders.slice(0, 6)`), `:208` (Bausteinzeile ohne Grenze), `:67` (`overflow:hidden`) | 5 Merkmale, 2 Bausteine, Eingabe begrenzt mit Zähler |
| 2 | Empfehlungsfolie: Stufen-Umschalter schneidet Tarifnamen ab („Hausrat Premium inkl.“, „Rechtsschutz Smart Privat, Beruf,“). | `praesentation.ts:127` (`.stufen` overflow hidden), `:128` (`.st` `white-space:nowrap`) | Tarif-Kurzname ≤ 18 Zeichen |
| 3 | „In allen Tarifen: Versicherungssumme (Neuwert, ohne Unterversicherungsverzicht: 65.000 €“: schließende Klammer fehlt, weil der Merkmalname beim Speichern auf 60 Zeichen gekappt wird. | `src/lib/angebote.ts:88` (`str(r.name, 60)`), ebenso `:89` Wert 40, `:113` Tarif 80, `:78` Baustein 60, `:57` Listen 160 | Kurzname aus dem Katalog bzw. KI-Kurzform; nie mitten im Wort kappen |
| 4 | Langer Tarifname macht den Tabellenkopf dreizeilig (+58 px), dadurch fallen Zeilen unten raus. | `praesentation.ts:210` | wie 2 |
| 5 | Stufen über 4 werden ohne Hinweis weggelassen. | `praesentation.ts:343` und `:389` (`slice(0, 4)`) | höchstens 3 wählbar, 4. Tarif im Katalog ausgegraut mit „höchstens 3 auf einer Folie“ |
| 6 | „In allen Tarifen“ zeigt höchstens 5 Punkte, kann zweizeilig werden und schiebt die Tabelle. | `praesentation.ts:206` (`slice(0, 5)`) | höchstens 3, Kurznamen |
| 7 | Empfehlungsfolie: je Sparte 3 bzw. 5 Leistungen, 2 Bausteine, 2 „ohne“ + 2 Ausschlüsse, alles still gekürzt. | `praesentation.ts:350–361` | gleiche Zähler-Logik in der Vorbereitung, damit der Vermittler sieht, was auf der Folie steht |
| 8 | Situationsfolie und Risiko-Kacheln kürzen still auf 4. | `praesentation.ts:294`, `:311` | in Ordnung, da aus „Das will der Kunde“ (max. 5) |
| 9 | Ansicht in der App rendert höher als PDF (Zeilenhöhe 1,5 geerbt). | `praesentation.ts:66` (`.deck` ohne `line-height`) | `.slide{line-height:1.2}` |
| 10 | Vorbereitung: Tarif- und Merkmalnamen in den Eingabefeldern abgeschnitten, am Handy nur 1 Stufe sichtbar. | `src/app/buyer/termine/[id]/vorbereitung/angebote-editor.tsx:217`, `:265–267`, `:209` | entfällt mit dem Katalog |

---

## Teil 4: Tarifkatalog

### Datenmodell (Vorschlag, Prisma-Stil)

```prisma
/// Produkt wie im Lead (Privatschutz, Katze, Hund, Pferd …)
model KatalogProdukt {
  id      String         @id @default(cuid())
  key     String         @unique // "privatschutz", "katze", "hund"
  name    String
  sparten KatalogSparte[]
}

/// Sparte (Line) mit eigenem Merkmal-Schema; gleiche Zeilen für alle Tarife der Sparte
model KatalogSparte {
  id          String           @id @default(cuid())
  produktId   String
  produkt     KatalogProdukt   @relation(fields: [produktId], references: [id])
  key         String           // "hausrat", "tierhalterhaftpflicht_hund"
  name        String
  formularMatch String?        // Wert im Leadformular, z. B. "Hausrat" (Vorauswahl in der Vorbereitung)
  sortierung  Int              @default(0)
  merkmale    MerkmalSchema[]
  bausteine   BausteinSchema[]
  tarife      Tarif[]
  @@unique([produktId, key])
}

model MerkmalSchema {
  id          String        @id @default(cuid())
  sparteId    String
  sparte      KatalogSparte @relation(fields: [sparteId], references: [id])
  key         String        // "grobe_fahrlaessigkeit"
  name        String        // lang, für Vorbereitung
  kurzname    String        // ≤ 28 Zeichen, für die Folie
  typ         String        // ja_nein | betrag | prozent | text
  standardRang Int?         // Platz in der Standardauswahl (1–5), null = nur unter „Weitere“
  @@unique([sparteId, key])
}

model BausteinSchema {
  id          String        @id @default(cuid())
  sparteId    String
  sparte      KatalogSparte @relation(fields: [sparteId], references: [id])
  key         String
  kurzname    String        // ≤ 20 Zeichen
  standardRang Int?
  @@unique([sparteId, key])
}

model Gesellschaft {
  id         String  @id @default(cuid())
  name       String  @unique // "Allianz", "Uelzener"
  vertrieb   String  // vertreter | makler | beide
  logoUrl    String?
  tarife     Tarif[]
}

model Tarif {
  id             String        @id @default(cuid())
  sparteId       String
  sparte         KatalogSparte @relation(fields: [sparteId], references: [id])
  gesellschaftId String
  gesellschaft   Gesellschaft  @relation(fields: [gesellschaftId], references: [id])
  name           String        // "Hausrat Komfort"
  kurzname       String        // ≤ 18 Zeichen: "Komfort"
  stufe          Int?          // 1 = Basis … 4 = Premium (Vorauswahl der mittleren 3)
  werte          Json          // { [merkmalKey]: Wert ≤ 16 Zeichen }
  bausteine      Json          // [{ key, standardAn, beitragFest? }] Preis meist kundenabhängig
  leistungen     String[]      // ≤ 5 Kurzsätze für die Empfehlungsfolie
  ausschluesse   String[]
  quelleUrl      String?       // Produktseite bzw. Bedingungen
  stand          DateTime      // Datum der Bedingungen
  status         String        @default("aktiv") // aktiv | eingestellt
  /// Eigener Tarif eines Vermittlers: nur für ihn sichtbar, bis Ole ihn übernimmt
  eigentuemerCustomerId String?
  uebernommenAm  DateTime?
  vorschlaege    KatalogVorschlag[]
}

/// „Meine Merkmale“ je Vermittler und Sparte (Auswahl und Reihenfolge, höchstens die Foliengrenze)
model BeraterMerkmale {
  id          String   @id @default(cuid())
  customerId  String
  userId      String?  // null = für das ganze Team
  sparteId    String
  merkmalKeys String[] // geordnet, ≤ 5
  bausteinKeys String[] // geordnet, ≤ 2
  @@unique([customerId, userId, sparteId])
}

/// Monatliche Quellprüfung und Übernahme eigener Tarife: nichts ändert sich ohne Freigabe
model KatalogVorschlag {
  id          String   @id @default(cuid())
  tarifId     String?
  tarif       Tarif?   @relation(fields: [tarifId], references: [id])
  sparteId    String
  art         String   // neu | geaendert | eingestellt | uebernahme_eigener_tarif
  quelleUrl   String?
  diff        Json     // { merkmalKey: { alt, neu } }
  gefundenAm  DateTime @default(now())
  status      String   @default("offen") // offen | freigegeben | abgelehnt
  entschiedenVon String?
  entschiedenAm  DateTime?
}
```

Je Termin bleibt `Appointment.offersJson`, aber als Schnappschuss: `{ tarifId, kurzname, werte, beitragMonat, zahlweise,
empfohlen, zeigen, bausteine: [{ key, beitrag, an }] }` plus die Merkmal- und Bausteinauswahl der Sparte. So ändert ein
Katalog-Update keine alte Präsentation. `Customer` braucht Vertriebsweg (Vertreter oder Makler) und bei Vertretern die
Gesellschaft (heute nur aus dem Namen geraten: `markeFuer`, `praesentation.ts:17`).

Ablauf Quellprüfung: Monatlich liest ein Job je Tarif `quelleUrl`, die KI vergleicht mit `werte` und legt nur
`KatalogVorschlag`e an; Ole gibt im Admin frei. Eigene Tarife landen als Vorschlag `uebernahme_eigener_tarif`.

### Sparten und Merkmal-Schema (Entwurf; fett = Standard „Meine Merkmale“, höchstens 5)

| Sparte | Merkmale (gleich für alle Tarife) | Bausteine |
|---|---|---|
| Privathaftpflicht | **Deckungssumme**, **Forderungsausfall**, **Schlüsselverlust**, **Deliktunfähige Kinder**, **Mietsachschäden**, Gefälligkeitsschäden, Neuwert, Ehrenamt, Selbstbeteiligung | Beruflicher Schlüssel, Diensthaftpflicht, SB 150 € |
| Hausrat | **Grobe Fahrlässigkeit**, **Fahrraddiebstahl**, **Elementarschäden**, **Wertsachen**, **Online-Betrug**, Versicherungssumme, Diebstahl aus dem Auto, Überspannung, Hotelkosten, Außenversicherung | Fahrrad, Elementar, Glas, SB |
| Rechtsschutz | **Versicherungssumme**, **Selbstbeteiligung**, **Wartezeit**, **Opfer-Rechtsschutz**, **Straf-Rechtsschutz**, Mediation, Telefonberatung, Lebensbereiche | Privat, Beruf, Verkehr, Wohnen |
| Wohngebäude | **Gleitender Neuwert**, **Elementarschäden**, **Grobe Fahrlässigkeit**, **Ableitungsrohre**, **Photovoltaik**, Überspannung, Wärmepumpe, Mietausfall, SB | Elementar, Glas, Photovoltaik |
| Tierhalterhaftpflicht Hund/Pferd | **Deckungssumme**, **Selbstbeteiligung**, **Mietsachschäden**, **Fremdhüten**, **Welpen mitversichert**, Forderungsausfall, Flurschäden (Pferd), Reitbeteiligung (Pferd) | SB |
| Unfall | **Grundsumme**, **Progression**, **Unfallrente**, **Gliedertaxe**, **Bergungskosten**, Krankenhaustagegeld, Kosmetische OP, Zeckenbiss | Rente, Tagegeld |
| Tierkranken Katze/Hund | **Erstattung**, **GOT bis**, **Jahreshöchstleistung**, **Wartezeit**, **Selbstbeteiligung**, Vorsorge-Budget, Zahnbehandlung, Nachbehandlung, Ausland | Vorsorge, Zahn |

Hinweis: Oles Tierhalterhaftpflicht-Liste hat 6 Merkmale; bei Grenze 5 steht Forderungsausfall unter „Weitere“ (ein Klick).

### Geplante Gesellschaften (Vorschlag aus Marktkenntnis, vor dem Katalogaufbau prüfen)
- **Katze und Hund (Tierkranken, OP):** Allianz, AXA, SIGNAL IDUNA (Vertreter); Makler: Uelzener, PetProtect, Barmenia,
  HanseMerkur, Agila, Helvetia, Gothaer, DA Direkt. Prüfen: Barmenia und Gothaer sind fusioniert (Barmenia Gothaer),
  Tarife ggf. getrennt weiterführen; Figo und Petolo als weitere Kandidaten.
- **Privatschutz** (je Sparte Allianz, AXA, SIGNAL IDUNA für Vertreter, dazu für Makler):
  - Privathaftpflicht: Haftpflichtkasse, InterRisk, VHV, NV-Versicherungen, Rhion, Gothaer.
  - Hausrat: InterRisk, Haftpflichtkasse, VHV, Ammerländer, Rhion, Helvetia.
  - Rechtsschutz: ARAG, ADVOCARD, ROLAND, D.A.S., Auxilia, ÖRAG.
  - Wohngebäude: Rhion, Ammerländer, Gothaer, Helvetia, InterRisk, VHV.
  - Tierhalterhaftpflicht Hund/Pferd: Haftpflichtkasse, Uelzener, NV-Versicherungen, InterRisk, Rhion.
  - Unfall: InterRisk, Gothaer, Baloise, Stuttgarter, NÜRNBERGER, Haftpflichtkasse.

---

## Fünf Gestaltungsentscheidungen Terminvorbereitung
1. Eine Hauptaktion „Präsentation öffnen“, oben rechts und am Handy fest unten; „Als vorbereitet markieren“ schlicht daneben.
2. Oben nur das, was in 30 Sekunden zählt: Termin-Chips (auch am Handy), „Das will der Kunde“ (≤ 5 Punkte), „Noch klären“ (≤ 5, abhakbar). Alles andere unter „Mehr zum Kunden“.
3. Katalog statt Abtippen: Tarife und Merkmale kommen fertig, vorausgewählt aus dem Formular und den mittleren Stufen; der Vermittler gibt nur Beiträge ein oder legt das Angebots-PDF ab, die KI übernimmt nur Preise.
4. Grenzen aus dem Folienlayout als Zähler in der Eingabe (3 Tarife, „5 von 5“ Merkmale, „2 von 2“ Bausteine), Tausch per Klick mit Rückgängig, Kurznamen aus dem Katalog: Auf der Folie wird nichts abgeschnitten.
5. Live-Vorschau der echten Vergleichsfolie neben den Karten (Handy darunter), Autosave ohne Speichern- oder Bestätigen-Knopf.

## Bilder

Im Repo (`docs/ux/bilder/`, verkleinert auf 256 Farben): Übersichten je Seite (`uebersicht-*.png`), Entwurf (`20-…` bis `23-…`),
abgeschnittene Folien (`04-folie-ist-05.png`, `04-folie-ist-06.png`, `uebersicht-folien-abgeschnitten.png`).

Alle Originale im Scratchpad `/tmp/claude-0/-home-user-kpidashboard-pg/5666182b-f0f3-50fb-a1b4-146b28494aa3/scratchpad/ux/`:
`01-heute-*`, `02-kontakt-*`, `02b-kontakt-abschluss-*`, `03-terminvorbereitung-ist-*`, `04-praesentation-ist-*`,
`04-folie-ist-01…11.png`, `05-wachstum-*`, `06-zahlen-*`, `07-einstellungen-*`, `08-konto-*`, `09-kalender-*`,
`10-menue-*`, `20-…23-entwurf-*`, `uebersicht-*`. Messskripte: `scratchpad/ux-aaf-skripte/`.
