# Leitfaden Setter-Call (15 Minuten, Telefon)

Stand 19.11.2026, Fassung 2 (mit Feedback Personas und Red Team). Verfasst: Head of Sales. Für: Ole.
Nur für **neue Inbound-Kontakte** (Buchung über performancegrowth.de/termin). Die 7 offenen Vermittler gehen direkt ins
Beratungsgespräch. Folgeleitfaden: `leitfaden-sales-call.md`.
Belege: `src/lib/offer-pricing.ts` (PRICE_LIST, Zeile 140 Vorauszahlung mit Annahme, 145 keine Gutschrift bei Vorauszahlung,
541 sechs Monate nur auf Nachfrage, START_MAX_DAYS), AGB `docs/rechtstexte/agb-2026-11-15-fassung-2.md` (§ 8 Pause),
`src/lib/unternehmer.ts` (nur Unternehmer). Regeln: Sie-Form, keine Gedankenstriche, keine Versprechen, keine Verknappung.

## 1. Ziel

**Erfolgreich**, wenn fünf Punkte stehen: Budget-Spanne akzeptiert · alle Entscheider benannt und eingeladen · Start
innerhalb von 90 Tagen · Zahlen (Neukunden heute, Wert eines Abschlusses, Ziel) · Ja zum Rahmen „passt es, Auftrag im Termin“.
Dann bucht Ole im Telefonat das Beratungsgespräch (45 Min., Video). **Kein Termin**, wenn Abschnitt 4 zutrifft.

## 2. Ablauf

**Min. 0 bis 1: Rahmen**
> „Hallo Herr/Frau [Name], hier ist Ole Kannapinn von performancegrowth. Danke für Ihre Zeit. Ich will in 15 Minuten
> herausfinden, ob es überhaupt passt. Wenn nicht, sage ich Ihnen das ehrlich, und Sie dürfen genauso ehrlich Nein sagen.
> Passt das für Sie?“

**Min. 1 bis 4: Situation**
> „Wie gewinnen Sie heute neue Kunden, und wie viele kommen so im Monat dazu?“
> „Sind Sie Vertreter, für welche Gesellschaft, oder Makler? Welche Sparten machen Sie vor allem?“
> „Gibt es Vorgaben Ihrer Gesellschaft, wie Sie Interessenten anschreiben dürfen, etwa per WhatsApp, oder welchen Kalender
> Sie nutzen?“
> „Wer ruft bei Ihnen neue Anfragen zurück, und wie schnell schaffen Sie das im Alltag?“
> „Was haben Sie schon ausprobiert, Leads gekauft, Agentur, eigene Anzeigen? Was hat daran nicht gepasst?“
Je nach Typ, falls Zeit: Makler „Mit welchem Verwaltungsprogramm arbeiten Sie?“ · Großagentur „Wie verteilen Sie Anfragen
auf Ihre Berater, und wie viele sind es?“

**Min. 4 bis 6: Ziel und Zahlen**
> „Wo wollen Sie in zwölf Monaten stehen? Wie viele Neukunden im Monat wären ein gutes Ergebnis?“
> „Was bringt Ihnen ein Abschluss im Schnitt?“ (Vertreter: die Abschlussprovision. Makler: die Courtage im Jahr.)
> „Wenn [Zielzahl] Kunden im Monat mehr kommen, was bedeutet das für Sie in Euro im Jahr? Die Zahl nehme ich als Grundlage für
> unsere Rechnung.“

