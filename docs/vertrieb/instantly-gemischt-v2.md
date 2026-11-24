# Instantly: Versicherungsvermittler (gemischt), Sequenz v2

Stand 24.11.2026. Kampagne „Versicherungsvermittler (gemischt)“, id `268e3c28-2064-467c-aee1-a552a4f7fe0d`.
Neufassung der zweistufigen Sequenz. In Instantly wurde nichts geändert; die Texte unten von Hand in die Kampagne übernehmen.

## Vor dem Einsetzen (Ole)

- `{Leadzahl}`: durch eine belegbare Zahl ersetzen (Export aus CRM/Meta, Stichtag notieren und ablegen). Ohne Beleg den Satz mit der Leadzahl ganz streichen. Auch „seit 2019“ muss belegbar sein.
- `{min}` / `{max}` (nur Variante B): aus echten Kundendaten füllen, z. B. Spanne der monatlichen Anfragen der aktiven Kunden der letzten 6 Monate. Auswertung ablegen. Ohne Daten Variante A nehmen.
- Einfache geschweifte Klammern sind KEINE Instantly-Variablen. Vor dem Speichern muss jedes `{Leadzahl}`, `{min}`, `{max}` durch eine Zahl ersetzt sein.
- `{{personalization}}` muss pro Lead ohne Komma befüllt sein, z. B. „Guten Tag“ oder „Sehr geehrter Herr Müller“. Das Komma steht im Text.
- Optional für die Ansprache: `{{gesellschaft}}` (z. B. im Betreff „Frage an {{gesellschaft}}-Vertreter“). Nur verwenden, wenn die Spalte bei allen Leads befüllt ist, und nie als Referenz („für die X gearbeitet“).
- Preis (ab 990 € im Monat) bewusst nicht in der Kaltmail; gehört ins Video bzw. Erstgespräch.
- Hinweis: Am Text hängt nicht alles. Werbe-E-Mails ohne Einwilligung sind auch im B2B-Bereich nach § 7 Abs. 2 Nr. 2 UWG riskant. Die Fassung unten entfernt die irreführenden Aussagen (§ 5 UWG), ersetzt aber keine Prüfung der Versandgrundlage.

## Schritt 1: Mail 1

Abstand zu Schritt 2: wie bisher 5 Tage.

### Betreff

```
{{RANDOM | Termine statt nur Kontaktdaten | Kurze Frage zu Ihrer Neukundengewinnung | Neue Beratungstermine für Ihre Agentur | Kurze Frage zu Ihren Terminen}}
```

### Mail 1, Variante A (ohne Zahlen, empfohlen solange keine Daten vorliegen)

```html
<div>{{personalization}},<br /><br /></div><div>{{RANDOM | Die meisten Leadanbieter liefern Kontaktdaten. Wir liefern Beratungstermine direkt in Ihren Kalender. | Viele Anfragen gehen verloren, weil niemand schnell genug zurückruft. Genau dort setzen wir an. | Wir helfen Versicherungsvermittlern, aus Anfragen schnell echte Beratungstermine zu machen.}}</div><div><br />{{RANDOM | Wir gewinnen exklusive Interessenten über Meta-Anzeigen. Ein WhatsApp-Assistent schreibt jeden innerhalb weniger Minuten an, klärt den Bedarf und bucht den Termin direkt bei Ihnen ein. | Exklusive Interessenten aus Meta-Anzeigen werden innerhalb weniger Minuten per WhatsApp angeschrieben, qualifiziert und direkt in Ihren Kalender gebucht. Alles läuft in einem CRM zusammen.}}</div><div><br />{{RANDOM | Seit 2019 haben wir über {Leadzahl} Leads für Versicherungsvermittler gewonnen. | Für Versicherungsvermittler haben wir seit 2019 über {Leadzahl} Leads gewonnen.}}</div><div><br />{{RANDOM | Darf ich Ihnen in einem kurzen Video (5 Minuten) zeigen, wie das konkret abläuft? | Soll ich Ihnen das kurze Video zum Ablauf schicken? | Darf ich Ihnen den Ablauf in einem kurzen Video schicken?}} Ein kurzes „Ja“ reicht mir.</div><div><br />Viele Grüße<br /><br />Ole Kannapinn<br />Gründer &amp; Geschäftsführer</div><div><br />performancegrowth | Ole Kannapinn UG (haftungsbeschränkt)<br />Lorenzstraße 58, 12209 Berlin<br />Sitz Berlin · Amtsgericht Berlin-Charlottenburg · HRB 172651<br /><a href="https://performancegrowth.de/" target="_blank">performancegrowth.de</a></div><div><br />Falls das kein Thema für Sie ist, genügt eine kurze Antwort, dann melde ich mich nicht mehr.</div>
```

