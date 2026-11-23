# Übergabe: Outreach-Kampagne Leyla Huseynova

Stand: 23.11.2026, 10:30 Uhr (Berlin)

Diese Datei ist die Übergabe für die Cold-Mail-Kampagne von Leyla Huseynova
(M.Sc. Architektur, Berlin). Alles, was zum Weiterarbeiten nötig ist, steht hier
oder in `kampagnen/architekten/`.

---

## 1. Worum es geht

Leyla richtet möblierte Wohnungen ein: drei feste Pakete, Festpreis pro Einheit,
Planung von ihr, Montage über feste Partner. Zielgruppen sind Betreiber möblierter
Einheiten (Boardinghäuser, Serviced Apartments, Studentenwohnheime), Bauträger
(Musterwohnungen) und Seniorenresidenzen.

**Der eigentliche Zweck ist nicht Umsatz, sondern das Visum.** Leyla braucht für
ihren Aufenthaltstitel zwei schriftliche Zusagen. Die Kampagne ist der Versuch,
diese Zusagen über Kaltakquise zu bekommen.

### Zwei harte Randbedingungen

**Berufsbezeichnung.** Leyla ist **nicht** in die Architektenliste der
Architektenkammer Berlin eingetragen. Nach § 2 ABKG darf sie die Bezeichnung
„Architektin" nicht führen, auch nicht in Wortverbindungen („Innenarchitektin",
„Architekturbüro") oder in Übersetzung. Erlaubt ist allein die Angabe des
Abschlusses: „Architektur studiert", „M.Sc. Architektur". Die ersten 127 Mails
gingen mit „Ich bin Architektin mit Master" raus, bevor das auffiel; seit dem
19.11. ist der Text korrigiert und alle Routinen enthalten das Verbot ausdrücklich.
Das Risiko ist zivilrechtlich (Abmahnung nach § 5 UWG), nicht bußgeldbewehrt: im
Berliner ABKG gibt es keine Bußgeldvorschrift, die Berufsgerichtsbarkeit gilt nur
für Mitglieder. Das Verbot selbst steht trotzdem.

**Gewerblich oder freiberuflich.** Für § 21 Abs. 5 AufenthG (freiberufliche
Tätigkeit) genügt nach der Seite der LEA Berlin eine unverbindliche
Absichtserklärung. Leylas Modell ist aber mit Festpreis inklusive Möbelbeschaffung
und Montage strukturell **gewerblich**, also § 21 Abs. 1, und dort gibt es diesen
einfachen Weg nicht. Genau das, was das Angebot verkäuflich macht, wirft sie aus
der einfachen Visumsvariante. Eine Umstellung auf reine Planung auf Honorarbasis
würde das lösen. **Das ist ungeklärt und sollte vor weiterem Aufwand mit einem
Fachanwalt für Migrationsrecht oder direkt bei der LEA geklärt werden**
(Erstberatung etwa 150 bis 300 Euro).

---

## 2. Stand der Kampagne

