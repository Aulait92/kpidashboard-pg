# Meta-Leadformular Kfz (Entwurf, Ole 21.11.2026)

Ziel: wenige Antworten per Tipp, damit der Assistent nach der Buchung weniger fragen muss, ohne Leads zu kosten.
Die App erkennt die Fragen an der Beschriftung (`KFZ_FORMULAR` in `src/lib/whatsapp/produkt-fragen.ts`); was das
Formular liefert, fragt der Assistent nicht noch einmal. Beschriftungen bitte genau so übernehmen (Sie oder Du, je nach
Ansprache des Kunden).

## Felder

| # | Art bei Meta | Beschriftung (Sie) | Beschriftung (Du) | Antworten |
|---|---|---|---|---|
| 1 | Mehrfachauswahl | Worum geht es? | Worum geht es dir? | Versicherung wechseln (jetziges Auto) · Neues Auto versichern |
| 2 | Mehrfachauswahl | Welchen Schutz wünschen Sie? | Welchen Schutz wünschst du dir? | Haftpflicht · Teilkasko · Vollkasko · Weiß ich noch nicht |
| 3 | Vorausgefüllt | Postleitzahl | Postleitzahl | (von Meta) |
| 4 | Vorausgefüllt | Geburtsdatum | Geburtsdatum | (von Meta) |
| 5 | Vorausgefüllt | Vollständiger Name, Telefonnummer, E-Mail | wie links | (von Meta) |

Reihenfolge: erst die beiden Tipp-Fragen (Einstieg ohne Hürde), dann die vorausgefüllten Felder.

## Bewusst nicht im Formular

Führerschein seit, weitere Fahrer, km pro Jahr, Finanzierung, Schäden der letzten 3 Jahre, öffentlicher Dienst: fragt der
Assistent nach der Buchung (je ein Tipp oder eine kurze Antwort). HSN, TSN, SF-Klasse, Versicherer und
Versicherungsscheinnummer kommen aus den Fotos von Fahrzeugschein und letzter Rechnung.

## Später als A/B-Test

Kurze Fassung (oben) gegen eine längere mit „Wie viele Kilometer fahren Sie im Jahr?“ (Auswahl: bis 9.000 · 9.000 bis
15.000 · über 15.000). Messgröße: Kosten je Termin, nicht je Lead.

## Erste WhatsApp (Ole, 21.11.2026)

Die Antwort auf „Worum geht es?“ wählt die Einstiegsfrage im Erstanschreiben (`erstanschreibenZweck`, Zwecke
`outreach_kfz_wechsel`, `outreach_kfz_neu`, ohne Angabe `outreach_kfz`): Wechsel „Wann läuft Ihr jetziger Vertrag aus?“,
neues Auto „Ist das neue Auto schon da?“, sonst „Für Ihr jetziges Auto oder ein neues?“. Die Werte der Antworten
(„Versicherung wechseln (jetziges Auto)“, „Neues Auto versichern“) bitte so lassen, die App erkennt „wechsel“ bzw. „neu“.

## Anzeigen: bessere Kfz-Leads (Ole, 24.11.2026)

Stand 24.11.: Kampagne „PG | Kfz | 2026-11-21“ (40 € am Tag, Deutschland, 20 bis 65, Advantage+), 11 Leads für rund
12 € je Lead; über Kfz und Privatschutz zusammen antworten 40 %, 20 % buchen. Entscheidung Ole: Die Gruppe läuft
weiter, damit die Lernphase nicht neu beginnt; bestehende Anzeigen werden nicht bearbeitet. Zwei neue Anzeigen kommen
als zusätzliche Anzeigen dazu (das hat die Lernphase dieser Gruppe am 22. und 23.11. laut Meta nicht zurückgesetzt).
Messgröße: Kosten je wahrgenommenem Termin, nicht je Lead.

Beide Anzeigen: Formular wie die aktiven Anzeigen (v6, WhatsApp-Nummer), Knopf „Angebot einholen“.

**Anzeige 1 `beitrag-gestiegen | whatsapp`: erst ab 1.12.2026 einschalten** (Ole). Bild wie „foto-rechnung“.

> Kfz-Rechnung für 2027 bekommen und der Beitrag ist gestiegen? Dann können Sie in der Regel noch wechseln, auch nach
> dem 30.11.: einen Monat lang ab Erhalt der Rechnung.
>
> So läuft es: Sie wählen einen kurzen Termin und schicken uns vorab per WhatsApp ein Foto der Rechnung. Im Termin
> zeigen wir Ihnen den Allianz-Beitrag für Ihr Fahrzeug im direkten Vergleich. Sind wir nicht besser, sagen wir es
> Ihnen ehrlich.

Überschrift: „Kfz-Beitrag gestiegen? Jetzt vergleichen“. Rechtlich: Sonderkündigungsrecht bei Beitragserhöhung, ein
Monat ab Zugang der Mitteilung (§ 40 VVG); „in der Regel“ deckt den Fall ab, dass der Beitrag nur wegen eines Schadens
steigt.

**Anzeige 2 `vollkasko-neues-auto | whatsapp`: kann sofort live, mit neuem Bild** (Ole; Motiv neues Auto, Vollkasko).

> Vollkasko für ein neues, geleastes oder finanziertes Auto? Dann zählt nicht nur der Preis, sondern auch, was im
> Schadenfall gezahlt wird.
>
> Wir rechnen den Allianz-Tarif für Ihr Fahrzeug. Im kurzen Termin sehen Sie schwarz auf weiß, was er kostet und was er
> leistet. Ein Foto vom Fahrzeugschein genügt. Sind wir nicht die bessere Wahl, sagen wir es Ihnen ehrlich.

Überschrift: „Vollkasko fürs neue Auto vergleichen“.

**Am 30.11.2026 abends:** Anzeige „Kfz-Wechsel nur bis 30.11.“ ausschalten (ab 1.12. unzutreffend).

Weitere Hebel, noch nicht umgesetzt (erst nach etwa zwei Wochen Ruhe und mit mehr Daten): Formular mit Frage „Was zahlen
Sie heute im Jahr?“ und Formularart „höhere Absicht“; Zielgruppe im Umkreis des Büros gegen Deutschland testen; Meta auf
„Termin gebucht“ statt auf „Formular abgeschickt“ optimieren (Rückmeldung an Meta läuft schon); Anzeige und Dankeseite
erzählen dieselbe Geschichte (Foto schicken, kurzer Termin, Ergebnis).
