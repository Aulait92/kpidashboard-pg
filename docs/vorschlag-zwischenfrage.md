# Vorschlag: Zwischenfrage vor dem Terminvorschlag je Produkt (Ole entscheidet)

Stand 17.11.2026. Ablauf vor dem Termin (Auftrag Ole, Testchat 17.11.2026):

Öffnungsfrage (erste WhatsApp) → Antwort → **genau eine** Zwischenfrage mit Antwortknöpfen → Antwort → Terminvorschlag.

- Die Zwischenfrage ist das erste noch **unbekannte** Feld aus den „Angaben fürs Angebot“ des Produkts
  (`src/lib/preise/rechner-angaben.ts`). Was Formular oder Chat schon sagen, wird nie gefragt.
- Einleitung immer gleich: „Danke! Damit Herr Kannapinn Ihnen im Termin gleich passende Beiträge zeigen kann: …“
  (Du: „Danke! Damit Ole dir im Termin gleich passende Beiträge zeigen kann: …“).
- Antwortet der Lead auf die Öffnungsfrage mit einem Terminwunsch, einer Rückfrage oder einer Absage: keine
  Zwischenfrage, der Assistent bietet direkt den Termin an (bzw. bucht die Wunschzeit).
- Antwort auf die Zwischenfrage per Knopf: die App schickt sofort den Terminvorschlag, der die Antwort aufgreift.
  Freitext statt Knopf: der Assistent übernimmt, fragt nichts mehr und bietet den Termin an.
- Code: `src/lib/whatsapp/zwischenfrage.ts` (`ZWISCHENFRAGEN`, `ZWISCHENFRAGE_AKTIV`). Freigeben = Zweck in
  `ZWISCHENFRAGE_AKTIV` aufnehmen, sonst nichts.

## Aktiv: Privatschutz (`outreach_privatschutz`)

| | |
|---|---|
| Öffnungsfrage | „Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu?“ |
| Zwischenfrage | „Wer soll mitversichert sein?“ |
| Knöpfe | Nur ich · Zu zweit · Familie mit Kindern |
| Übersprungen, wenn bekannt | Formularfeld Lebenssituation, Familienstand, zu versichernde Personen; im Chat „versichern“/„Lebenssituation“ |
| Terminvorschlag danach | „Danke! In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was Haftpflicht und Hausrat für Sie (Sie beide / Ihre Familie) kosten und worauf Sie achten sollten. Passt Ihnen …?“ |

## Vorschläge (vorbereitet, nicht aktiv)

### Tierkrankenversicherung (`outreach_tkv`)

Öffnungsfrage: „Wie alt ist Ihre Katze?“ (bzw. Hund, Pferd, Tier). Alter, Rasse, Geschlecht und Haltung stehen im Funnel
oft schon; dann keine Zwischenfrage.

| Reihenfolge | Frage | Knöpfe | Übersprungen, wenn bekannt |
|---|---|---|---|
| 1 (nur Katze) | „Ist Ihre Katze eine Wohnungskatze oder ein Freigänger?“ | Wohnungskatze · Freigänger · Beides | Formularfeld Haltung |
| 2 | „Ist Ihr Tier männlich oder weiblich?“ | Männlich · Weiblich | Formularfeld Geschlecht |

Offene Frage an Ole: Beim Hund lieber „Ist Ihr Hund ein Rüde oder eine Hündin?“ (Knöpfe Rüde · Hündin)?

### Zahnzusatz (`outreach_zahn`)

Öffnungsfrage: „Welcher Tarifbaustein ist Ihnen am wichtigsten?“ (Knöpfe Starker Zahnersatz · Mit Zahnreinigung ·
Beides vergleichen).

| Frage | Knöpfe | Übersprungen, wenn bekannt |
|---|---|---|
| „Sind Sie gesetzlich krankenversichert?“ | Ja, gesetzlich · Nein, privat | Formularfeld gesetzlich oder privat, Krankenkasse |

Art. 9 DSGVO: keine Fragen zu Zähnen, Befunden, Behandlungen. Die Frage betrifft nur den Versicherungsstatus.

### Private Krankenversicherung (`outreach_pkv`)

Öffnungsfrage: „Wie sind Sie aktuell beruflich aufgestellt?“ (Knöpfe Angestellt · Selbstständig · Beamter); steht
„Situation“ schon im Funnel, ist die Öffnungsfrage die nächste offene.

| Frage | Knöpfe | Übersprungen, wenn bekannt |
|---|---|---|
| „Sind Sie aktuell gesetzlich oder schon privat versichert?“ | Gesetzlich · Schon privat | Funnel „Gesetzlich oder privat?“, „Wie lange in PKV“, aktueller Monatsbeitrag (dann schon privat) |

Keine Fragen zur Gesundheit; das Geburtsjahr (wichtig für den Beitrag) ohne Knöpfe, daher nicht als Zwischenfrage.

### Allgemeines Erstanschreiben (`outreach`, ohne Produkt)

Keine Zwischenfrage: Die Öffnungsfrage ist schon die Frage nach dem Telefonat (Heute · Morgen · Lieber schriftlich).
