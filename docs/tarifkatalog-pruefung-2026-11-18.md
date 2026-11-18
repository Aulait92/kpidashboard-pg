# Prüfung Tarifkatalog, Nacht 17./18.11.2026

Auftrag: Werte, Bausteine, Tarifnamen und Stufen in `data/tarifkatalog/` gegen offizielle Quellen der Gesellschaften
(Produktseite, Leistungsübersicht, IPID, Bedingungen) prüfen. Keine Preise, keine Änderung am App-Code.
Vergleichsportale wurden nicht als Quelle verwendet.

## Ergebnis in Zahlen

- Tarifdateien im Katalog: 1.014 (ohne Bündel-Dateien), davon vor der Prüfung 907 mit `ungeprueft: true`.
- **Jetzt geprüft: 931 Dateien** (davon 824 in dieser Nacht neu geprüft, Rest war schon vorher geprüft).
- **Korrigiert: 48 Dateien** mit geänderten Werten, Bausteinen, „In allen Tarifen“-Zeilen oder Empfehlung
  (dazu viele ergänzte Quellen und präzisierte Hinweise in `offen`).
- **Weiter ungeprüft: 83 Dateien** in 9 Ordnern, Gründe siehe unten.
- Tests nach jedem Paket: `tarifkatalog-daten` und `tarifkatalog` grün; `vergleichsfolie-passt` (Chromium) für jedes
  gepushte Paket grün. Zwei frühe Läufe des Folientests sind wegen Speichermangels im Container abgestürzt
  („Target crashed“), die Wiederholung lief jeweils durch.

## Vorgehen

1. Alle Quell-URLs jeder Gesellschaft abgerufen (HTML und PDF), Text extrahiert.
2. Jede Zahl in den Werten gegen den Quelltext abgeglichen (fehlende Zahlen einzeln nachgesehen).
3. Jeden Wert „nein“ bzw. „keine“ und jeden Zweifel in `offen` („bitte prüfen“, „vermutlich“, „nicht lesbar“)
   einzeln an der Quelle geprüft. Symboltabellen wurden entschlüsselt (Icon-Klassen im HTML, Zeichensatz-Glyphen
   in PDFs) oder als Bild gerendert und abgelesen.
4. Bei den Prioritäts-Gesellschaften (Allianz bis Nürnberger) wurde jede Datei vollständig durchgesehen; bei der
   alphabetischen Restliste nach Schritt 2 und 3 plus Stichproben an den Tabellen.
5. Geprüft heißt: `ungeprueft` entfernt, `stand` auf 2026-11-18 (bzw. 17.), Prüfvermerk in `offen`.
   Fehlende Werte bleiben leer, „nein“ nur mit Beleg.

## Wichtigste Korrekturen

- **Allianz:** keine Wertänderung; Widerspruch Kinderinvalidität (Tabelle gegen FAQ „Tarif Premium“) in `offen`.
- **AXA:** Krankenhaus M/L Ersatztagegeld „bis 100 € je Tag“.
- **ERGO:** BU Prognose 6 Monate; Zahn „In allen Tarifen“ ohne unbelegtes „Weltweit“.
- **Generali:** Kfz Werkstatt „wählbar, 15 % Nachlass“; Reiserücktritt Jahrespolice; Rente „flexibel“ ohne Beleg entfernt.
- **R+V:** BU „In allen Tarifen“ Infektionsklausel statt nur optionaler steuerfreier Ablaufleistung; KTG Karenz.
- **HUK-COBURG:** Werte „nein“, die in der Tabelle nur ein Strich („keine Angabe“) waren, geleert (BU, Risikoleben,
  ambulant, PKV); Sterbegeld Unfalltod.
- **Debeka:** Hausrat Trickdiebstahl bis 5.000 €.
- **HDI:** Tierhalter Ausland ohne Beleg entfernt, Innovationsgarantie ergänzt.
- **BarmeniaGothaer:** Rente Teilauszahlung, Sterbegeld ohne Gesundheitsprüfung unter 15.000 €.
- **Württembergische:** Zahn Inlays werden wie Zahnersatz erstattet (75/90/100 %), nicht 100 %; Rente Beitragsgarantie
  höchstens 90 %; Grundfähigkeit Nachversicherung und weltweit ergänzt; Krankenhaus Ersatztagegeld; Rechtsschutz
  Empfehlung auf PremiumPlus („Tipp“).
- **Versicherungskammer Bayern:** BU „Stundung 24 Monate“ (nicht auf der Seite) entfernt; Haftpflicht Kompakt
  deliktunfähige Kinder „nein“ statt „optional“; Hausrat „einfacher Diebstahl nein“ ohne Beleg entfernt; Wohngebäude
  Überspannung ergänzt; Reiserücktritt Jahrespolice ohne Selbstbehalt; Sterbegeld Beitragszahlung bis 85;
  Tierhalter gewerbliche Nutzung bis 10.000 € Umsatz.
