# Zusatzmodul „Empfehlungen & Bewertungen“ (Stand 20.11.2026, Umbau auf Branch `empfehlung-champions`)

Preis 59 € netto/Monat, 30 Tage kostenlos testen, danach automatisch kostenpflichtig
(Erinnerung 3 Tage vorher). Ablauf und Regeln: `src/lib/empfehlung/shared.ts`, Hilfe-Text:
`docs/hilfe.md` → „Empfehlungen & Bewertungen“.

## Kurz

- Nach jedem Abschluss (Standard 7 Tage): **eine Nachricht für alle** – erst der direkte Draht zum
  Vertreter, dann der Google-Link. Kein Gating (Google-Richtlinien, UWG).
- Antworten wertet die KI aus. Kritik → Push + Aufgabe „Kunde unzufrieden – bitte heute anrufen“ in
  „Heute“, keine Empfehlungsbitte. Lob → Dank **mit persönlichem Empfehlungslink** (Einstellung „bei Lob direkt
  um Empfehlung bitten“, Standard an; kein zweiter Google-Link). Die Bitte an Tag 21 entfällt dann.
- Tag 21: Bitte um Empfehlung mit persönlichem Link (nicht bei Kritik/offener Aufgabe „unzufrieden“).
  Die empfohlene Person trägt sich selbst ein → Lead mit Quelle „Empfehlung“. Bei Abschluss: Dank an den
  Empfehlenden (ohne Namen der empfohlenen Person).
- „Empfehlungslink senden“ in jedem Kontakt mit Abschluss/Bestandskunde; mit Bestandskunden-Modul die
  Kampagne „Jährliche Empfehlungsbitte“ (`{empfehlungslink}`).
- Abrechnung: Testphase ohne Abo-Position; danach Stripe-Position „Empfehlungen & Bewertungen“ tagesgenau
  anteilig (wie AGB „Selbstbuchung von Zusatzmodulen“). Ohne Abo/Startpreis-Phase → Modul trotzdem frei,
  Aufgabe „Preis anpassen“ für Ole. Im Angebot buchbar (ohne Testphase, ab Start berechnet).
- WhatsApp-Vorlagen `review_request`, `referral_request`, `referral_thanks`, `referral_update` werden mit dem Modul automatisch
  bei Meta eingereicht (Kategorie MARKETING). Bis zur Freigabe warten die Nachfragen.

## Umbau 19./20.11.2026 („Champions“, Plan `docs/ux/2026-11-19-empfehlung-champions.md`)

Das Modul bleibt ausgeblendet (`EMPFEHLUNG_MODULE_AVAILABLE = false`), Einschalten entscheidet Ole. Rechtliche
Bewertung: `docs/recht/empfehlungsmodul-2026-11-19.md`. Zielbild: App öffnen, sehen, wen ich heute frage und warum,
ein Tipp, fertig. Drei Abläufe:

1. **Einwilligung beim Abschluss** (Paket 1): Häkchen „Kunde hat zugestimmt“ in der Abschluss-Karte, nie vorausgefüllt,
   gespeichert mit Wortlaut (`FEEDBACK_CONSENT_TEXT`, „höchstens 3-mal im Jahr“), Zeitpunkt und Quelle. Ohne
   Einwilligung geht keine Vorlage raus (R1, R2), alle Wege zählen gegen eine gemeinsame Obergrenze von 3
   Empfehlungsbitten in 365 Tagen (R3, `referralAskCheck`/`recordReferralAsk` über das Änderungsprotokoll). Texte an
   Kunden in Du und Sie (`defaultText`, `Customer.leadAddress`/`bestandAddress`).
2. **„Heute fragen“** (Paket 2, Kartentitel seit 20.11.2026 „Heute um Empfehlung bitten“): Reiter Übersicht | Teilen | Einstellungen, Wert-Zeile in Euro, Liste mit Grund und
   einem Knopf „Empfehlungslink senden“ (einzige Hauptaktion), „Zu erledigen“ nur wenn etwas offen ist, Trichter eingeklappt.
