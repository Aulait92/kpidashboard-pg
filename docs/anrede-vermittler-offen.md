# Anrede gegenüber dem Vermittler: offene Stellen (Stand 18.11.2026)

Seit 18.11.2026 gibt es `Customer.vermittlerDu` (Du/Sie gegenüber dem Vermittler selbst, also unserem Kunden).
Quelle: beim Annehmen eines Angebots `Offer.mailDu`, danach im Admin änderbar (Kundenakte → Einstellungen dieses
Kunden → „Anrede gegenüber dem Kunden“). Auswahl: Kundenfeld > angenommenes Angebot > Sie
(`src/lib/vermittler-ansprache.ts`, Laden: `src/lib/vermittler-ansprache-server.ts` `vermittlerDu(customerId)`).
Nicht verwechseln mit `Customer.leadAddress` (wie der Vermittler seine Leads anspricht).

Schon umgestellt: Begrüßung auf der Startseite des Kundenbereichs (`src/app/buyer/page.tsx`, „Guten Abend, Max“ bzw.
„Guten Abend, Herr Muster“).

## Bereits mit Du- und Sie-Fassung, bleiben bei `Offer.mailDu`

Diese Texte gehören zum Angebot und laufen in der Regel, bevor es ein Kundenkonto gibt (Bonus vor der Annahme,
Zahlungserinnerung zwischen Annahme und Zahlung, Startverschiebung im Stripe-Webhook vor dem Onboarding). Ole wählt
die Anrede dort je Angebot. Ändert Ole die Anrede an einem schon verknüpften Angebot (Zahlungserinnerung →
Sie/Du), zieht das Kundenkonto jetzt mit (`setzeErinnerungAdmin`).

| Datei:Zeile | Zweck |
|---|---|
| src/lib/vertrieb/bonus-erinnerung-server.ts:133 | Bonus-Erinnerung per Mail und WhatsApp (Zeile 180) |
| src/lib/angebot-zahlungserinnerung-server.ts:232 | Zahlungserinnerung per Mail und WhatsApp (Zeile 260) |
| src/lib/angebot-zahlungserinnerung-server.ts:372 | Mail „Start verschoben“ |
| src/app/admin/vertrieb/offer-actions.ts:131 | Angebotsmail |

## Nur Sie-Fassung (nicht umgebaut, bei Bedarf Du-Fassung ergänzen und `vermittlerDu(customerId)` durchreichen)

Hinweis: `customerGreeting(o, du)` (src/lib/offer-links.ts:118) kann schon „Hallo Max,“. Die Anrede allein umzustellen
ergäbe aber „Hallo Max,“ mit Text in Sie-Form, deshalb erst zusammen mit einer Du-Fassung des Textes.

### Mails an den Inhaber (Vermittler)

