# Agenten-Führungsteam performancegrowth

Gemeinsames Gedächtnis des Führungsteams (Ole, 19.11.2026). Jeder Agent liest diese Datei, `AGENTS.md`,
`entscheidungslog.md` und `offene-aufgaben.md`, bevor er arbeitet. Keiner arbeitet aus dem Kopf.

- Agenten: `.claude/agents/<rolle>.md` (22 Rollen). Ändert man eine Datei, ändert sich der Agent.
- Ausführliche Fassung mit Freigabe-Tabelle, Plan KW 47 bis 50 und „Weg zum Unicorn“: Claude-Dokument
  „Agenten-Führungsteam performancegrowth“ (claude.ai/artifact/68aut7ABgkAYrpAA7EGJJn, nur mit Freigabe von Ole sichtbar).
- Beschlüsse: `entscheidungslog.md` · Übergabe und offene Punkte: `offene-aufgaben.md` · Kalt-Mail: `kaltakquise.md`
- Protokolle: `protokolle/JJJJ-MM-TT-<meeting>.md`

## So startet man das Team (auch aus einem anderen Claude-Konto)

In Claude Code in diesem Repo zum Beispiel:
- „Lass den Chief of Staff die Führungsrunde vorbereiten.“
- „Frag den CFO und das Red Team, ob wir X machen sollen.“
- „Die Kunden-Personas sollen die neue Einrichtungsseite auf Staging testen.“

Claude Code findet die Agenten über `.claude/agents/`. `/agents` zeigt die Liste.

Zugänge hängen an der Umgebung, nicht am Repo: Diagnose-Schnittstelle, Railway, Stripe, Instantly, Sentry, Lovable usw.
funktionieren nur, wenn die Umgebung des Kontos diese Verbindungen bzw. Netzwerk-Secrets hat. Ohne sie arbeiten die
Agenten nur mit dem Repo und sagen, welche Daten fehlen. Schlüssel nie in Dateien oder in den Chat.

## Grundsätze

- Ole ist Aufsichtsrat und Gründer. Strategie, Geld, Preise, Recht, Personal und alles, was nach außen geht, segnet er ab.
  Alles andere entscheiden die Agenten selbst und berichten.
- Jeder Agent hat genau einen Verantwortungsbereich, eine Haupt-KPI und zwei bis drei Neben-KPIs. Jede KPI zahlt auf
  eine Company-KPI ein.
- Agenten lesen viel und schreiben wenig. Schreibende oder externe Aktionen laufen über Freigaben.
- Alles ist nachvollziehbar: jede Entscheidung mit Begründung, Daten und Verantwortlichem im Entscheidungslog.
- Phase 1: 19 Agenten. Content & Brand, Partnerships und Investor Relations kommen später dazu.

## Company-KPIs (North Star: ARR)

| Company-KPI | Ziel | Verantwortlich |
|---|---|---|
| ARR und Net New ARR je Monat | Wachstum | CEO |
| NRR | über 110 % | Customer Success |
| Logo-Churn je Monat | unter 2 % | Customer Happiness |
| CAC-Payback | unter 12 Monate | CFO |
| Burn Multiple | unter 1,5 | CFO |
| Abschlüsse je Vermittler und Monat | Kundenerfolg | CPO |
| NPS der Vermittler | über 50 | Customer Happiness |
| SUS der Kernseiten | über 90 | UX/UI |

Quellen: Zahlen-Seite der App, Diagnose-Schnittstelle (`/api/ops/diagnose`), Stripe, Werbekonten. Der Data-Agent
rechnet nach.

## Freigabestufen

| Stufe | Wer entscheidet | Beispiele |
|---|---|---|
| A: Ole segnet ab | Ole, auf Empfehlung des CEO | Preise und Rabatte, Budget über 500 € je Vorgang, neue Werbekanäle, Verträge, Rechtstexte und Einwilligungen, Texte an alle Kunden, Livegang großer Funktionen, Personal, Finanzierung, alles Unumkehrbare |
| B: Agent entscheidet, Ole wird informiert | CEO oder Fachagent | Wochenprioritäten, Budget-Umschichtung in freigegebenen Kampagnen, kleine Produktänderungen, Texte an einzelne Kunden aus geprüften Vorlagen |
| C: Agent entscheidet allein | Fachagent | Analysen, Entwürfe, interne Aufgaben, Tests auf Staging, Anzeigen pausieren bei klaren Verlustregeln |

Was Ole nicht binnen 48 Stunden freigibt, bleibt liegen. Es gilt nie als genehmigt.

## Meetings

| Meeting | Wann | Wer | Ergebnis |
|---|---|---|---|
| Tages-Standup (schriftlich) | täglich 6:30 | alle aktiven Agenten | Gestern, heute, Blocker; daraus Morgen-Briefing 7:30 |
| Führungsrunde | montags 7:00 | CEO, CFO, CTO, CPO, CMO, Chief of Staff, Red Team | Wochenziele, Konflikte, Freigabe-Liste |
| Growth-Runde | dienstags 7:00 | CMO, Performance, Creative, Sales, Content, Partnerships, Data | Experimente: was läuft, stoppt, skaliert |
| Produkt- und Design-Review | donnerstags 7:00 | CPO, CTO, UX/UI, Personas, Customer Happiness, Recht, Datenschutz | Was gebaut wird, Persona-Tests, Rechtsprüfung vor dem Bau |
| Kunden-Runde | freitags 7:00 | Customer Happiness, Customer Success, CPO, Sales | Gefährdete Kunden, Fragen, Upsell |
| Monats-Board | 1. Montag, 30 Min. | Ole, CEO, CFO, Chief of Staff, Strategischer Investor | Zahlen gegen Plan, große Entscheidungen, Budget |
| Quartals-Planung | letzte Quartalswoche | Ole und alle | OKRs, Prioritäten, Stopp-Liste |

## Zusammenarbeit

- Übergaben statt Zurufe: Aufgabe mit Ziel, Frist und Daten in `offene-aufgaben.md`.
- Feste Prüfpfade: Kundenseiten vor dem Bau durch UX/UI und Personas; Rechtliches durch Recht, Conversion-Texter und
  Datenschutz (AGENTS.md); neue Zugänge und Integrationen durch Cyber Security.
- Konflikte löst zuerst der CEO, sonst kommen beide Positionen mit Empfehlung auf Oles Liste.
- Red Team sieht jeden Beschluss über 1.000 € oder mit Kundenwirkung vorab.

## Grenzen

- Agenten können sich irren und klingen dabei sicher. Der Data-Agent rechnet nach, das Red Team prüft große Beschlüsse.
- Der Rechts-Agent ersetzt keine zugelassene Anwältin bei Streit, Haftung oder Behörden.
- Verkaufs-, Investoren- und Personalgespräche führt Ole selbst. Die Agenten bereiten vor.
- Not-Aus: Ole sagt „Agenten stopp“; geplante Aufgaben werden dann deaktiviert.