- **DEVK:** Zahn Aktiv ohne Zahnreinigung (Kreuz in der Tabelle); PKV Ausland „Europa, sonst 2 Monate“.
- **Alte Leipziger:** Kfz compact mit fester Werkstattbindung (nicht optional).
- **Continentale:** Hausrat einfacher Diebstahl nach der Gegenüberstellung (XXL 2.000 €, TOP 5.000 €).
- **NÜRNBERGER:** Unfall Kompakt „ohne Borreliose“ statt „nein“; Zahn Staffel ergänzt (FAQ der Seite).
- **die Bayerische:** Tier-Kranken Physiotherapie 10 Behandlungen; die „7 Behandlungen“ gehören zur Verhaltenstherapie.
- **EUROPA:** Privathaftpflicht Forderungsausfall mit Mindestschaden 2.500/1.500/ohne; Neuwert ergänzt.
- **Hannoversche:** Risikoleben vorgezogene Leistung 100 % laut Bedingungen (110 % nur befristete Aktion).
- **Stuttgarter:** Privathaftpflicht Basis ohne Gefälligkeit, Neuwert, Nebentätigkeit, Mallorca; Neuwert 1.500/3.000 €;
  Zahn Premium KFO „bis 4.000 € (KIG 1–2)“.
- **Adam Riese:** Hund geliehene Sachen ergänzt. **VGH:** Kfz GAP ab Komfort. **PETPROTECT:** Pferd Gelenkchip-Betrag
  ohne abrufbaren Beleg entfernt. **NV:** aktuelle Leistungsübersichten Wohngebäude als Quelle ergänzt.

## Weiter ungeprüft (83 Dateien)

- **LVM (26), Provinzial (21), VHV (8), Die Haftpflichtkasse (5):** Der Test `tests/unit/tarifkatalog-daten.test.ts`
  verlangt dort ausdrücklich `ungeprueft: true` (Ole, 16.11.). Ohne Teständerung nicht entfernbar, daher nicht bearbeitet.
- **Helvetia (12) und Basler (8):** helvetia.de blockt automatische Abrufe („Zugriff nicht erlaubt“ bzw. 504),
  auch die PDFs. Am Bildschirm prüfen.
- **Condor (2):** Produktseite und Broschüren-Links (R+V) liefern ohne Browser nur ein Skript. Vermerk in `offen`.
- **Zurich Kfz (1):** Nur Bedingungen von 2016 abrufbar, die aktuelle Seite (Basis/Top/Premium) ist ohne Browser
  nicht lesbar.

## Bekannte Widersprüche zwischen Quellen (in `offen` vermerkt)

Allianz Kinderinvalidität, Continentale Hausrat Elementar (Seite „immer dabei“, Bedingungen „soweit vereinbart“),
Münchener Verein BU-AU-Klausel und Krankentagegeld-Höchstsatz, SDK Krankentagegeld-Dauer, Hannoversche BU-AU-Dauer,
HDI Tierhalter Jungtiere. Übernommen ist jeweils der Wert der verbindlicheren Quelle (Bedingungen bzw. Tabelle).

## Übersicht je Gesellschaft

„Quellen“ = Zahl der verschiedenen Quell-URLs in den Dateien. „korrigiert“ nennt die Dateien mit geänderten Werten,
Bausteinen, „In allen Tarifen“ oder Empfehlung.