3. **Empfehlung zu Abschluss** (Paket 3):
   - Seite des Empfehlenden `/empfehlung/[token]`: ein Satz Einleitung (mit „Sie geben keine Daten weiter“), Angebot
     als Zeile, Auswahl **An wen?** (Freunde/Familie = du, Kollegen/Nachbarn = Sie, `SHARE_AUDIENCES`), Vorschau,
     Knopf **Per WhatsApp weiterleiten**, „Gern an mehrere schicken“. Kein Feld für Daten Dritter. Der geteilte Link
     trägt die Ansprache (`?an=du`). Allgemeiner Link: „Schon Kunde? Persönlichen Link holen“ eingeklappt.
   - Kontaktseite `/empfehlung/[token]/kontakt`: „Empfohlen von …“, Angebot als Überschrift, ein Satz, Name und Handy,
     „Mehr angeben“ (E-Mail, Thema, Nachricht), freiwilliges Häkchen Rückmeldung (`statusConsentText`), Knopf
     **Rückruf anfordern**, darunter die Einwilligung als Satz (`contactConsentText`: wer, Kanäle, Zweck, Widerruf,
     Link Datenschutz). Absenden = Einwilligung; Wortlaut und Zeitstempel stehen im Lead (`formData` „Einwilligung“).
     WhatsApp-Weg darunter (Hinweis „Damit nehmen Sie selbst Kontakt … auf“, Ref-Code bleibt). Rechtlicher Fuß über
     `ReferralShell` (`components/empfehlung/public-shell.tsx`). Erfolgsseite mit Nummer und **Nummer speichern**
     (vCard über `/empfehlung/[token]/nummer`, Nummer aus Erstinformation, Impressum oder WhatsApp).
   - Keine automatische Erstnachricht an Empfohlene: Leads aus dem Formular bekommen `outreachStatus = skipped_contact`.
   - Sofort-Anruf: `processNewLead` schickt bei Quelle Empfehlung den Push „Empfehlung von {Vorname}: jetzt anrufen“
     (Tag `empfehlung-lead:<id>`, Gesprächseinstieg, keine Nummern; nur an Geräte mit erlaubten Mitteilungen).
     `getCallbackLeads` setzt den Kontakt ganz oben in „Neue Leads: jetzt anrufen“ (vor „Kein WhatsApp“) mit
     „{Empfehlender} hat mir erzählt, dass …“, bis zum ersten Anruf (`firstContactAt` bzw. `callStartedAt`).
     Kennzahl „Zeit bis zum ersten Anruf (Median)“ in „Auswertung ansehen“.
   - Dank-Schleife: `sendReferralThanks` (nur mit statusConsent der empfohlenen Person und Einwilligung des
     Empfehlenden) mit „Ihr Link funktioniert weiterhin“ unter der Obergrenze, danach nach `followUpHours` (Standard
     48 h) eine Anruf-Aufgabe mit Gesprächssatz (`thanksFollowUpNote`), keine zweite Nachricht.

### Beim Einschalten nötig (Stufe A, Ole)

- `EMPFEHLUNG_MODULE_AVAILABLE = true` nur durch Ole.
- ProductUpdate-Migration (`kind` neu, `audience` software) und Eintrag in `docs/webseite-offen.md` (Du-Form,
  „demnächst“ nur für Angekündigtes).
- Vorlagen bei Meta neu einreichen: `review_request`, `referral_request`, `referral_thanks` (neue Texte mit STOPP, Dank
  mit Link), zusätzlich Du-Fassungen; `referral_update` freigeben (`src/lib/whatsapp/template-plan.ts`).
- AGB-Testphase (Offen Nr. 1), AVV mit Zweck „Nachfrage, Empfehlungen, KI-Einordnung“ und Betroffenen „empfohlene
  Personen“ (Nr. 2), Datenschutzhinweise zu ReferralVisit (Nr. 6), Löschfrist 12 Monate für Empfehlungs-Leads ohne
  Abschluss. Datenschutzhinweis zur Kontaktseite um „Rückruf anfordern = Einwilligung“ ergänzen.
- `docs/hilfe.md` und diese Datei prüfen, Hilfeartikel „Ohne eigenes Google-Profil“.
- Erklärvideos prüfen (`python3 tools/erklaervideos/betroffen.py`); das Modul darf heute in keinem vorkommen.
- Paketpreis für Agenturen mit mehreren Beratern klären.
- Bestand-Team: Kampagne „Jährliche Empfehlungsbitte“ an dieselbe Einwilligung und die gemeinsame Obergrenze binden
  (`referralAskCheck`, `recordReferralAsk`, `renderText` mit `an` und `thema`).
