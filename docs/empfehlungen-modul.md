# Zusatzmodul „Empfehlungen & Bewertungen“ (Stand 14.11.2026)

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
