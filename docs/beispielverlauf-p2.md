# Beispielverlauf P2: Strecke nach der Buchung

Erzeugt am 17.11.2026 aus den echten Textfunktionen (`erstanschreibenText`, `terminVorschlagText`, `buchungsText`, `komplettcheckFrage`, `folgefrageText`, `vertragsFrage`, `einladungText`, `bereitlegenListe`, `abschlussText`, `zusageDank`).
Frau Becker, Privatschutz mit Haftpflicht und Hausrat, Familie mit Kindern, Ansprache Sie, Vermittler Herr Kannapinn. Schritte 1 bis 7 zeigen Pfad A (Komplettcheck Ja), danach Pfad B (Nein) und Pfad C (keine Antwort).
Was der Assistent frei formuliert (KI), ist als „Assistent (sinngemäß)“ markiert, alles andere ist fester Text der App.

## 1. Erstanschreiben (v8, Freitext im 24-h-Fenster)

**App:**

> Hallo Frau Becker, danke für Ihre Anfrage zu Haftpflicht und Hausrat 🏠! Ich bin der digitale KI-Assistent von Herrn Kannapinn und kläre kurz ein paar Angaben, damit er Ihnen für Ihre Familie den passenden Schutz zeigen kann.
> 
> Sind Haftpflicht und Hausrat schon irgendwo versichert, oder wäre beides neu?

_Danach die Erstinformation als PDF._

**Frau Becker:** Beides wäre neu.

## 2. Terminvorschlag

**App:**

> Danke! In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was Haftpflicht und Hausrat für Ihre Familie kosten und worauf Sie achten sollten. Passt Ihnen heute um 16 Uhr oder morgen um 10 Uhr?
> 
> _Knöpfe: [Heute 16 Uhr] [Morgen 10 Uhr] [Andere Zeit]_

**Frau Becker:** [Morgen 10 Uhr]

## 3. Buchung (sofort reserviert)

**App:**

> Ihr Videotermin ist gebucht: *Mittwoch, 18.11. um 10 Uhr*.
> Hier ist Ihr Link: https://meet.google.com/abc-defg-hij
> Die Einladung mit Kalendereintrag ist an anna.becker@example.com unterwegs. Falls die Adresse nicht stimmt, schreiben Sie mir einfach die richtige.
> 
> Herr Kannapinn reserviert diese Zeit nur für Sie und bereitet Ihre Beiträge vorab vor. Bitte seien Sie pünktlich dabei, der Link funktioniert direkt im Handy-Browser. Falls doch etwas dazwischenkommt, schreiben Sie mir einfach hier, dann finden wir eine neue Zeit.

_Ohne bekannte E-Mail-Adresse fehlt die Zeile zur Einladung, und als eigene Nachricht folgt:_

**App:**

> Damit ich Ihnen die Einladung mit Kalendereintrag schicken kann: An welche E-Mail-Adresse darf sie gehen?

_Nennt Frau Becker die Adresse, geht die Einladung nach und es folgt: „Danke! Die Einladung mit Kalendereintrag ist an anna.becker@example.com unterwegs. Soll …“ (Komplettcheck)._

## 4. Komplettcheck (nur Ja/Nein-Knopf)

**App:**

> Danke! Soll Herr Kannapinn im Termin auch kurz schauen, ob Sie und Ihre Familie insgesamt gut abgesichert sind und wo Sie vielleicht etwas sparen können? Das dauert nur ein paar Minuten länger.
> 
> _Knöpfe: [Ja, gern] [Nein, danke]_

**Frau Becker:** [Ja, gern]

## 5. Angaben fürs Angebot (Pfad A, eine Frage pro Nachricht)

**App:**

> Super! Damit Herr Kannapinn Ihnen gleich passende Beiträge zeigen kann: Wie lautet Ihr Geburtsdatum?

**Frau Becker:** 14.05.1985

**Assistent (sinngemäß):**

> Wie groß ist Ihre Wohnung ungefähr?

**Frau Becker:** Etwa 95 m²

**Assistent (sinngemäß):**

> Sind Sie im öffentlichen Dienst tätig?
> 
> _Knöpfe: [Ja] [Nein]_

**Frau Becker:** [Nein]

## 6. Bestehende Verträge und Policen-Einladung (nur Pfad A)

**App:**

> Danke! Welche Versicherungen haben Sie und Ihre Familie heute schon? Zum Beispiel Haftpflicht, Hausrat, Unfall, Berufsunfähigkeit, Rechtsschutz, Kfz, Kranken- oder Lebensversicherung und Altersvorsorge. Gern auch mit Gesellschaft.

**Frau Becker:** Kfz bei der Allianz, Unfall bei der HUK und eine Riester-Rente.

**App:**

> Wenn Sie mögen, schicken Sie gern Fotos oder PDFs Ihrer Policen für Sachversicherungen wie Haftpflicht, Hausrat oder Kfz hier in den Chat, dann kann sich Herr Kannapinn vorher einlesen. Sonst schauen wir sie im Termin gemeinsam an.

## 7. Abschluss mit Bereitlegen und Kalenderfrage (Pfad A)

**App:**

> Danke, das schaut sich Herr Kannapinn im Termin mit an.
> 
> Bitte legen Sie zum Termin bereit:
> • Ihre übrigen Policen, falls Sie sie nicht geschickt haben
> • die Geburtsdaten aller Personen, die mitversichert werden sollen
> • Ihre IBAN, falls Sie direkt abschließen möchten
> 
> Die Einladung mit Kalendereintrag habe ich Ihnen an anna.becker@example.com geschickt. *Haben Sie sich den Termin schon im Kalender eingetragen?*
> 
> _Knöpfe: [Ja] [Mache ich gleich]_