| Gesellschaft (Ordner) | Dateien | geprüft | ungeprüft | korrigiert (Dateien) | Quellen |
|---|---|---|---|---|---|
| adam-riese | 6 | 6 | 0 | tierhalter-hund | 12 |
| advocard | 2 | 1 | 0 | keine | 2 |
| agila | 5 | 5 | 0 | keine | 6 |
| allianz | 31 | 30 | 0 | keine | 57 |
| alte-leipziger | 13 | 13 | 0 | kfz | 35 |
| ammerlaender | 5 | 5 | 0 | keine | 10 |
| arag | 20 | 19 | 0 | keine | 35 |
| auxilia | 1 | 1 | 0 | keine | 3 |
| axa | 25 | 24 | 0 | krankenhauszusatz | 37 |
| barmenia-gothaer | 28 | 27 | 0 | rente, sterbegeld | 49 |
| basler | 8 | 0 | 8 | keine | 28 |
| canada-life | 5 | 5 | 0 | keine | 22 |
| concordia | 24 | 24 | 0 | keine | 26 |
| condor | 2 | 0 | 2 | keine | 3 |
| continentale | 16 | 16 | 0 | hausrat | 34 |
| cosmosdirekt | 11 | 11 | 0 | keine | 15 |
| da-direkt | 14 | 14 | 0 | keine | 33 |
| debeka | 28 | 28 | 0 | hausrat | 57 |
| deurag | 1 | 1 | 0 | keine | 4 |
| devk | 28 | 27 | 0 | pkv, zahnzusatz | 42 |
| dfv | 13 | 13 | 0 | keine | 16 |
| dialog | 9 | 9 | 0 | keine | 19 |
| die-bayerische | 27 | 27 | 0 | hund-kranken, katze-kranken | 70 |
| domcura | 7 | 7 | 0 | keine | 13 |
| envivas | 6 | 6 | 0 | keine | 16 |
| ergo | 23 | 22 | 0 | bu, zahnzusatz | 61 |
| erv | 2 | 2 | 0 | keine | 6 |
| europa | 13 | 13 | 0 | haftpflicht | 31 |
| figo | 4 | 4 | 0 | keine | 7 |
| generali | 23 | 22 | 0 | kfz, reiseruecktritt, rente | 40 |
| getsafe | 8 | 8 | 0 | keine | 19 |
| haftpflichtkasse | 6 | 0 | 5 | keine | 10 |
| hallesche | 7 | 7 | 0 | keine | 20 |
| hannoversche | 6 | 6 | 0 | risikoleben | 20 |
| hansemerkur | 24 | 24 | 0 | keine | 35 |
| hdi | 17 | 17 | 0 | tierhalter-hund, tierhalter-pferd, wohngebaeude | 22 |
| helvetia | 12 | 0 | 12 | keine | 34 |
| huk-coburg | 28 | 27 | 0 | ambulant, bu, pkv, risikoleben, sterbegeld | 32 |
| ideal | 8 | 8 | 0 | keine | 26 |
| inter | 19 | 19 | 0 | keine | 18 |
| interrisk | 10 | 10 | 0 | keine | 24 |
| itzehoer | 13 | 13 | 0 | keine | 27 |
| janitos | 9 | 9 | 0 | keine | 19 |
| lv1871 | 5 | 5 | 0 | keine | 17 |
| lvm | 27 | 0 | 26 | keine | 48 |
| mecklenburgische | 21 | 21 | 0 | keine | 56 |
| muenchener-verein | 24 | 24 | 0 | keine | 49 |
| neodigital | 1 | 1 | 0 | keine | 2 |
| neue-leben | 7 | 7 | 0 | keine | 10 |
| nuernberger | 23 | 23 | 0 | unfall, zahnzusatz | 44 |
| nv | 6 | 6 | 0 | keine | 20 |
| oerag | 1 | 1 | 0 | keine | 6 |
| ostangler | 6 | 6 | 0 | keine | 13 |
| ottonova | 4 | 4 | 0 | keine | 11 |
| petolo | 5 | 5 | 0 | keine | 7 |
| petprotect | 7 | 7 | 0 | pferd-op | 23 |
| provinzial | 22 | 0 | 21 | keine | 44 |
| rhion | 7 | 7 | 0 | keine | 20 |
| roland | 2 | 1 | 0 | keine | 4 |
| ruv | 25 | 24 | 0 | bu, krankentagegeld | 39 |
| s-direkt | 14 | 14 | 0 | keine | 21 |
| santevet | 2 | 2 | 0 | keine | 4 |
| sdk | 7 | 7 | 0 | keine | 17 |
| signal-iduna | 24 | 23 | 0 | keine | 31 |
| standard-life | 2 | 2 | 0 | keine | 9 |
| stuttgarter | 14 | 14 | 0 | haftpflicht, zahnzusatz | 34 |
| sv | 14 | 14 | 0 | keine | 27 |
| swiss-life | 6 | 6 | 0 | keine | 13 |
| uelzener | 11 | 11 | 0 | keine | 28 |
| ukv | 7 | 7 | 0 | keine | 40 |
| universa | 20 | 20 | 0 | keine | 56 |
| verti | 2 | 2 | 0 | keine | 4 |
| vgh | 21 | 21 | 0 | kfz | 30 |
| vhv | 9 | 0 | 8 | keine | 18 |
| vkb | 16 | 16 | 0 | bu, grundfaehigkeit, haftpflicht, hausrat, reiseruecktritt, sterbegeld, tierhalter-hund, tierhalter-pferd, wohngebaeude | 17 |
| volkswohl-bund | 12 | 12 | 0 | keine | 31 |
| vpv | 13 | 13 | 0 | keine | 42 |
| wgv | 18 | 18 | 0 | keine | 29 |
| wuerttembergische | 21 | 21 | 0 | grundfaehigkeit, krankenhauszusatz, rechtsschutz, rente, zahnzusatz | 57 |
| wuerzburger | 8 | 8 | 0 | keine | 25 |
| wwk | 13 | 13 | 0 | keine | 14 |
| zurich | 17 | 15 | 1 | keine | 27 |
