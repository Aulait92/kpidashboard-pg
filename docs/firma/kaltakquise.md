# Kalt-Mail (Instantly)

Stand 19.11.2026. Verantwortlich: Head of Sales, Prüfung Rechtsanwalt und Datenschutz.

## Beschlüsse von Ole
- Skalieren trotz Abmahnrisiko, weil es sich wirtschaftlich rechnet. Schutzmaßnahmen sind Pflicht (unten).
- Noch keine Kampagne live schalten, bis die neuen Postfächer warm sind und Ole startet.
- Agenten lesen Instantly nur. Kampagnen, Texte, Listen und Postfächer ändert nur Ole oder ein Agent mit seiner Freigabe.

## Schutzmaßnahmen
- Austragungen und Widersprüche sofort und dauerhaft sperren. Löschverlangen: automatisch löschen und im Kontakt
  vermerken (App, `src/lib/vertrieb/art17.ts`); bei Abmahnung keine Auto-Löschung, sondern Ole.
- Domain-Sperre nur für eigene Domains eines Vermittlers, nie für Konzern-Domains (`KONZERN_DOMAINS`).
- Hauptdomain performancegrowth.de nie im Versand.
- Bounces unter 3 %. Alle Sequenzen mit Stopp bei Antwort, höchstens 3 Schritte.
- Mischen vor dem Import: Reißverschluss nach Gesellschaft, darin nach Mail-Domain, Tagesportion mit Obergrenze je
  Ziel-Domain (`src/lib/vertrieb/mischen.ts`). So sieht kein Konzern-Gateway eine Welle.
- Volumen: 60 Postfächer × 30 Mails = bis 1.800 Mails am Tag. Langsam hochfahren.

## Segmente
Signal Iduna läuft am besten (0,9 % positive Antworten), danach Allianz. DVAG, ERGO, AXA kaum Antworten.

## Offene Textbefunde (Entscheidung Ole offen)
- Allianz-Sequenz: Formulierung „für die Allianz … Lead.Now“ kann als Irreführung gelten (§ 5 UWG).
- Tecis-Sequenz: Gedankenstrich und Tippfehler.
- Signatur mit fremdem Namen in DVAG/ERGO-Sequenz prüfen.
- „Erfolgsgarantie“ in der gemischten Kampagne entfernen.

## Was nie ins Repo kommt
Kontaktlisten (CSV), E-Mail-Adressen, Telefonnummern. Diese liegen nur in der App bzw. lokal bei Ole.
