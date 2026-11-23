# Eigene Domain und Postfach fuer Leyla

Stand 19.11.2026. Alle zehn geprueften Domains waren frei.

## 1. Domainwahl

EMPFEHLUNG: leyla-huseynova.de

Gruende:
- Kein Rechtsrisiko. Kein "Architekt", "Architektur" oder "Innenarchitektur" im
  Namen. Wortverbindungen mit der geschuetzten Berufsbezeichnung sind nach
  ABKG § 2 mit erfasst, ein Name wie "huseynova-architektur.de" waere also
  genau das Problem, das wir gerade aus den Mails entfernt haben.
- Passt zum Antrag. Sie beantragt einen Titel zur SELBSTSTAENDIGEN Taetigkeit.
  Der Name auf der Domain ist derselbe wie auf den Absichtserklaerungen, der
  Ertragsvorschau und der Anmeldung beim Finanzamt. Das ist stimmig.
- Ueberlebt einen Modellwechsel. Wenn aus "drei Moebelpakete" spaeter
  "Planungsleistungen auf Honorarbasis" wird, und genau dahin zeigt die
  Visumslogik, passt der Name immer noch.

Alternative, falls sie es beschreibend will: moeblierungsplanung.de
Enthaelt "Planung", was die freiberufliche Einordnung stuetzt, und kein
geschuetztes Wort. Nachteil: legt sie auf ein Geschaeftsmodell fest.

Nicht empfohlen: einrichtungsplanung-berlin.de (lang, liest sich wie SEO),
apartment-einrichtung.de (Anglizismus), serielle-moeblierung.de (zu eng).

Weitere freie Kandidaten, falls ihr etwas anderes wollt:
huseynova-einrichtung.de, huseynova-planung.de, moeblierte-einheiten.de,
wohnungen-moeblieren.de, moebliert-einrichten.de

Registrierung geht bei jedem Registrar. Eine .de kostet in der Regel 10 bis 15
Euro im Jahr. Deutsche Anbieter sind fuer .de meist guenstiger als
internationale.

## 2. Postfach

Varianten, Preise als Groessenordnung, sie aendern sich:
- Zoho Mail: kostenloser Tarif fuer ein Postfach auf eigener Domain,
  bezahlte Tarife ab etwa 1 Euro im Monat. Guenstigste serioese Loesung.
- IONOS oder Strato als Paket aus Domain und Postfach: 1 bis 3 Euro im Monat.
- Google Workspace oder Microsoft 365: 6 bis 7 Euro im Monat. Nur sinnvoll,
  wenn sie die gewohnte Gmail- oder Outlook-Oberflaeche braucht.

Adresse: leyla@leyla-huseynova.de
Nicht info@, nicht kontakt@. Eine Einzelperson, die eine persoenliche Mail
schreibt, soll auch persoenlich absenden.

WICHTIG: Das alte Gmail-Postfach nicht loeschen. Die 127 bereits versendeten
Mails und alle laufenden Verlaeufe haengen daran. Es bleibt als Archiv und
Empfangsadresse bestehen, nur neue Erstmails gehen ueber die neue Adresse.

## 3. DNS-Eintraege

Ohne diese drei Eintraege ist der Umzug wirkungslos, die Mails landen dann
schlechter als vorher.

MX: nach Vorgabe des Mailanbieters, kommt aus dessen Anleitung.

SPF, als TXT-Eintrag auf der Hauptdomain, genau ein SPF-Eintrag pro Domain:
  Zoho:   v=spf1 include:zoho.eu -all
  Google: v=spf1 include:_spf.google.com -all
  IONOS:  v=spf1 include:_spf-eu.ionos.com -all
Den include-Teil immer aus der Anleitung des eigenen Anbieters nehmen.

DKIM: Der Anbieter erzeugt den Schluessel im Mailkonto. Er nennt dabei einen
Selector, zum Beispiel "zoho" oder "google". Der Eintrag kommt dann als TXT
auf  <selector>._domainkey  mit dem vom Anbieter gelieferten Wert.
Den Schluessel nicht selbst erfinden, er wird generiert.

DMARC, als TXT auf  _dmarc  :
  v=DMARC1; p=none; rua=mailto:leyla@leyla-huseynova.de
Erst p=none, damit nichts verloren geht. Nach zwei bis drei Wochen ohne
Probleme auf p=quarantine hochsetzen.

Pruefen laesst sich das nach etwa einer Stunde mit jedem DNS-Checker oder
indem man sich selbst eine Mail an ein Gmail-Konto schickt und im Original
nachsieht, ob SPF, DKIM und DMARC auf PASS stehen.

## 4. Warmlaufen, das ist der unbequeme Teil

Eine frische Domain, die sofort 24 Mails am Tag verschickt, landet im Spam.
Das ist kein Detail, das ist der Grund, warum der Umzug kurzfristig die
Geschwindigkeit SENKT.

  Woche 1: 5 bis 8 Mails am Tag
  Woche 2: 12 bis 15 Mails am Tag
  Ab Woche 3: wieder 24

Hilfreich in dieser Zeit: echte Mails an Leute, die antworten. Jede Antwort auf
eine Mail von der neuen Domain verbessert deren Ruf. Die Anrufe bei ehemaligen
Arbeitgebern passen also doppelt: sie bringen Zusagen und sie waermen die
Domain, wenn man den Verlauf per Mail weiterfuehrt.

## 5. Eine Seite Website, bevor die erste Mail rausgeht

Eine Domain ohne Website ist schlechter als keine Domain. Wer die Adresse im
Absender sieht und nachsieht, soll etwas finden.

Minimum auf einer Seite:
- Was sie macht, in drei Saetzen
- Die drei Pakete mit Festpreisen (das Blatt fehlt ohnehin noch)
- Kontakt
- Impressum mit Name, vollstaendiger Anschrift, E-Mail, Telefon.
  Pflicht nach § 5 DDG fuer geschaeftsmaessige Angebote.

Kein Wort "Architektin" oder "Architekturbuero" auf der Seite. Zulaessig:
"Architektur studiert (M.Sc.)".

## 6. Neuer Signaturblock fuer die Mails

Leyla Huseynova
Einrichtung moeblierter Wohnungen
M.Sc. Architektur
[Strasse, PLZ Berlin]
Tel. 0152 56246004
leyla@leyla-huseynova.de
leyla-huseynova.de

Die vollstaendige Anschrift in der Signatur ist kein Pflichtfeld fuer eine
einzelne Mail, hebt aber die Serioritaet deutlich und entkraeftet den
Eindruck eines anonymen Massenversands.

## 7. Was ich uebernehme, sobald das Postfach laeuft

- Versandroutine und Entwurfsroutine auf die neue Absenderadresse umstellen
- Signaturblock in beiden Mailvorlagen austauschen
- Tagesmenge auf den Warmlaufplan setzen, also zunaechst runter auf 5 bis 8
- Die laufenden Verlaeufe weiter ueber das Gmail-Postfach bedienen, damit
  Antworten dort nicht ins Leere laufen

Was Leyla selbst machen muss: Domain kaufen, Postfach anlegen, DNS-Eintraege
setzen, Zahlungsmittel hinterlegen. Daran haengen ihre Zugangsdaten.