- Entscheidung Recht bzw. Ole: Dank an Empfehlende ohne statusConsent (an kein Ereignis gebunden) gibt es bewusst nicht.

## Ausbau 14.11.2026 (Empfehlungs-Playbook)

Regeln und Texte: `src/lib/empfehlung/shared.ts` (unterer Teil), Abläufe: `requests.ts`.

1. **Empfehlungsangebot** (`offerKind`: none | ordner | kfz | luecke | custom): Die empfohlene Person bekommt einen
   kostenlosen Check statt „Kontakt aufnehmen“. Steht auf der Seite des Empfehlenden, auf der Kontaktseite („Auf
   Empfehlung von …“), im Teilen-Text, in der Link-Vorschau und im Lead („Angebot“). Eigenes Angebot ohne Prämien,
   Beträge, Garantien; Hinweis bei „unabhängig“ für gebundene Vertreter. Standard „none“ = wie bisher.
2. **Link sofort bei Lob** (`referralOnPraise`, Standard an), siehe oben.
3. **Anlässe**: „Empfehlungslink senden“ mit Anlass (Schaden geregelt, gespart, Jahresgespräch) → passender Text im
   offenen Chat; sonst die freigegebene Vorlage.
4. **Gesprächsmodus**: „Im Termin zeigen“ im Kontakt (QR zum persönlichen Link, auch für Online-Beratung) und
   Signatur-Zeile mit dem **allgemeinen Link** (`ReferralLink.kind = general`, keinem Kunden zugeordnet → kein
   Dank, keine Rückmeldung, kein Dankeschön). Bewusst kein gedruckter Aufsteller (Ole, 14.11.2026: Kunden
   arbeiten digital).
5. **Nachfassen** (`followUpHours`, Standard 48, 0 = aus): Nach „senden“ oder „im Termin zeigen“ Wiedervorlage
   „Empfehlung nachfassen“ am Kontakt, nur wenn dort keine andere Wiedervorlage steht. Nicht bei automatischen Bitten.
6. **Trichter mit Diagnose**: Links ausgegeben → geöffnet → einzelne Besucher (`ReferralVisit`, nur Hash, 12 Monate,
   Vorschau-Bots zählen nicht) → Empfehlungen → Neukunden; `funnelHint` nennt den auffälligsten Übergang.
7. **Rückmeldung an Empfehlende** (`statusUpdates`, Standard an): „hat sich gemeldet“ und „Termin vereinbart“, nur mit
   freiwilliger Einwilligung der empfohlenen Person (zweites Häkchen auf der Kontaktseite), Vorlage `referral_update`.
8. **Gesprächsleitfaden**: nur in der Hilfe (`docs/hilfe.md`), nicht auf der Modulseite (Ole, 14.11.2026: Seite war überladen).
9. **Dankeschön für Empfehlende** (`rewardKind`: none | gutschein | spende, Standard aus): vorher angekündigt auf der
   Seite des Empfehlenden; fällig nach stattgefundenem Gespräch oder 30 Tage nach Abschluss; Aufgabe + Liste „Offene
   Dankeschöns“, Übergabe von Hand. Nie an die empfohlene Person, nie bei Selbstempfehlung (gleiche Nummer), nie über
   den allgemeinen Link. Einschalten nur mit Bestätigung der rechtlichen Prüfung; über 15 € deutlicher Hinweis.

10. **WhatsApp-Knopf** auf der Kontaktseite (wenn WhatsApp verbunden): vorgeschriebene Anfrage an die Nummer des
    Vertreters mit Code `(Ref xxxxxxxx)` (erste 8 Zeichen des Link-Tokens). Eingehende Nachricht mit Code von einem
    unbekannten Absender → Lead „Empfehlung“ am Chat, ohne Erstanschreiben (`handleReferralInbound`, Aufruf in
    `whatsapp/gateway.ts`). Das Formular bleibt als zweite Möglichkeit.