### Mail 1, Variante B (mit belegten Zahlen {min}/{max})

Identisch zu A, mit einem zusätzlichen Absatz nach dem WhatsApp-Absatz.

```html
<div>{{personalization}},<br /><br /></div><div>{{RANDOM | Die meisten Leadanbieter liefern Kontaktdaten. Wir liefern Beratungstermine direkt in Ihren Kalender. | Viele Anfragen gehen verloren, weil niemand schnell genug zurückruft. Genau dort setzen wir an. | Wir helfen Versicherungsvermittlern, aus Anfragen schnell echte Beratungstermine zu machen.}}</div><div><br />{{RANDOM | Wir gewinnen exklusive Interessenten über Meta-Anzeigen. Ein WhatsApp-Assistent schreibt jeden innerhalb weniger Minuten an, klärt den Bedarf und bucht den Termin direkt bei Ihnen ein. | Exklusive Interessenten aus Meta-Anzeigen werden innerhalb weniger Minuten per WhatsApp angeschrieben, qualifiziert und direkt in Ihren Kalender gebucht. Alles läuft in einem CRM zusammen.}}</div><div><br />{{RANDOM | Unsere Kunden erhalten je nach Region und Werbebudget meist {min} bis {max} Anfragen im Monat. Wie viele daraus Abschlüsse werden, hängt von Ihrer Beratung ab. | Je nach Region und Werbebudget sind es bei unseren Kunden meist {min} bis {max} Anfragen im Monat. Wie viele daraus Abschlüsse werden, hängt von Ihrer Beratung ab.}}</div><div><br />{{RANDOM | Seit 2019 haben wir über {Leadzahl} Leads für Versicherungsvermittler gewonnen. | Für Versicherungsvermittler haben wir seit 2019 über {Leadzahl} Leads gewonnen.}}</div><div><br />{{RANDOM | Darf ich Ihnen in einem kurzen Video (5 Minuten) zeigen, wie das konkret abläuft? | Soll ich Ihnen das kurze Video zum Ablauf schicken? | Darf ich Ihnen den Ablauf in einem kurzen Video schicken?}} Ein kurzes „Ja“ reicht mir.</div><div><br />Viele Grüße<br /><br />Ole Kannapinn<br />Gründer &amp; Geschäftsführer</div><div><br />performancegrowth | Ole Kannapinn UG (haftungsbeschränkt)<br />Lorenzstraße 58, 12209 Berlin<br />Sitz Berlin · Amtsgericht Berlin-Charlottenburg · HRB 172651<br /><a href="https://performancegrowth.de/" target="_blank">performancegrowth.de</a></div><div><br />Falls das kein Thema für Sie ist, genügt eine kurze Antwort, dann melde ich mich nicht mehr.</div>
```

## Schritt 2: Mail 2

### Betreff

Leer lassen. Dann läuft die Mail im selben Verlauf wie Mail 1 (kein eigenes „Re:“).

### Mail 2 (ohne Zitat der ersten Mail)