**Min. 6 bis 8: Budget**
> „Damit Sie im Beratungsgespräch nicht vom Preis überrascht werden, sage ich Ihnen die Größenordnung jetzt. Im Minimum sind es
> etwa 1.600 Euro netto im Monat, Werbebudget eingerechnet, Makler eher bei 2.200. Das Werbebudget zahlen Sie direkt an Meta.
> Dazu einmalig die Einrichtung: 990 Euro bei 12 Monaten Laufzeit, ohne Laufzeit 2.490. Kommt diese Größenordnung für Sie
> grundsätzlich in Frage?“
Nur als Fakt, wenn es passt:
> „Wer 12 Monate im Voraus zahlt, zahlt 9 statt 12. Das wird mit dem Auftrag fällig, auch wenn Sie später starten. Monatlich
> geht genauso.“
Bei Frage nach Pause:
> „Bei monatlicher Zahlung können Sie jederzeit pausieren und zahlen dann nur die Software. Wer im Voraus zahlt, kann auch
> pausieren, bekommt dafür aber nichts gutgeschrieben.“
Belege: 1.600 = 990 € Betreuung und Software + 20 € pro Tag Werbebudget; 2.200 = 990 € + 40 € pro Tag (Makler-Empfehlung).
Stufen 990 / 1.390 / 1.790 € bis 3.000 / 6.000 / 10.000 € Werbebudget, darüber individuell. 6 Monate Laufzeit nur auf
ausdrückliche Nachfrage nennen.

**Min. 8 bis 9: Entscheider**
> „Wer muss zustimmen, damit Sie starten können?“
> „Wer im Gespräch dabei ist, kann seine Fragen direkt stellen. Wer sollte das bei Ihnen sein?“
> „Geben Sie mir bitte seine E-Mail, dann lade ich ihn direkt mit ein.“

**Min. 9 bis 10: Start**
> „Wann sollen die ersten Anfragen kommen? Den Start legen Sie selbst fest, bis zu 90 Tage nach dem Auftrag.“

**Min. 10 bis 12: Rahmen für den Auftrag im Termin**
> „Ich schicke Ihnen die Vertragsbedingungen vorab mit der Einladung. Wenn im Gespräch alles passt, können Sie den Auftrag
> direkt dort erteilen, dafür bräuchten Sie Ihre IBAN. Und wenn nicht, sagen Sie Nein. Ist das ein fairer Rahmen?“
Bei Zögern („erst drüber schlafen“):
> „Völlig in Ordnung. Was müssten Sie im Gespräch sehen, um sicher entscheiden zu können? Das bereite ich vor.“

**Min. 12 bis 14: Termin buchen**
> „Passt Ihnen [morgen] um [Uhrzeit] oder lieber [Tag] um [Uhrzeit]? Schaffen Sie die 45 Minuten am Laptop?“
Zwei Zeiten, die erste möglichst morgen, spätestens in 3 Tagen. Im Adminbereich buchen (Termintyp „Beratungsgespräch“),
Mitentscheider direkt einladen. Die Bestätigungsmail enthält ab dem nächsten Deploy: „Bitte laden Sie alle ein, die
mitentscheiden. Wenn es für Sie passt, starten wir direkt im Termin: Halten Sie dafür gern Ihre IBAN bereit.“ Vertragsbedingungen
(AGB) mitschicken.
> „Die Einladung kommt gleich per Mail.“

**Min. 14 bis 15: Zusammenfassen**
> „Kurz zusammengefasst: von [heute] auf [Ziel] Neukunden im Monat, ein Abschluss bringt Ihnen etwa [Wert], Start um den
> [Datum], [Name] ist dabei. Habe ich etwas vergessen? Dann bis [Tag].“

## 3. Einwände