| Kennzahl | Wert |
|---|---|
| Kontakte in der Kampagne (Erstmail raus) | 163 |
| davon Nachfassmail (Mail 2) gesendet | 95 |
| Nachfassmails fällig und noch nicht angelegt | 17 |
| Antworten insgesamt | 13 |
| davon echte Absagen („nein") | 9 |
| davon Autoresponder | 4 |
| **Interessenten** | **0** |
| Warteschlange offen | 10 (alle Erstmails) |
| Pool insgesamt | 1.208 Kontakte |
| davon nach `pruefung.py` sauber offen | 1.160 |

### Die Zahlen sind das Wichtigste an dieser Übergabe

Aus 163 Erstmails und 95 Nachfassmails kam **kein einziger Interessent**. Die
wahre Antwortquote liegt damit unter 1 Prozent. Für zwei Zusagen bräuchte man bei
dieser Quote in der Größenordnung 1.000 bis 2.000 weitere Mails, und der gesamte
restliche Pool trägt rechnerisch etwa eine Zusage.

**Kaltakquise per Mail ist damit kein tragfähiger Weg zu den zwei Zusagen.** Die
Routinen laufen weiter, weil sie nichts kosten, aber die Zusagen müssen aus einem
anderen Kanal kommen (siehe Abschnitt 5).

### Was die Absagen inhaltlich sagen

Ein Muster, das sich durchzieht: **wer baut, möbliert nicht.** Beispiel TIMOWA
Massivhäuser am 18.11.: „Wir benötigen Ihren Service nicht, da wir Einfamilien-
und Doppelhäuser errichten, die nicht eingerichtet werden." Einfamilien- und
Doppelhäuser werden leer verkauft, Genossenschaften vermieten unmöbliert. Die
Zielgruppe, bei der Möblierung zum Geschäft gehört, sind die Betreiber möblierter
Einheiten. Die waren im Pool aber nur mit gut 30 Kontakten vertreten und sind
jetzt fast vollständig angeschrieben. Was im Pool übrig ist, sind 705
Seniorenresidenzen und 266 Bauträger.

### Qualitätsproblem im Pool

Die Firmennamen im Pool kommen aus einem Crawler und sind bei einem großen Teil
der Einträge falsch. `pruefung.py` liest nur Firmenname, Website und Domain und
lässt deshalb strukturell falsche Adressaten durch. Am 20.11. standen unter den
ersten 90 Pool-Kontakten unter anderem ein Vermessungsbüro, ein Abdichtungsbetrieb,
eine Zimmerei, ein Betonwerk, ein Bildungsträger der Bauwirtschaft und mehrere
Baugenossenschaften. Alle hätten die Mail „Sie entwickeln Wohnprojekte in … Wer
richtet Ihre Musterwohnungen ein?" bekommen.

Dafür gibt es jetzt `skripte/titelcheck.py`. Es ruft die echte Webseite des
Kontakts ab und trennt zwei Quellen: **ausgeschlossen** wird nur anhand von
Seitentitel und Meta-Description, also der Selbstbeschreibung; der **positive
Beleg**, dass wirklich Wohnraum erstellt wird, darf aus dem ganzen Seitentext
kommen. Diese Trennung ist nötig, weil eine Prüfung gegen den Fließtext
Fehlalarme erzeugt („maler" steckt in „normalerweise", ein Studentenapartment hat
eine Heizung).

Ergebnis über die obersten 90 Pool-Kontakte: **38 von 90 waren falsche Adressaten,
also 42 Prozent.** Der Pool ist nominell 1.160 Kontakte groß, real nach dieser
Prüfung eher 650 bis 700.

**`titelcheck.py` ist noch nicht in die Entwurfsroutine eingebaut.** Es wurde am
20.11. von Hand angewandt. Das sollte fest in die Routine, sonst hängt die
Qualität jeden Morgen an der Aufmerksamkeit des Agenten (siehe Abschnitt 5).

---

## 3. Offene Warteschlange

10 Einträge, alle Erstmails, Variante „neu". Reihenfolge ist Priorität.
Die Entwürfe liegen in Gmail und werden von der Versandroutine abgearbeitet.

| # | Adresse | Art |
|---|---|---|
| 1 | info@bietigheimer-wohnbau.de | Erstmail |
| 2 | info@bauforum-herrenberg.de | Erstmail |
| 3 | info@baubuero-jung.de | Erstmail |
| 4 | info@langert-bau.de | Erstmail |
| 5 | info@becker-bau.com | Erstmail |
| 6 | info@btb-gmbh.de | Erstmail |
| 7 | info@mm-bau.com | Erstmail |
| 8 | kontakt@born-wohnungsbau.de | Erstmail |
| 9 | info@cardbau.de | Erstmail |
| 10 | info@boevingloh.de | Erstmail |

Bei 6 Mails pro Lauf ist das in zwei Läufen durch.

### Nachträge und Pannen, die man kennen sollte

- **20.11., 16:23 Uhr:** Der Versandlauf brach mitten im Senden ab, weil der
  Worker neu startete. Vier Mails waren raus (fbw-projektbau, bdl-untermain,
  bmb-bochum, owg-wiehl), die Buchführung fehlte. Am 23.11. gegen Gmail
  „Gesendet" geprüft und nachgetragen. Keine Dubletten entstanden.
- **19.11.:** `info@rgs-rostock.de` ging versehentlich raus. RGS Rostock ist eine
  kommunale Wohnungsgesellschaft und gehört zu der Gruppe, die aus dem Pool
  entfernt werden sollte. Schaden gering, gleicher sauberer Text.
- **20.11.:** 29 Nachfassmails wurden an den Fälligkeitsstapel vom 17.11.
  angelegt und gesendet. Mindestens zehn davon gingen an Genossenschaften und
  Bestandshalter, also an strukturell falsche Adressaten. Die Frage, ob man die
  streichen soll, wurde gestellt und ist **unbeantwortet**; die Routine lief
  weiter wie vorgesehen.
- **`service@staytoo.de`** wurde nicht angelegt: an `berlin@staytoo.de` ging am
  3.9. schon eine Mail. Dieselbe Firma über ein zweites Postfach anzuschreiben
  wirkt unaufmerksam.
- **`info@gegefa.de`:** Dort lag eine Antwort vom 14.10. auf eine
  **Initiativbewerbung** („alle Stellen besetzt"). Anderer Thread, einen Monat vor
  dem Outreach, deshalb keine Sperre. Es heißt aber, dass dieselbe Firma im
  Oktober eine Bewerbung und im November ein Verkaufsangebot von derselben
  Adresse bekam. Falls Leyla parallel Bewerbungen laufen hat, sollten die
  Adresslisten gegeneinander abgeglichen werden.

---

## 4. Wie das System funktioniert

### Absender und Regeln

- Absender: `huseynova.leyla1910@gmail.com`
- **Niemals Anhänge.**
- Keine Anrede mit Herr oder Frau, nie aus einem Vornamen geschlossen.
- Keine erfundenen Fakten, nichts, was nicht im Lebenslauf steht.
- Keine Standort- oder Straßenangabe ohne Prüfung im Impressum der Firma.
- Löscht Leyla einen Entwurf, ist das ihre Entscheidung: nicht neu anlegen, nicht
  senden, in der Warteschlange „von Leyla entfernt" eintragen.
- Rechtslage Kaltakquise: B2B-Cold-Mail ohne Einwilligung ist nach § 7 Abs. 2 UWG
  unzulässig. Für E-Mail gibt es kein Bußgeld (§ 20 UWG erfasst nur Telefon), das
  Risiko ist eine Abmahnung in der Größenordnung 300 bis 900 Euro. Jede Mail
  endet deshalb mit einer Abmeldezeile.

### Dateien

Alle unter `kampagnen/architekten/`:

| Datei | Inhalt |
|---|---|
| `daten/kampagne.json` | je Kontakt: email, mail1_am, threadId, messageId, antwort, mail2_entwurf, mail2_am, notiz, mail2_faellig, variante |
| `daten/warteschlange.json` | draftId, email, gesendet_am, variante. Nachfassmails stehen vorne |
| `daten/pool_stark.json` | 1.208 Kontakte: Email, Firma, Segment, Stufe, Opener, Ort, Website |
| `daten/versendet.json` | Adressen, für die schon ein Entwurf angelegt wurde (176) |
| `daten/aussortiert.json` | dauerhaft verworfene Adressen (73) |
| `daten/NIEMALS_ANSCHREIBEN.txt` | Werbewiderspruch, nie wieder anschreiben (7) |
| `daten/Pool_offen.csv`, `daten/Bereits_angelegt.txt` | Sicherungskopien zum Lesen |
| `skripte/pruefung.py` | Qualitätsprüfung, Funktion `mangel(kontakt)`, Rückgabe None wenn sauber |
| `skripte/titelcheck.py` | Webseiten-Prüfung, Funktion `mangel_laut_seite(kontakt)`, noch nicht in der Routine |
| `skripte/bau_anleitung.py` | baut das PDF zur Domain-Einrichtung (braucht reportlab, Interpreter `/usr/local/bin/python3.13`) |
| `vorlagen/Absichtserklaerung_Vorlage.md` | Vorlage für die Zusage, auf dem Wortlaut der LEA aufgebaut |
| `vorlagen/Domain_Setup.md`, `pdf/Anleitung_Domain_und_Postfach.pdf` | Domain, SPF, DKIM, DMARC, Warm-up, Impressum |
| `vorlagen/Mailvorlagen.md` | Mailtexte |
| `vorlagen/Probeplanung.md` | teils überholt, das kostenlose Angebot wurde zurückgezogen |

**Wichtig:** Die Routinen arbeiten nicht auf diesen Repo-Dateien, sondern auf dem
Scratchpad-Pfad
`/tmp/claude-0/-home-user-kpidashboard-pg/2111094c-af39-585d-9649-ab21b643292c/scratchpad/n12b/`.
Dieser Pfad ist flüchtig und steht fest in den Prompts der drei Routinen. Die
Kopie hier im Repo ist der Stand vom 23.11.2026, 10:30 Uhr. **Wird der Scratchpad
geleert, müssen die Dateien von hier zurückkopiert werden, bevor eine Routine
wieder läuft.** Die Entwurfsroutine ist dafür angewiesen, bei leerem Scratchpad
nichts anzulegen und sich zu melden, statt die Liste neu zu bauen.

### Mail 1, aktueller Text

Betreff: `Kurze Frage zur Musterwohnung` wenn Segment „Bauträger",
sonst `Kurze Frage zur Möblierung Ihrer Einheiten`.

```
Guten Tag,

{OPENER}

Ich habe Architektur studiert (M.Sc.) und richte möblierte Wohnungen ein: drei feste
Pakete, Festpreis pro Einheit, Planung von mir, Montage über feste Partner. Aus der
Bauplanung bin ich es gewohnt, mit Handwerkern und Terminen zu arbeiten.

Soll ich Ihnen die drei Pakete mit den Festpreisen schicken?

Freundliche Grüße
Leyla Huseynova

M.Sc. Architektur · Berlin
Tel. 0152 56246004

Passt nicht? Eine Zeile zurück und ich melde mich nicht wieder.
```

### Mail 2, Nachfassmail

Als Antwort im selben Verlauf (`replyToMessageId`), Betreff leer, Gmail setzt das
„Re:" selbst.

```
Guten Tag,

in Bezug auf meine vorherige E-Mail:

Wäre das Thema generell interessant für Sie?
Die Planung könnte ich in wenigen Tagen liefern und direkt mit der Beschaffung beginnen.

Ein kurzes "Ja", "Nein" oder "Erst später relevant" würde mir als Antwort schon reichen.

Danke, dass Sie sich kurz die 10 Sekunden nehmen, um mir zu antworten.

Viele Grüße
Leyla Huseynova

M.Sc. Architektur · Berlin
Tel. 0152 56246004
```

---

## 5. Nächste Schritte

### Blockiert alles andere

1. **Das Blatt mit den drei Paketen und Festpreisen fehlt.** Die Mail verspricht
   es inzwischen 163 Firmen, und der Call-to-Action zeigt direkt darauf. Ohne das
   Blatt läuft jede Antwort ins Leere. Liegt bei Leyla.
2. **Montagepartner.** Die Mail sagt „Montage über feste Partner". Vor einer
   Zusage an einen Kunden sollte eine schriftliche Rahmenvereinbarung mit einem
   Montagebetrieb stehen.
3. **Visumsweg klären** (gewerblich oder freiberuflich, siehe Abschnitt 1).
   Fachanwalt für Migrationsrecht oder direkte Anfrage bei der LEA.

### Für die zwei Zusagen, aussichtsreicher als Kaltakquise

4. **Leyla ruft ehemalige Arbeitgeber und Praktikumsstellen an.** Das ist der
   schnellste realistische Weg zu zwei Unterschriften: dort kennt man sie.
   Bisher nicht begonnen.
5. **15 Berliner Architekturbüros als Auftraggeber für Planungskapazität auf
   Honorarbasis ansprechen.** Deckt sich mit dem freiberuflichen Visumsweg und
   ist der stärkste Akquisekanal für ihr Profil. Bisher nicht begonnen.

### Am System

6. **`titelcheck.py` fest in die Entwurfsroutine einbauen.** 42 Prozent falsche
   Adressaten im Pool sind sonst Dauerzustand. Dazu den Prompt von
   `trig_016THzx8zBUeFqVe96NKTWmA` um einen Schritt zwischen 1 und 2 ergänzen.
7. **Eigene Domain und Postfach.** Die Anleitung liegt als PDF bei Leyla. Sobald
   das läuft: beide Routinen auf den neuen Absender umstellen, Signaturblock
   tauschen, Tagesmenge auf den Warm-up-Plan senken (5 bis 8, dann 12 bis 15,
   dann 24).
8. **Entscheiden, ob Genossenschaften und Bestandshalter aus den laufenden
   Nachfassrunden genommen werden.** Diese Frage ist offen.
9. **Pool-Nachschub.** Mit real 650 bis 700 brauchbaren Kontakten und der
   gemessenen Quote trägt der Pool rechnerisch etwa eine Zusage. Mehr vom
   gleichen hilft nicht; nötig wäre ein Segment, bei dem Möblierung zum Geschäft
   gehört.

### Offene Fragen, die nie beantwortet wurden

- Bis wann müssen die Zusagen vorliegen?
- Welchen Aufenthaltstitel hat Leyla jetzt? Eine Nebentätigkeitserlaubnis nach
  § 21 Abs. 6 AufenthG könnte den ganzen Antrag unnötig machen.
- Woher kommt die Zahl „zwei"? Aus einem Schreiben der LEA, von einem Anwalt oder
  vom Hörensagen?
- Krankenversicherung, Hauptwohnsitz Berlin, Alter über oder unter 45?

---

## 6. Geplante Aufgaben

Drei Routinen betreffen diese Kampagne. Alle drei sind aktiv und feuern in die
Sitzung `session_01J2iSELBvHXfT4rfwMRiQpG`. Zeiten in Europe/Berlin.
(Im Konto laufen weitere Routinen, die mit dieser Kampagne nichts zu tun haben;
die stehen hier nicht.)

### 6.1 Täglich 24 Outreach-Entwürfe für Leyla

- **ID:** `trig_016THzx8zBUeFqVe96NKTWmA`
- **Zeitpunkt:** `CRON_TZ=Europe/Berlin 57 7 * * 1-5`, also Montag bis Freitag 7:57 Uhr
- **Aktiv:** ja
- **Legt nur Entwürfe an, sendet nicht.**

Vollständiger Text:

```text
Lege die nächsten 24 Erstmail-Entwürfe für Leyla an. Regeln wie immer:

ENTWÜRFE, NICHT SENDEN. Das Senden macht die stündliche Versandroutine. Keine Anhänge. Absender huseynova.leyla1910@gmail.com. Keine Anrede mit Herr/Frau, nie aus einem Vornamen geschlossen. Keine erfundenen Fakten. Keine Entwürfe löschen.

ABSOLUT VERBOTEN IM TEXT: das Wort "Architektin", "Innenarchitektin", "Architekturbüro" oder jede andere Wortverbindung mit der geschützten Berufsbezeichnung, auch in Übersetzung. Leyla ist NICHT in die Architektenliste der Architektenkammer Berlin eingetragen und darf die Bezeichnung nach § 2 ABKG nicht führen. Erlaubt ist allein die Angabe des Abschlusses: "Architektur studiert", "M.Sc. Architektur". Den Satzbau unten nicht verändern.

Ordner: /tmp/claude-0/-home-user-kpidashboard-pg/2111094c-af39-585d-9649-ab21b643292c/scratchpad/n12b/
- pool_stark.json: Kontakte mit Email, Firma, Segment, Stufe, Opener, Ort, Telefon, Website
- versendet.json: Adressen, für die schon ein Entwurf angelegt wurde
- aussortiert.json: dauerhaft verworfene Adressen
- NIEMALS_ANSCHREIBEN.txt: Werbewiderspruch, nie wieder anschreiben
- pruefung.py: Qualitätsprüfung, Funktion mangel(kontakt)
- warteschlange.json: draftId, email, gesendet_am, variante

Ablauf:
1. Kandidaten sind Kontakte aus pool_stark.json, die in keiner der drei Sperrlisten stehen UND bei denen pruefung.mangel() None liefert. Nimm die ersten 24 in Pool-Reihenfolge. Importiere die Prüfung mit sys.path.insert und nutze sie, baue sie nicht nach.
2. Zusätzlich gegen Gmail prüfen: Adresse schon unter Entwürfe oder Gesendet, dann überspringen und den nächsten Kandidaten nehmen.
3. Betreff: "Kurze Frage zur Musterwohnung" wenn Segment == "Bauträger", sonst "Kurze Frage zur Möblierung Ihrer Einheiten".
4. Text, nur {OPENER} wird je Kontakt ersetzt, keine Gedankenstriche:

Guten Tag,

{OPENER}

Ich habe Architektur studiert (M.Sc.) und richte möblierte Wohnungen ein: drei feste Pakete, Festpreis pro Einheit, Planung von mir, Montage über feste Partner. Aus der Bauplanung bin ich es gewohnt, mit Handwerkern und Terminen zu arbeiten.

Soll ich Ihnen die drei Pakete mit den Festpreisen schicken?

Freundliche Grüße
Leyla Huseynova

M.Sc. Architektur · Berlin
Tel. 0152 56246004

Passt nicht? Eine Zeile zurück und ich melde mich nicht wieder.

5. Die 24 Adressen in versendet.json nachtragen.
6. Die 24 draftIds HINTEN an warteschlange.json anhängen, je als {"draftId": ..., "email": ..., "gesendet_am": "", "variante": "neu"}. Nachfassmails stehen vorne und haben Vorrang.
7. Sicherungskopien Pool_offen.csv und Bereits_angelegt.txt aktualisieren.

Wenn der Scratchpad leer ist, sag mir das und lege nichts an, statt die Liste neu zu bauen. Wenn der geprüfte Pool unter 24 Kontakte fällt, lege an was da ist und sag mir, dass Nachschub nötig ist, statt auf schwächere Kontakte auszuweichen.

Melde am Ende kurz: Anzahl angelegt, Segmente, wie viele im Pool noch sauber offen sind, wie lang die Warteschlange jetzt ist, und wie viele Erstmails insgesamt gesendet wurden mit wie vielen Antworten. Fällt dir ein Opener auf, der trotz Prüfung falsch oder peinlich wirkt, nenne ihn und lege ihn nicht an. Prüfe außerdem jeden erzeugten Text darauf, dass das verbotene Wort nicht vorkommt, und melde das Ergebnis dieser Prüfung.
```

### 6.2 Nachfassmails für Leyla anlegen

- **ID:** `trig_01BoRPNNJQxGifjMZr6ezhk7`
- **Zeitpunkt:** `CRON_TZ=Europe/Berlin 41 8 * * 1-5`, also Montag bis Freitag 8:41 Uhr
- **Aktiv:** ja
- **Legt nur Entwürfe an, sendet nicht.**

Vollständiger Text:

```text
Nachfassmails anlegen (Mail 2), für alle heute fälligen Kontakte.

Dateien im Ordner /tmp/claude-0/-home-user-kpidashboard-pg/2111094c-af39-585d-9649-ab21b643292c/scratchpad/n12b/
- kampagne.json: email, mail1_am, threadId, messageId, antwort, mail2_entwurf, mail2_am, notiz, mail2_faellig
- warteschlange.json: draftId, email, gesendet_am (die Versandroutine arbeitet sie ab)

Ablauf:
1. Fällig sind Einträge mit mail2_faellig <= heute, leerem mail2_am und antwort ungleich "nein" und ungleich "interessiert".

2. ANTWORTPRÜFUNG, zuerst und sorgfältig. Zwei Wege, beide nötig:
   a) Hole den Thread über threadId.
   b ZUSÄTZLICH UND WICHTIG: Suche in Gmail nach Antworten von der GANZEN DOMAIN, nicht nur von der angeschriebenen Adresse, und nicht nur im Thread. Viele Firmen antworten von einer persönlichen Adresse und eröffnen dabei einen neuen Thread. Beispiel: an info@oberhauser-gmbh.de geschrieben, Antwort kam von e.oberhauser@oberhauser-gmbh.de in einem eigenen Thread. Suche also pro Kontakt mit "in:inbox from:<domain>" und prüfe die Treffer.

   Jede gefundene Nachricht der Firma LESEN und einordnen:
   - Echte Antwort eines Menschen: antwort auf "nein" oder "interessiert" setzen, Notiz mit Absender und Kernsatz. KEINE Nachfassmail. Bei "interessiert" im Abschlussbericht namentlich und deutlich melden, das ist ein Lead.
   - Reine Eingangsbestätigung oder Abwesenheitsnotiz: antwort "autoresponder", Nachfassmail geht trotzdem.

   NIE nach Nachrichtengröße oder Absendername einordnen, immer nach dem gelesenen Text. Eine Eingangsbestätigung sagt nur, dass die Mail angekommen ist. Steht irgendetwas Inhaltliches drin, auch nur "kein Bedarf" oder "wir haben schon jemanden", ist es eine echte Antwort. Im Zweifel als echte Antwort behandeln und keine Nachfassmail anlegen: eine verpasste Nachfassmail kostet nichts, eine Nachfassmail an jemanden, der schon abgesagt hat, kostet Leylas Ruf.

3. Für die verbleibenden Kontakte je einen Entwurf anlegen: Gmail create_draft mit replyToMessageId = messageId, damit es im selben Verlauf landet. Betreff leer lassen, Gmail setzt das Re: selbst. Kein Anhang. Text exakt:

Guten Tag,

in Bezug auf meine vorherige E-Mail:

Wäre das Thema generell interessant für Sie?
Die Planung könnte ich in wenigen Tagen liefern und direkt mit der Beschaffung beginnen.

Ein kurzes "Ja", "Nein" oder "Erst später relevant" würde mir als Antwort schon reichen.

Danke, dass Sie sich kurz die 10 Sekunden nehmen, um mir zu antworten.

Viele Grüße
Leyla Huseynova

M.Sc. Architektur · Berlin
Tel. 0152 56246004

4. Die neuen draftIds VORNE in warteschlange.json einfügen, nicht hinten. Nachfassmails haben Vorrang vor neuen Erstmails, weil sie sich auf eine Mail von vor drei Tagen beziehen und mit jedem Tag schwächer werden.
5. mail2_entwurf mit der draftId füllen und kampagne.json speichern. mail2_am setzt die Versandroutine, nicht du.

Melde am Ende: wie viele Entwürfe angelegt, wie viele wegen echter Antwort gesperrt, jeden Interessenten namentlich, und was die Absagen inhaltlich sagen, falls sich daraus ein Muster über die Zielgruppe ergibt.

Nichts senden. Diese Routine legt nur Entwürfe an.
```

### 6.3 Outreach-Versand für Leyla, stündlich

- **ID:** `trig_01MgsW9mdancaWbpFeJQ3niT`
- **Zeitpunkt:** `CRON_TZ=Europe/Berlin 23 9-17 * * 1-5`, also Montag bis Freitag
  stündlich von 9:23 bis 17:23 Uhr, 9 Läufe am Tag, höchstens 6 Mails je Lauf
- **Aktiv:** ja
- **Diese Routine sendet.**

Vollständiger Text:

```text
Versandlauf: Sende bis zu 6 Mails aus der Warteschlange.

Ordner: /tmp/claude-0/-home-user-kpidashboard-pg/2111094c-af39-585d-9649-ab21b643292c/scratchpad/n12b/
- warteschlange.json: draftId, email, gesendet_am, variante
- kampagne.json: email, mail1_am, threadId, messageId, antwort, mail2_entwurf, mail2_am, notiz, mail2_faellig, variante

Ablauf:
1. Nimm die ersten bis zu 6 Einträge aus warteschlange.json mit leerem gesendet_am. Die Reihenfolge in der Datei ist die Priorität, nicht sortieren.
2. Vor jedem Senden prüfen:
   - Steht die Adresse in kampagne.json mit antwort "nein" oder "interessiert", nicht senden. gesendet_am auf "gesperrt, hat geantwortet" setzen.
   - Ist die Mail schon unter Gesendet, nicht senden, "dublette" eintragen.
3. Sende jede verbleibende per Gmail send_message mit draftId. Niemals Text neu schreiben, niemals Anhänge, immer den vorhandenen Entwurf senden.
4. Ist ein Entwurf nicht mehr vorhanden, weil Leyla ihn gelöscht hat, ist das ihre Entscheidung: nicht neu anlegen, nicht senden, "von Leyla entfernt" eintragen.
5. Buchführung nach jedem Versand, beide Dateien speichern:
   - warteschlange.json: gesendet_am mit Datum und Uhrzeit füllen.
   - Entspricht die draftId einem mail2_entwurf in kampagne.json, dort mail2_am setzen. Das war eine Nachfassmail.
   - Sonst war es eine Erstmail: lege in kampagne.json einen neuen Eintrag an mit email, mail1_am = heute, threadId und messageId aus dem Ergebnis von send_message, antwort leer, mail2_entwurf leer, mail2_am leer, mail2_faellig = heute plus 3 Werktage (Samstag und Sonntag überspringen), und variante = die variante aus dem Warteschlangen-Eintrag, ersatzweise "A". Ohne diesen Eintrag bekommt der Kontakt später keine Nachfassmail, und ohne die variante geht der laufende Texttest kaputt.
6. Zwischen den Mails ein paar Sekunden Abstand, nicht alle sechs in derselben Sekunde.

Ist die Warteschlange leer, sag das kurz und sende nichts. Melde am Ende knapp: wie viele gesendet, davon Erstmails je Variante und Nachfassmails, wie viele übersprungen und warum, wie viele noch offen.

Harte Grenzen: höchstens 6 pro Lauf, keine Mail ohne vorhandenen Entwurf, keine Adresse zweimal, nichts an jemanden, der geantwortet hat.
```

### Was heute, am 23.11., noch nicht ausgeführt ist

Die Sitzung war über das Wochenende unterbrochen. Ausgefallen sind:

- der Versandlauf vom 20.11., 17:23 Uhr
- die Entwurfsroutine vom 23.11., 7:57 Uhr (24 neue Erstmail-Entwürfe)
- die Nachfassroutine vom 23.11., 8:41 Uhr (17 Kontakte wären fällig)
- die Versandläufe vom 23.11., 9:23 und 10:23 Uhr

Die Warteschlange hat noch 10 Einträge, der nächste Lauf arbeitet die ab. Die
beiden Entwurfsroutinen feuern morgen wieder von selbst; wer die 17 fälligen
Nachfassmails nicht einen Tag warten lassen will, muss
`trig_01BoRPNNJQxGifjMZr6ezhk7` einmal von Hand auslösen.