| Datei:Zeile | Zweck | Erster Satz |
|---|---|---|
| src/lib/onboarding.ts:331 (Text src/lib/email.ts:345) | Willkommens-Mail nach der Annahme | „vielen Dank für Ihr Vertrauen, wir freuen uns auf die Zusammenarbeit.“ |
| src/lib/offers.ts:500 | Auftragsbestätigung | „vielen Dank für Ihren Auftrag. Wir bestätigen die Annahme des Angebots …“ |
| src/lib/onboarding.ts:711 | Mail „Ihre Kampagne ist live“ | „alles ist eingerichtet, Ihre Anzeigen laufen ab sofort.“ |
| src/lib/selbst-einrichtung.ts:583 | Erinnerung Selbst-Einrichtung (Tag 1/3/7) | „damit Ihre Kampagne pünktlich starten kann, fehlen noch ein paar Minuten Einrichtung von Ihrer Seite:“ |
| src/lib/onboarding-cron.ts:79 | Neuer Lead per Mail (Nur Betreuung) | „es gibt einen neuen Interessenten. Am besten rufen Sie gleich an …“ |
| src/lib/onboarding-cron.ts:158 | Zufriedenheit nach einer Woche | „Ihre Kampagne läuft jetzt seit einer Woche. Wie zufrieden sind Sie bisher?“ |
| src/lib/onboarding-cron.ts:166 | Weiterempfehlung (NPS) | „Kurze Frage: Würden Sie uns weiterempfehlen?“ (Betreff) |
| src/lib/onboarding-cron.ts:182 | Erster Monat mit Zahlen | „Ihr erster Monat ist um. Hier die Zahlen der letzten 30 Tage:“ |
| src/lib/monatsbericht/server.ts:589 | Monatsbericht (Text von der KI, Sie) | Absätze aus dem Bericht |
| src/lib/budget.ts:233 | Budget-Anfrage eingegangen | „vielen Dank für Ihre Anfrage. Folgendes Werbebudget wünschen Sie sich:“ |
| src/lib/budget.ts:303 | Werbebudget angepasst (auch Zeile 395/396) | „Ihr Werbebudget wird … angepasst.“ |
| src/lib/pause.ts:176 | Pause hat begonnen | „Ihre Anzeigen sind ab heute pausiert …“ |
| src/lib/pause.ts:238 | Anzeigen laufen wieder | „Ihre Pause ist beendet, die Anzeigen laufen ab heute wieder.“ |
| src/lib/pause.ts:347 | Offene Rechnung, Warnung | „bei uns ist noch eine Rechnung offen, die Abbuchung hat leider nicht geklappt.“ |
| src/lib/pause.ts:400 | Anzeigen wegen Zahlung pausiert | „da eine Rechnung seit über 30 Tagen offen ist, haben wir Ihre Anzeigen vorübergehend pausiert.“ |
| src/lib/mahnwesen-server.ts:263 (Texte src/lib/mahnwesen.ts:158) | Zahlungserinnerung und Mahnungen | „eine kurze Erinnerung: Unsere Rechnung … ist am … fällig.“ |
| src/lib/mahnwesen-server.ts:282 | Rechnung fällig per WhatsApp (fest `du: false`, Vorlage nur Sie) | Vorlage `rechnungVorlage` |
| src/lib/vorauszahlung-erinnerung.ts:143 | Vorauszahlung läuft aus | Betreff „Ihre Vorauszahlung läuft am … aus“ |
| src/lib/vertrag-kuendigung.ts:180 | Kündigungsbestätigung | „wir bestätigen den Eingang Ihrer Kündigung am …“ |
| src/lib/halteangebote-server.ts:338 | Halteangebot bestätigt | „schön, dass Sie bleiben.“ |
| src/lib/ruhend.ts:277 | Vertrag beendet, Konto ruht | „Ihr Vertrag mit uns endete am …“ |
| src/lib/ruhend.ts:340 | Löschung in X Tagen | „am … löschen wir Ihre Daten bei performancegrowth endgültig …“ |
| src/lib/ruhend.ts:390 | Rückkehrangebot | „Ihr Vertrag mit uns endete am … Ihre Leads, Kunden und Einstellungen sind noch so da …“ |
| src/lib/ruhend.ts:492 | Daten gelöscht | „wir haben Ihre Daten bei performancegrowth am … endgültig gelöscht …“ |
| src/lib/ruhend.ts:604 | Konto wieder aktiv | „schön, dass Sie wieder da sind.“ |
| src/lib/kollegen.ts:395 | Dank: Empfehlung ist Kunde | „vielen Dank für Ihre Empfehlung: … ist jetzt Kunde bei uns.“ |
| src/lib/kollegen.ts:644 | Gratiszeit Bestandskunden-Modul endet | „als Dankeschön für Ihre Empfehlung nutzen Sie das Bestandskunden-Modul bis … gratis.“ |
| src/lib/bestand/packs.ts:214 | Bestandskunden-Modul: Paket, Kontingent | Absätze je Anlass, Gruß „Guten Tag,“ |
| src/lib/bestand/self-service.ts:136 | Bestandskunden-Modul selbst gebucht/beendet | Absätze je Anlass, Gruß „Guten Tag,“ |
| src/lib/empfehlung/module.ts:107 | Modul Empfehlungen (ausgeblendet) | Absätze je Anlass |
| src/lib/empfehlung/module.ts:359 | Ankündigung Modul Empfehlungen (ausgeblendet) | Betreff „Neu: Empfehlungen & Google-Bewertungen automatisch“ |
| src/lib/email-aendern.ts:38 | Neue Anmelde-Adresse bestätigen | „Sie möchten Ihre Anmeldung bei performancegrowth auf diese E-Mail-Adresse umstellen.“ |
| src/lib/email-aendern.ts:71 | Anmelde-Adresse geändert | „Ihre Anmeldung bei performancegrowth läuft ab sofort über …“ |
| src/lib/next-step-reminder.ts:110 | Erinnerung „Lead braucht nächsten Schritt“ (an jeden Login) | „Wichtig: 1 Lead braucht einen nächsten Schritt“ |

### Push an den Vermittler mit persönlicher Ansprache (Sie)

| Datei:Zeile | Zweck | Text |
|---|---|---|
| src/lib/selbst-einrichtung.ts:598 | Einrichtung offen | Titel „Ihre Einrichtung“ |
| src/lib/whatsapp/outreach.ts:356 | Erstinformation fehlt | „Ein neuer Lead wartet: Die erste WhatsApp geht erst mit Ihrer Erstinformation raus.“ |
| src/lib/telefonat-server.ts:270 | Nach dem Anruf | „Was ist bei Ihrem Kontakt rausgekommen? Ein Tipp genügt.“ (nur ohne Lead-Namen) |
| src/lib/kollegen.ts:389 | Dank für Empfehlung | „Danke für Ihre Empfehlung! 🎁“ |

## Nur Du-Fassung (Abweichung von der Sie-Form der Oberfläche, nicht umgebaut)

| Datei:Zeile | Zweck | Text |
|---|---|---|
| src/lib/email.ts:94 (Text Zeile 117) | Einladung zum Kundenbereich aus dem Admin (`sendBuyerInviteEmail`, src/app/admin/buyers/actions.ts:167, src/app/api/ops/buyers/route.ts:97) | „für dich (…) wurde ein Zugang zum Kunden-CRM von performancegrowth angelegt.“ |
| src/lib/whatsapp/attention.ts:26 | Push „Gespräch braucht Aufmerksamkeit“ | „💬 … braucht dich“ |
| src/lib/calendar/index.ts:541 | Push „Termin abgesagt“ | „Ein Lead hat seinen Termin abgesagt und steht jetzt in deiner Rückrufliste.“ |

## Nicht betroffen

- Mails an Teammitglieder (src/app/buyer/team/actions.ts:76, :103, Push :170): eigene Personen, nicht der Inhaber.
- Mails an Interessenten vor dem Angebot (src/lib/kollegen.ts:279, src/lib/vertrieb/buchung.ts:827), an Ole
  (src/app/buyer/bestand/actions.ts:592, src/lib/bestand/packs.ts:185, src/lib/bestand/self-service.ts:121) und
  Lead-Lieferungen (src/lib/ppl/delivery.ts).
- Passwort vergessen (src/app/forgot-password/actions.ts:27): Systemmail ohne persönliche Ansprache.
- Push ohne Anrede (neuer Lead, neuer Termin, Neuigkeiten, Bewertungen, Testphase endet usw.).