```html
<div>{{personalization}},<br /><br /></div><div>{{RANDOM | Ich wollte kurz nachhaken, falls meine letzte Nachricht untergegangen ist. | Nur ein kurzer Stupser, falls meine Nachricht im Postfach untergegangen ist. | Ich melde mich noch einmal kurz, falls meine letzte Mail untergegangen ist.}}</div><div><br />{{RANDOM | Kurz gesagt: exklusive Interessenten aus Meta-Anzeigen, Kontakt per WhatsApp in wenigen Minuten und Termine direkt in Ihrem Kalender. | In einem Satz: Wir liefern nicht nur Kontaktdaten, sondern Beratungstermine, weil jeder Interessent innerhalb weniger Minuten per WhatsApp angeschrieben wird.}}</div><div><br />{{RANDOM | Soll ich Ihnen das kurze Video zum Ablauf schicken? | Darf ich Ihnen das 5-Minuten-Video trotzdem kurz schicken? | Wäre das Video für Sie interessant?}} Ein „Ja“ genügt.</div><div><br />Viele Grüße<br /><br />Ole Kannapinn<br />Gründer &amp; Geschäftsführer</div><div><br />performancegrowth | Ole Kannapinn UG (haftungsbeschränkt)<br />Lorenzstraße 58, 12209 Berlin<br />Sitz Berlin · Amtsgericht Berlin-Charlottenburg · HRB 172651<br /><a href="https://performancegrowth.de/" target="_blank">performancegrowth.de</a></div><div><br />Falls das kein Thema für Sie ist, genügt eine kurze Antwort, dann melde ich mich nicht mehr.</div>
```

## Prüftabelle

Geprüft über alle Spintax-Varianten (Betreff, Mail 1 A und B, Mail 2).

| Regel | Inhalt | erfüllt |
|---|---|---|
| 1 | „Erfolgsgarantie“ ersatzlos gestrichen, auch keine Umschreibung (§ 5 UWG) | ja |
| 2 | Keine Allianz und kein anderer Versicherer als Referenz; nur „für Versicherungsvermittler“ | ja |
| 3 | Zahlen nur belegbar: Variante A ohne Zahlen, Variante B mit {min}/{max} und Hinweis auf die Beratung | ja |
| 4 | „über 200.000 Leads“ als {Leadzahl}, Belegpflicht für Ole vermerkt | ja |
| 5 | Mail 2: Betreff leer, kein „Re:“, kein Zitat | ja |
| 6 | „{{personalization}},“ und danach Großschreibung, ohne Komma im Feld | ja |
| 7 | Kurze Abmeldezeile am Ende jeder Mail, keine Datenschutz-Fußzeile | ja |
| 8 | Signatur mit Pflichtangaben, in beiden Mails gleich | ja |
| 9 | Spintax; jede Variante erfüllt die Regeln 1 bis 8 | ja |
| Stil | Deutsch, Sie-Form, keine Gedankenstriche (– oder —), eine Frage am Ende | ja |

## Bewertung (geschätzt, 0 bis 100)

| Fassung | Score | Begründung |
|---|---|---|
| Alt | 45 | Gute Kernidee (WhatsApp, Termine), aber rechtlich nicht versandfähig (Erfolgsgarantie, Allianz-Referenz bei gemischter Liste, unbelegte Abschlusszahlen, fingiertes „Re:“ mit Zitat). Lang, Nutzen erst im vierten Absatz, mehrere Fragen. |
| Neu | 78 | Nutzen im ersten Satz, rund halb so lang, eine Ja-Frage, Mail 2 als echter kurzer Stupser im selben Verlauf. Abzug, weil Garantie und konkrete Abschlusszahlen als Verkaufsargument wegfallen. |

## Die drei größten Änderungen

1. Nutzen zuerst: „Termine statt nur Kontaktdaten“ und „Kontakt in wenigen Minuten per WhatsApp“ stehen jetzt am Anfang statt der Leadzahl mit Allianz-Referenz.
2. Rechtlich bereinigt: Erfolgsgarantie und Allianz ersatzlos raus, Zahlen nur als belegbare Platzhalter ({Leadzahl}, {min}/{max}) mit dem Hinweis, dass Abschlüsse von der Beratung abhängen.
3. Mail 2 neu: leerer Betreff im selben Verlauf statt ausgewürfeltem „Re:“ und Zitat einer nie gesendeten Mail; drei Sätze, eine Ja-Frage, dazu Abmeldezeile und vollständige Signatur in beiden Mails.