**Frau Becker:** [Ja]

**App:**

> Vielen Dank! Ihr Termin mit Herrn Kannapinn am Mittwoch, 18.11. um 10 Uhr ist vermerkt. Bis dahin!

## Pfad B: Komplettcheck „Nein, danke“

**Frau Becker:** [Nein, danke]

**App:**

> Alles klar. Damit Herr Kannapinn Ihnen gleich passende Beiträge zeigen kann: Wie lautet Ihr Geburtsdatum?

_Weitere Angebotsfragen wie oben (eine pro Nachricht). Keine Vertragsfrage. Nach der letzten Antwort:_

**App:**

> Danke, damit sind alle wichtigen Angaben für Herrn Kannapinn notiert.
> 
> Bitte legen Sie zum Termin bereit:
> • die Geburtsdaten aller Personen, die mitversichert werden sollen
> • Ihre IBAN, falls Sie direkt abschließen möchten
> 
> Falls Sie schon eine Haftpflicht- und Hausratversicherung haben: Schicken Sie mir gern ein Foto der Police, dann vergleicht Herr Kannapinn direkt und achtet auf die Kündigungsfrist.
> 
> Die Einladung mit Kalendereintrag habe ich Ihnen an anna.becker@example.com geschickt. *Haben Sie sich den Termin schon im Kalender eingetragen?*
> 
> _Knöpfe: [Ja] [Mache ich gleich]_

Sind beim „Nein“ schon alle Angaben bekannt, kommt der Abschluss sofort mit „Alles klar, damit ist alles Wichtige für Herrn Kannapinn notiert.“ als erstem Satz.

## Pfad C: keine Antwort auf den Komplettcheck (Rückfall nach 1 Std., Mo bis Sa 8 bis 20 Uhr, nur im 24-h-Fenster)

**App (nach einer Stunde):**

> Damit Herr Kannapinn Ihnen gleich passende Beiträge zeigen kann: Wie lautet Ihr Geburtsdatum?

_Antwortet Frau Becker auf die Angebotsfragen, folgt nach der letzten Antwort derselbe Abschluss wie in Pfad B (enge Policen-Bitte, keine Vertragsfrage).
Antwortet sie nicht, bleibt die Angebotsfrage stehen: kein Abschluss, solange Angebotsfragen offen sind._
_Sind schon alle Angaben bekannt, kommt nach einer Stunde direkt der Abschluss:_

> Damit ist alles Wichtige für Herrn Kannapinn notiert.
> 
> Bitte legen Sie zum Termin bereit:
> • die Geburtsdaten aller Personen, die mitversichert werden sollen
> • Ihre IBAN, falls Sie direkt abschließen möchten
> 
> Falls Sie schon eine Haftpflicht- und Hausratversicherung haben: Schicken Sie mir gern ein Foto der Police, dann vergleicht Herr Kannapinn direkt und achtet auf die Kündigungsfrist.
> 
> Die Einladung mit Kalendereintrag habe ich Ihnen an anna.becker@example.com geschickt. *Haben Sie sich den Termin schon im Kalender eingetragen?*

## Policen-Bitte: jeder Lead genau einmal

- Pfad A (Ja), Lead nennt Verträge: Einladung als eigene Nachricht (siehe 6.), im Abschluss dann nur der Bereitlegen-Punkt „Ihre übrigen Policen, falls Sie sie nicht geschickt haben“.
- Pfad A (Ja), aber keine Antwort auf die Vertragsfrage (Rückfall nach 1 Std.; die Vertragsfrage entfällt, die Bitte nicht): im Abschluss „Gern können Sie vorab Fotos oder PDFs Ihrer Policen für Sachversicherungen (z. B. Haftpflicht, Hausrat, Kfz) hier in den Chat schicken, dann schaut Herr Kannapinn sie mit an.“ (mit eingeschalteten Gesundheitsunterlagen ohne die Einschränkung auf Sach).
- Pfad B und C (Nein bzw. keine Antwort): im Abschluss die enge Fassung, nur die angefragte Sparte (siehe oben). Du-Fassung: „Falls du schon eine Haftpflicht- und Hausratversicherung hast: Schick mir gern ein Foto der Police, dann vergleicht Ole direkt und achtet auf die Kündigungsfrist.“
- Keine Bitte: Lead sagt bei der Vertragsfrage „keine Versicherungen“, Gesundheitsprodukt (z. B. Zahn, PKV) bei ausgeschalteten Gesundheitsunterlagen (Art. 9 DSGVO), gelöschter Lead.
- Braucht die Bitte eine Einwilligung (Gesundheitsbezug, Schalter an), geht sie als eigene Nachricht mit Einwilligungsknöpfen direkt vor dem Abschluss.

## Erstanschreiben v8 als Vorlage (nur vorbereitet)

Sie: `Hallo {{1}}, danke für Ihre Anfrage {{2}}! Ich bin der digitale KI-Assistent von {{3}} und kläre kurz ein paar Angaben, damit {{4}} Ihnen {{5}} den passenden Schutz zeigen kann.\n\n{{6}}?`

Parameter für Frau Becker: ["Frau Becker","zu Haftpflicht und Hausrat 🏠","Herrn Kannapinn","er","für Ihre Familie","Sind Haftpflicht und Hausrat schon irgendwo versichert, oder wäre beides neu"]