11. **Persönlicher Link aus der Signatur**: Auf der allgemeinen Seite kann ein Kunde seine Handynummer angeben
    und landet auf seinem persönlichen Link (`claimPersonalLink`; nur Abschluss/Bestandskunde, gedrosselt je IP).
12. **Nach dem Termin** (`referralAfterAppointment`, Standard aus): Termin mit einem Kunden als stattgefunden markiert →
    2 Stunden bis 3 Tage später Empfehlungslink (Vorlage `referral_request`), höchstens alle 180 Tage je Kontakt, nicht
    bei Kritik/offener Aufgabe „unzufrieden“ und nicht, solange die Nachfrage nach dem Abschluss läuft.

Noch nicht gebaut (Ideen aus den Kiwus-Videos): Retargeting-Pixel auf der Empfehlungsseite samt Einwilligung,
Vergleich des Trichters mit dem Schnitt aller Agenturen, Foto/Video des Vertreters auf der Seite, Feedback-Ansicht für
Online-Termine, Tippgeber-Portal (eigenes Modul), Telefon-KI.

## Offen für Ole

1. **AGB:** Die Testphase (kostenlos, danach automatisch kostenpflichtig, Erinnerung vorher) ist in den
   AGB noch nicht geregelt. Die Selbstbuchung/Kündigung von Zusatzmodulen ist abgedeckt. Vorschlag zum
   Prüfen (nicht eingebaut, weil Rechtstext):
   > „Für einzelne Zusatzmodule kann der Anbieter eine kostenlose Testphase anbieten. Sie beginnt mit der
   > Buchung im Kundenbereich und endet nach der dort genannten Dauer. Kündigt der Kunde nicht bis zum Ende
   > der Testphase, wird das Modul danach zum genannten Preis berechnet. Der Anbieter erinnert den Kunden
   > vor Ende der Testphase in Textform. Eine Testphase wird je Kunde und Modul nur einmal gewährt.“
   Zusätzlich Leistungsbeschreibung des Moduls (wie beim Bestandskunden-Modul) und `LEGAL_VERSION` erhöhen.
2. **AVV:** Zweck „Nachfrage nach Abschluss und Empfehlungen (inkl. Einordnung von Antworten durch KI)“ und
   Betroffene „empfohlene Personen“ ergänzen.
3. **Dank an Empfehlende:** Satz „ich konnte weiterhelfen“ rechtlich prüfen (verrät indirekt, dass die
   empfohlene Person Kunde wurde). Notfalls neutraler formulieren (Text ist je Vertreter änderbar).
4. **Dankeschön für Empfehlende** ist eingebaut, aber standardmäßig aus. Rechtslage (§ 48b VAG, BaFin-Merkblatt zum
   Sondervergütungsverbot): Tippgeber sind im Regelfall nicht erfasst; ist der Tippgeber zugleich Kunde, ist die
   Zahlung trotzdem daran zu messen. Bis 15 € je Versicherungsverhältnis und Jahr unkritisch. **Bitte anwaltlich
   prüfen lassen**, bevor wir es Kunden aktiv empfehlen, und die Vorgaben der Allianz für Vertreter klären.
   Gutscheine für die **empfohlene** Person („Wette“) gibt es bewusst nicht.
6. **Einwilligung „Rückmeldung an Empfehlende“** (Text in `statusConsentText`) und die Zählung einzelner Besucher
   (Hash aus Link, IP, Browser) rechtlich prüfen; Datenschutzhinweise und AVV ergänzen.
7. **Vorlage `referral_update`** wird bei bestehenden Modul-Kunden automatisch nachgereicht; bis zur Freigabe warten
   die Rückmeldungen.
8. **Webseite** (`/software`) nach dem Livegang anpassen (AGENTS.md).
9. **Persönlicher Link per Handynummer:** Wer die Nummer eines Kunden kennt, erfährt darüber, dass sie Kunde ist
   (und den Vornamen auf der Seite). Bewusst in Kauf genommen (gedrosselt); bei Bedenken per SMS/WhatsApp-Code absichern.
5. **Ankündigung:** Admin → Nutzung → „Zusatzmodul Empfehlungen & Bewertungen“: Entwurf prüfen, dann
   einmalig mit Knopf an alle aktiven Kunden ohne Modul senden.