| Einwand | Antwort |
|---|---|
| „Schicken Sie mir einfach Infos.“ | „Schicke ich Ihnen gern. Die Rechnung hängt aber von Ihren Zahlen ab. Darf ich Ihnen dafür zwei Fragen stellen?“ |
| „Was kostet das?“ | Budget-Satz sofort sagen (Min. 6 bis 8), dann: „Ob es sich rechnet, hängt von Ihren Zahlen ab. Deshalb frage ich danach.“ |
| „Ich habe schon eine Agentur / kaufe Leads.“ | „Was läuft da gut, was nicht? Bei uns gehören die Anfragen nur Ihnen, und die Software schreibt sie an und bucht Termine. Ob das besser ist als heute, sehen wir im Gespräch an Ihren Zahlen.“ |
| „Darf ich das als Allianz-Vertreter?“ | „Was Sie dürfen, regelt Ihr Vertrag mit der Allianz, das kann ich Ihnen nicht zusagen. Die App funktioniert auch ohne verbundenes Postfach, mit Ihrem Allianz-Online-Kalender. Fragen Sie Ihre Ansprechperson bitte bis [Tag vor dem Termin] konkret: Darf ich Interessenten, die mich über eine Anzeige anfragen, per WhatsApp und E-Mail über einen externen Dienstleister anschreiben lassen, und darf ich dafür meinen Allianz-Online-Kalender nutzen?“ |
| „Mein Partner hat keine Zeit.“ | „Dann suchen wir einen Termin, an dem er kann, gern auch abends. Geben Sie mir seine E-Mail, dann lade ich ihn direkt ein.“ Kein Termin ohne Entscheider. |
| „Klappt das bei mir überhaupt?“ | „Das kann Ihnen niemand vorher versprechen. Ich zeige Ihnen im Gespräch echte Zahlen und die vertragliche Absicherung. Dann entscheiden Sie.“ |
| „Ich will mich nicht lange binden.“ | „Müssen Sie nicht. Es geht auch ohne Laufzeit, dann ist die Einrichtung höher.“ |
| „Melden Sie sich im neuen Jahr.“ | „Den Start legen Sie ohnehin selbst fest, bis zu 90 Tage. Wollen wir das Gespräch trotzdem jetzt machen, damit es im Januar läuft?“ Sonst Wiedervorlage mit Datum. |

## 4. Höflich absagen

Absagen, wenn: Budget-Spanne klar nicht machbar · nicht selbstständig (AGB gelten nur für Unternehmer, z. B. angestellter
Innendienst) · ein Entscheider kommt grundsätzlich nicht ins Gespräch · Start erst in mehr als 90 Tagen (dann Wiedervorlage)
· Gesellschaft verbietet es nach eigener Aussage ausdrücklich · erwartet feste Abschlüsse · niemand ruft Anfragen zurück.
> „Danke für Ihre Offenheit. So wie Sie es schildern, passt es gerade nicht, und ich will Ihnen keine 45 Minuten nehmen, nur um
> das zu bestätigen. Soll ich mich im [Monat] noch einmal melden?“

## 5. Eintrag im System (Vertrieb in der App)

Aktivität **Anruf**, Notiz:
```
Setter-Call [Datum]
Budget ok: ja / nein / unklar
Entscheider: [Namen, Rolle, E-Mail eingeladen: ja/nein]
Start: [Wunschdatum]
Zahlen: heute [x]/Monat, Ziel [y]/Monat, Wert je Abschluss [z] € (Provision bzw. Courtage im Jahr)
Typ: Vertreter [Gesellschaft] / Makler [Verwaltungsprogramm] / Großagentur [Berater]; Sparten: [..]
Rückruf der Anfragen: [wer, wie schnell]
Vorgaben Gesellschaft: [WhatsApp, Kalender, E-Mail]
Einwand: [wörtlich, kurz]
Rahmen Auftrag im Termin: ja / nein
```
Status **Termin**, sonst **Wiedervorlage** (Aufgabe mit Datum) oder **Verloren** mit Grund. Jeder Kontakt hat einen nächsten
Schritt mit Datum.

## Offen bei Ole (Stufe A)
- Zahlweise im Beratungsgespräch: Vorauszahlung zuerst oder monatlich zuerst (Vorschlag in `leitfaden-sales-call.md`).
- Entscheidungs-Call nach dem Beratungsgespräch standardmäßig aus, sonst sind es drei Termine.
- Abschlussbonus im Setter-Call nur nennen, wenn er mit echter, fester Frist im Angebot steht.
- Nach 10 Setter-Calls Erscheinungs- und Abschlussquote prüfen (Ziel Erscheinen mindestens 80 %).
