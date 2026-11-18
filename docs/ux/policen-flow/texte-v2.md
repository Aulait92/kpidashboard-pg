# Policen-Strecke v2: finale Texte (freigegeben von Ole am 18.11.)

Bild: docs/ux/policen-flow/mockup-v2.png, Quelle mockup-v2.html. Platzhalter: {Name} = "Herr/Frau Nachname" des Vermittlers, {Firma} = Firma des Vermittlers, {Tag}, {Uhrzeit}, {n}.
Du oder Sie kommt aus dem Lead-Kanal wie bisher.

## 1. Chat-Nachricht (Template mit Flow-Knopf und Quick Reply)
Sie:
Kleiner Tipp für {Tag} 💡
Wenn {Name} Ihre Policen vorab sieht, prüft er/sie schon vor dem Termin, *ob Sie Geld sparen können*: doppelte Verträge, zu teure Tarife, fehlender Schutz. So wird der Termin kürzer und konkreter.
*Meist reicht ein Foto der ersten Seite.* Dauert etwa eine Minute.
Fußzeile: Ihr Termin findet auch ohne Policen statt.
Knöpfe: [📎 Policen senden] [Später]

Du:
Kleiner Tipp für {Tag} 💡
Wenn {Name} deine Policen vorab sieht, prüft er/sie schon vor dem Termin, *ob du Geld sparen kannst*: doppelte Verträge, zu teure Tarife, fehlender Schutz. So wird der Termin kürzer und konkreter.
*Meist reicht ein Foto der ersten Seite.* Dauert etwa eine Minute.
Fußzeile: Dein Termin findet auch ohne Policen statt.

## 2. Flow "Policen senden" (ein Bildschirm, kein data_exchange vor dem Footer-Knopf)
Text: Meist reicht ein Foto der ersten Seite. Gern mehrere Verträge auf einmal.
PhotoPicker: Fotos aufnehmen oder wählen
DocumentPicker: PDFs auswählen
Überschrift: Das passiert mit Ihren Policen / deinen Policen
1. **Nur für Ihren/deinen Termin:** {Name} ({Firma}) speichert sie zur Vorbereitung.
2. **Per KI ausgelesen, damit Ihr/dein Vergleich zum Termin schon fertig ist:** Die Vertragsdaten liest ein KI-Dienst in der EU aus, auch wenn die Policen Gesundheitsangaben enthalten.
   Checkbox, NICHT vorbelegt: Lieber ohne KI: nur speichern  (gesetzt => ki=false)
3. **Beteiligt:** WhatsApp (Meta, Zugriff auch aus den USA) und der Dienstleister performancegrowth.
4. **Jederzeit widerrufbar:** Schreiben Sie / Schreib „Widerruf“, dann wird alles gelöscht.
EmbeddedLink: Datenschutzhinweise
Hinweis: Mit „Zustimmen & senden“ sind Sie / bist du mit den Punkten oben einverstanden.
Footer-Knopf: Zustimmen & senden
Text darunter: Ihr/Dein Termin findet auch ohne Policen statt.

## 3. Bestätigung
✅ Danke, *{n} Dateien sind angekommen.* {Name} sieht sie sich vor {Tag} an und prüft, wo Sie sparen können / du sparen kannst. Bis dahin müssen Sie / musst du nichts weiter tun. Noch eine Police vergessen? Einfach nachsenden.
Fußzeile: Widerruf jederzeit: einfach „Widerruf“ schreiben.
Knopf: [📎 Weitere senden]
Mit ki=false zusätzlich: Alles klar, wir lesen nichts automatisch aus.

## 4. "Später" und Erinnerungen (max. 2, nur mit Opt-in aus der Buchung)
Antwort auf Später: Alles klar, kein Problem. Ihr Termin findet so oder so statt. Ich erinnere Sie höchstens zweimal daran. [Nein, danke]
Erinnerung 1 (24 h später, nur wenn Termin mind. 2 Tage entfernt): Kurze Erinnerung an Ihren Termin am {Tag}: Mit Ihren Policen kann {Name} vorab prüfen, ob Sie Geld sparen können. Meist reicht ein Foto der ersten Seite. [📎 Policen senden] [Nein, danke]
Erinnerung 2 (Vortag 18 Uhr): Morgen um {Uhrzeit} ist Ihr Videotermin. Wenn {Name} Ihre Policen vorher sieht, kann er/sie gezielter vorbereiten. Wenn nicht, auch gut: Sie können sie auch im Termin zeigen. [📎 Policen senden] [Nein, danke]
Fußzeile beider: Kein Interesse? Tippen Sie „Nein, danke“ oder STOP.
Antwort auf Nein/STOP: Alles klar, keine Erinnerungen mehr. Bis {Tag} um {Uhrzeit}!
Du-Form analog.

## Regeln
- "Später" ist weder Einwilligung noch Ablehnung.
- Einwilligung als neue Textversion protokollieren (Text-Hash, Zeitpunkt, ki true/false).
- Keine Aussage "automatisch gelöscht nach 90 Tagen", solange der Löschjob nicht live ist.
- KI-Satz "Vergleich zum Termin schon fertig" nur, wenn das Vergleichsblatt wirklich vor dem Termin entsteht.
- "Ohne KI" nie schlechtreden (kein Dark Pattern).
