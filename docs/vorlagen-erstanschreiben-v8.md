# Erstanschreiben v8 zur Freigabe durch Ole

Stand 17.11.2026 (Paket P2). Die Vorlage ist **nur vorbereitet** (`VORBEREITETE_FASSUNG` in
`src/lib/whatsapp/templates.ts`) und wird **nicht** bei Meta eingereicht. Im offenen 24-h-Fenster geht der neue Text
schon jetzt als Freitext raus (`erstanschreibenText` in `src/lib/whatsapp/erstanschreiben.ts`). Ist das Fenster zu,
sendet die App weiter die neueste freigegebene Vorlage (v7 bzw. v6, `rankOutreach`).

Was sich gegenüber v7 ändert:

- Statt „zum Thema Privatschutz“ das konkrete Interesse aus dem Formular: „zu Haftpflicht und Hausrat“.
- Dazu das Emoji des Produkts (`OutreachProdukt.emoji`): 🏠 Privatschutz, 🐱 🐶 🐴 🐾 Tier; PKV und Zahn ohne Emoji.
- Neutraler Nutzen-Halbsatz ohne Zahl der Fragen: „und kläre kurz ein paar Angaben, damit er Ihnen für Ihre Familie
  den passenden Schutz zeigen kann“. „Familie“ nur, wenn das Formular Familie bzw. Kinder nennt, beim Tier „für Ihre
  Katze“, sonst „persönlich“.
- Die erste Frage bleibt dynamisch (erste offene Frage laut Formular) und ist **nicht fett**. Das „?“ steht fest in der
  Vorlage, damit am Ende kein Platzhalter steht (Meta-Regel).

## Text (für alle fünf Zwecke gleich: `outreach`, `outreach_tkv`, `outreach_zahn`, `outreach_pkv`, `outreach_privatschutz`)

- Sie: `Hallo {{1}}, danke für Ihre Anfrage {{2}}! Ich bin der digitale KI-Assistent von {{3}} und kläre kurz ein paar Angaben, damit {{4}} Ihnen {{5}} den passenden Schutz zeigen kann.` + Leerzeile + `{{6}}?`
- Du: `Hallo {{1}}, danke für deine Anfrage {{2}}! Ich bin der digitale KI-Assistent von {{3}} und kläre kurz ein paar Angaben, damit {{4}} dir {{5}} den passenden Schutz zeigen kann.` + Leerzeile + `{{6}}?`
- Sie ohne Namen: „Hallo, …“, die Platzhalter rücken um eins auf ({{1}} bis {{5}}).
- Kopf: PDF der Erstinformation wie bisher, Fußzeile wie bisher. Kategorie wie v7.

| Platzhalter | Inhalt | Beispiel Sie | Beispiel Du |
|---|---|---|---|
| {{1}} | Name | Frau Becker | Anna |
| {{2}} | Anfrage mit Interesse und Emoji | zu Haftpflicht und Hausrat 🏠 | zu Haftpflicht und Hausrat 🏠 |
| {{3}} | Vermittler im Dativ | Herrn Kannapinn | Ole |
| {{4}} | Vermittler als Subjekt (er, sie laut Anrede, sonst Name) | er | er |
| {{5}} | Für wen | für Ihre Familie | für deine Familie |
| {{6}} | Erste offene Frage ohne „?“ | Sind Haftpflicht und Hausrat schon irgendwo versichert, oder wäre beides neu | (gleich) |

## Beispiele

Privatschutz, Familie (Sie):

> Hallo Frau Becker, danke für Ihre Anfrage zu Haftpflicht und Hausrat 🏠! Ich bin der digitale KI-Assistent von
> Herrn Kannapinn und kläre kurz ein paar Angaben, damit er Ihnen für Ihre Familie den passenden Schutz zeigen kann.
>
> Sind Haftpflicht und Hausrat schon irgendwo versichert, oder wäre beides neu?

Katze (Du):

> Hallo Anna, danke für deine Anfrage zur Katzenversicherung 🐱! Ich bin der digitale KI-Assistent von Ole und kläre
> kurz ein paar Angaben, damit er dir für deine Katze den passenden Schutz zeigen kann.
>
> Wie alt ist deine Katze?

PKV (Sie, ohne Familie):

> Hallo Frau Becker, danke für Ihre Anfrage zur privaten Krankenversicherung! Ich bin der digitale KI-Assistent von
> Herrn Kannapinn und kläre kurz ein paar Angaben, damit er Ihnen persönlich den passenden Schutz zeigen kann.
>
> Wie sind Sie aktuell beruflich aufgestellt?

Ohne Produkt (Sie):

> Hallo Frau Becker, danke für Ihre Anfrage zum Thema Versicherung! Ich bin der digitale KI-Assistent von Herrn
> Kannapinn und kläre kurz ein paar Angaben, damit er Ihnen persönlich den passenden Schutz zeigen kann.
>
> Wann erreicht Herr Kannapinn Sie am besten für ein kurzes Telefonat?

Geprüft: keine Gedankenstriche, kein Platzhalter am Anfang oder Ende, keine Platzhalter direkt nebeneinander
(`metaTemplateProblems`, Test in `tests/unit/erstanschreiben-v8.test.ts`).

## Freigeben (wenn Ole einverstanden ist)

1. In `TEMPLATE_BODY` (templates.ts) die fünf Erstanschreiben-Zwecke auf `{ ...ERSTANSCHREIBEN_V8 }` setzen.
2. `PURPOSE_VERSION` dieser Zwecke auf `"v8"` setzen und die Einträge in `VORBEREITETE_FASSUNG` löschen.
3. `REST_PARAMS` der Zwecke auf die fünf Platzhalter oben erweitern (die Parameter liefert schon
   `outreach.ts` `paramsFor` ab Version 8 über `erstanschreibenV8Params`) und die bisherige Belegung (v7: Thema,
   Vermittler, Frage) in `PLATZHALTER_AB` mit `version: 8` eintragen.
4. Danach reicht `template-submit` die neuen Namen (`pg_outreach_privatschutz_v8_sie` …) je Kunde automatisch ein; bis
   zur Freigabe bei Meta bleibt v7 bzw. v6 im Einsatz.

Offen für Ole: Text freigeben, insbesondere „persönlich“ für Leads ohne Familie und „er/sie“ als Platzhalter {{4}}
(bei Meta ein eigener Platzhalter, weil das Geschlecht des Vermittlers je Kunde wechselt).
