# Morgen-Briefing für Ole, Donnerstag 19.11.2026

Chief of Staff. Quellen: `docs/firma/` (README, Entscheidungslog, offene Aufgaben, Protokoll 19.11., `kaltakquise.md`),
`docs/webseite-offen.md`, `docs/recht/`, git log 18.–19.11. (133 Commits, Branch live). Stand: 19.11.2026.
Nicht verfügbar in dieser Sitzung: Diagnose-Schnittstelle (Zugriff verweigert), Kalender, Stripe, Werbekonten,
Claude-Dokument. Alle Zahlen dazu sind deshalb **unbekannt**, nicht geschätzt.

## 1. Freigaben heute (Stufe A)

| # | Thema | Empfehlung | Begründung (2 Sätze) | Risiko | Kosten |
|---|---|---|---|---|---|
| 1 | Umsatzsteuer: Termin Steuerberater | **Heute anfragen**, Betrag und Frist klären | Steht im Fokus der zwei Wochen ganz oben und vor Ihrem Gehalt. Vorauszahlung mit Annahme ist live, damit fällt USt auf Vorauszahlungen sofort an. | Rot (Haftung); Betrag und Frist unbekannt | Honorar unbekannt |
| 2 | Kalt-Mail: 4 offene Textbefunde | **Alle vier korrigieren lassen, bevor eine Kampagne startet** (Allianz „Lead.Now“-Satz raus, „Erfolgsgarantie“ raus, Signatur prüfen, Tecis-Tippfehler) | Die Allianz-Formulierung kann als Irreführung nach § 5 UWG gelten, „Garantie“ ist ohnehin tabu. Ohne Korrektur steigt das ohnehin akzeptierte Abmahnrisiko unnötig. | Abmahnung bei Start ohne Korrektur | Keine, Agentenzeit |
| 3 | Policen-Formular v2 testen | **Heute selbst als Testkunde durchspielen**, danach `POLICEN_FLOW_KUNDEN` leeren (für alle) | Beschluss vom 19.11. steht, es fehlt nur Ihr Test. Kranken, BU und Leben erst nach Auflagen A1 bis A9 (`docs/recht/policen-whatsapp-gesundheitsdaten.md`). | Gelb (Gesundheitsdaten) | Keine |
| 4 | Webseite nachziehen | **Ja, Nachhol-Update außerhalb der Hauptzeiten**, vorher Liste auf das Verfügbare kürzen | 131 offene Einträge seit 14.11., der Montagstermin 16.11. ist ausgefallen. Die Seite beschreibt damit fünf Tage Produktstand nicht. | Gering; Altversprechen auf der Seite | Keine |

Ohne Ihre Freigabe binnen 48 Stunden bleiben alle Punkte liegen und gelten nicht als genehmigt.
Ebenfalls bei Ihnen, ohne Datum offen (seit wann: unbekannt): Instantly Light Speed und 60 Postfächer, alte
Löschverlangen per Knopf nachziehen, verrata24 im Admin aktivieren, Meta-Freigabe des ersten Software-Kunden
vorziehen (Engpass: höchstens ein freier WhatsApp-Platz), Bedrock-Freischaltung, LinkedIn-App.

## 2. Company-KPIs gegen Plan

| KPI | Ziel | Ist | Quelle |
|---|---|---|---|
| ARR / Net New ARR | Wachstum | unbekannt | Diagnose nicht erreichbar |
| NRR | über 110 % | unbekannt | |
| Logo-Churn je Monat | unter 2 % | unbekannt | |
| CAC-Payback | unter 12 Monate | unbekannt | |
| Burn Multiple | unter 1,5 | unbekannt | |
| Abschlüsse je Vermittler und Monat | Kundenerfolg | unbekannt | |
| NPS der Vermittler | über 50 | unbekannt, Messung noch nicht belegt | |
| SUS der Kernseiten | über 90 | nur Selbsteinschätzungen der UX-Runde, keine Messung | |

Nächster Schritt: Data-Agent braucht Lesezugang (Diagnose in der Sitzungsumgebung, Lesekopie ohne Klardaten).

## 3. Was Agenten selbst entschieden haben (Stufe B, seit 18.11.)

- UX-Runde Teams A bis D: „Heute“ mit neuen Leads oben, Kontakte mit „Zu erledigen“ als Standard, Termine und Konto vereinfacht.
- Chat: Nachfass-Vorlagen wählbar, passende vorausgewählt; Neuigkeit angelegt (ohne Push).
- Bot-Sicherheitsnetz (Rückfall Policen-Flow, Assistent-stumm-Erkennung), WhatsApp-Strecke mit Monat und Jahr beim Ablauf.
- Einladung mit Kalendereintrag auch ohne bestätigte Adresse; Erstinformation-Namensfeld korrigiert.
- Pay-per-Lead: Meldung „Kontingent erreicht“ an Admins und Slack; Mail- und SMS-Strecke kontaktiert PPL-Leads nie.
- Vertrieb: Listenimport mit Sperren und Tagesportion, DSGVO-Prozess (Löschung auf Verlangen, bei Abmahnung nie automatisch).
- Diagnose `q=cash` neu (Kontostände, Kosten, USt-Schätzung) als Grundlage für Punkt 1.

Hinweis: Am 19.11. kamen viele neue Funktionen trotz zwei Wochen Feature-Stopp. Ob alle im Plan standen, kann ich ohne das
Claude-Dokument nicht prüfen; CEO soll das im heutigen Produkt- und Design-Review klären.

## 4. Risiken (höchstens drei)

1. **Umsatzsteuer** (rot): Betrag und Frist unbekannt, Vorauszahlungen laufen bereits.
2. **Livegang Neukunden**: WhatsApp-Assistent läuft noch bei keinem zahlenden Kunden; Engpass Meta-Freigabe; mehrere
   Go-live-Auflagen (W1 bis W7) liegen nur als Teilarbeit auf Branches.
3. **Datenschutz-Fristen in 8 Tagen** (27.11.): § 203-Erklärungen der Mitarbeiter und Virenprüfung als Pflicht;
   danach DPA-Nachweise 4.12., § 203 Unterauftragnehmer 11.12.

## Heute im Kalender (laut README, Kalender selbst nicht geprüft)

7:00 Produkt- und Design-Review (CPO, CTO, UX/UI, Personas, Customer Happiness, Recht, Datenschutz).
Code-Deploys erst ab 20 Uhr; neu aufgenommene Erklärvideos nicht werktags 8 bis 20 Uhr.
