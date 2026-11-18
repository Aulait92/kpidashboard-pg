# Erstanschreiben v8 (Ole, Testchat 17.11.2026): Meta-Vorlagen

Grund: v7 klappt in WhatsApp Desktop ein („Weiterlesen“). v8 ist kurz, das Thema steht fest je Produkt, die erste Frage
ist wieder fett. Ole hat die Einreichung freigegeben: `PURPOSE_VERSION` aller Erstanschreiben steht auf `v8`, die
Zwecke stehen in `CORE_PURPOSES`, der Cron reicht sie je Kunde ein (nach Merge und Deploy). Bis Meta v8 freigibt, geht
die bisherige freigegebene Fassung (v7 bzw. v6) mit ihren Platzhaltern raus (`PLATZHALTER_AB`, `rankOutreach`).

- Kopf: PDF der Erstinformation (wie bisher, § 15/16 VersVermV).
- Fußzeile fest, 49 Zeichen: „KI-Assistent · Oben: Erstinformation (gesetzlich)“ (KI-Kennzeichnung, KI-VO Art. 50).
  Sie wird beim Senden mitgespeichert, damit Verlauf und Assistent sie sehen.
- Kategorie MARKETING, keine Knöpfe (die erste Frage ist ein Platzhalter, damit nie Bekanntes gefragt wird).
- Platzhalter: {{1}} Anrede („Frau Mustermann“ bzw. „Herr Mustermann“; Anrede unsicher: Vor- und Nachname; Du: Vorname),
  {{2}} Vermittler im Dativ („Herrn Kannapinn“, ohne Anrede in den Anbieterangaben Vor- und Nachname, Du: Vorname),
  {{3}} erste offene Frage ohne „?“. Fassung „Sie ohne Name“ beginnt mit „Hallo,“, die Platzhalter rücken auf.
- Freitext im offenen 24-h-Fenster: gleicher Text, aber „digitale KI-Assistent“ im Satz (dort gibt es keine Fußzeile).

| Vorlage | Text (Sie) |
|---|---|
| `pg_outreach_privatschutz_v8_sie` | Hallo {{1}}, danke für Ihre Anfrage zum Privatschutz! Hier schreibt der digitale Assistent von {{2}}.\n\n\*{{3}}?\* |
| `pg_outreach_tkv_v8_sie` | Hallo {{1}}, danke für Ihre Anfrage zur Tierkrankenversicherung! Hier schreibt der digitale Assistent von {{2}}.\n\n\*{{3}}?\* |
| `pg_outreach_zahn_v8_sie` | Hallo {{1}}, danke für Ihre Anfrage zur Zahnzusatzversicherung! Hier schreibt der digitale Assistent von {{2}}.\n\n\*{{3}}?\* |
| `pg_outreach_pkv_v8_sie` | Hallo {{1}}, danke für Ihre Anfrage zur privaten Krankenversicherung! Hier schreibt der digitale Assistent von {{2}}.\n\n\*{{3}}?\* |
| `pg_outreach_v8_sie` (ohne Produkt) | Hallo {{1}}, danke für Ihre Anfrage! Hier schreibt der digitale Assistent von {{2}}.\n\n\*{{3}}?\* |

Du-Fassungen (`pg_…_v8`): „danke für deine Anfrage …“, sonst gleich. Sie ohne Name (`pg_…_v8_sie_ohne_name`):
„Hallo, danke für Ihre Anfrage … von {{1}}.\n\n\*{{2}}?\*“.

## Beispiele (so sieht es beim Lead aus)

| Produkt | Nachricht (Sie, Anrede bekannt) |
|---|---|
| Privatschutz | Hallo Frau Mustermann, danke für Ihre Anfrage zum Privatschutz! Hier schreibt der digitale Assistent von Herrn Kannapinn. **Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu?** |
| Tier (Katze) | Hallo Frau Mustermann, danke für Ihre Anfrage zur Tierkrankenversicherung! Hier schreibt der digitale Assistent von Herrn Kannapinn. **Wie alt ist Ihre Katze?** |
| Zahnzusatz | Hallo Frau Mustermann, danke für Ihre Anfrage zur Zahnzusatzversicherung! Hier schreibt der digitale Assistent von Herrn Kannapinn. **Welcher Tarifbaustein ist Ihnen am wichtigsten?** |
| PKV | Hallo Frau Mustermann, danke für Ihre Anfrage zur privaten Krankenversicherung! Hier schreibt der digitale Assistent von Herrn Kannapinn. **Wie sind Sie aktuell beruflich aufgestellt?** |
| ohne Produkt | Hallo Frau Mustermann, danke für Ihre Anfrage! Hier schreibt der digitale Assistent von Herrn Kannapinn. **Wann erreicht Herr Kannapinn Sie am besten für ein kurzes Telefonat?** |

Unter jeder Nachricht klein: „KI-Assistent · Oben: Erstinformation (gesetzlich)“, darüber das PDF.

Steht die Öffnungsfrage schon im Formular, kommt die nächste offene; ist alles bekannt: „Passt Ihnen ein kurzer
Videotermin mit Herrn Kannapinn in den nächsten Tagen?“.
