# UX-Runde Kundenbereich, Team A „Einstieg und Heute“ (19.11.2026)

Bereich: Startseite „Heute“ (/buyer), Willkommen (erster Tag ohne Leads), /buyer/einrichtung, Navigation (Profilmenü),
/buyer/empfehlen, /buyer/hilfe/whatsapp, /buyer/bestellen; geprüft ohne Änderung: /buyer/neuigkeiten, /buyer/einfuehrung.
Vorbild: „Angebot für den Termin“ (docs/ux/2026-11-19-angebot-einfach.md). Testdaten lokal (Demo-Kunde Max Berger mit
45 Kontakten, ein neuer Lead ohne WhatsApp von vor 4 Minuten; Konto in der Einrichtung mit Start morgen; Konto am ersten Tag).
Screenshots lagen im Arbeitsordner der Sitzung (`scratchpad/ux-runde/a-einstieg/vorher|nachher`), nicht im Repo.

## Heute (/buyer)

**Personas**
- Einzelkämpfer am Handy zwischen zwei Terminen: „Wen muss ich jetzt anrufen?“ Ein neuer Lead ohne WhatsApp stand in der
  Karte „Anrufen“ (vierte bis sechste Karte) zwischen 20 überfälligen Wiedervorlagen, mit „heute“ statt „vor 4 Min.“.
- Makler am Desktop: rechts öffnete sich der erste Termin, nicht der neue Lead.
- Agentur: rotes „Überfällig“ in jeder Zeile, rot verliert so seine Bedeutung („Sofort“ ging darin unter).

**Warum schwer?** Erster Blick: das Dringendste (neuer Lead, Minuten zählen) war nicht oben. Farben: rot für alles.
Hauptaktion: „Anrufliste starten“ war primär, auch wenn ein neuer Lead wartet. Begriffe: „heute“ statt Wartezeit.

**Geändert**
1. Eigene Karte **„Neue Leads: jetzt anrufen“** ganz oben (vor „Wartet auf Sie“), je Zeile Wartezeit, Grund und Produkt
   („vor 4 Min. · Kein WhatsApp · Hausrat“), „Anrufen“ als Hauptaktion. Die Anrufliste startet weiter mit diesen Leads.
2. Solange neue Leads warten, ist „Anrufliste starten“ zweitrangig (eine Hauptaktion je Seite).
3. Wartezeiten in Minuten und Stunden (`src/lib/eingang-alter.ts`), „Überfällig“ in Bernstein statt Rot; Rot nur noch für
   „neu und wartet“.
4. Desktop: rechts öffnet sich zuerst der neue Lead.
5. „Nächste Tage“ (keine Aufgabe für heute) ist zugeklappt wie „Aufräumen“ (Ole, 19.11.2026).
6. Zähler „N neu“ an Kontakte zählt nur noch neue Leads, die auf den Vermittler warten, dieselbe Menge wie die Karte
   „Neue Leads“ (`src/lib/neue-leads.ts`, eine Funktion für beide). Vorher: alle neuen Kontakte der letzten 30 Tage,
   auch die, die der Assistent per WhatsApp betreut.
7. Hinweis „Benachrichtigungen einschalten“ (alle Seiten): eine schmale Zeile mit Glocke, „Benachrichtigungen aus“,
   Textknopf „Einschalten“ und Schließen statt Karte mit großem blauem Knopf (Ole, 19.11.2026).

Gemessen (Handy 390 px, Demo-Kunde): Der neue Lead stand vorher bei rund 1.100 px (fünfte Karte, unter dem ersten
Bildschirm), nachher bei rund 380 px (erste Karte). Desktop: rechts war der Termin von morgen offen, jetzt der neue Lead.

KPI: Zeit bis Erstkontakt (neue Leads sichtbar in der ersten Sekunde), erledigte Aufgaben. SUS 84 → 91.

## Willkommen (noch kein Lead, vor dem Start)

**Warum schwer?** Am Handy stand zuerst das Einführungsvideo, darunter alle offenen Einrichtungsschritte (bis zu 9 Zeilen);
„Einrichtung fortsetzen“ lag unter dem ersten Bildschirm.
**Geändert:** Start-Karte zuerst, nur die nächsten drei Schritte plus „und N weitere“, Video darunter.
Gemessen (Handy): „Einrichtung fortsetzen“ vorher bei rund 1.370 px, nachher bei rund 740 px (erster Bildschirm).
KPI: Selbstständigkeit im Onboarding. SUS 80 → 90.

## Einrichtung (/buyer/einrichtung)

**Warum schwer?** Doppelt: Oben eine Liste aller Schritte, darunter dieselben Schritte als Karten. Am Handy begann der
offene Schritt erst nach rund zwei Bildschirmen. Der nächste Schritt war nicht markiert.
**Geändert:** Liste oben entfällt (Fortschritt und „Unser Teil“ bleiben, der Link zum Einführungsvideo steht unter den
Schritten). Der nächste offene Schritt ist aufgeklappt, blau umrandet und mit „Als Nächstes“ beschriftet. Der Hinweis
„Benachrichtigungen einschalten“ erscheint hier nicht, dafür gibt es den Schritt „App aufs Handy und Mitteilungen“.
Nichts Funktionales entfällt: jeder Schritt bleibt als Karte.
Gemessen (Handy): Der offene Schritt begann vorher bei rund 1.300 px, nachher bei rund 590 px (erster Bildschirm);
Seite 3.499 → 2.877 px.
KPI: Selbstständigkeit (Einrichtung ohne Support). SUS 76 → 90.

## Navigation

„Kollegen empfehlen“ war nur über Einstellungen → Kachel erreichbar. Jetzt zusätzlich im Profilmenü (nur Inhaber).
KPI: Kollegen-Empfehlungen.

## Kollegen empfehlen (/buyer/empfehlen)

**Warum schwer?** Fünf Blöcke, die Prämie stand dreimal da (Kacheln, „Ihr Dankeschön“, Untertitel), vor den
Teilen-Knöpfen ein 8-zeiliges Textfeld, QR-Code als eigene Karte.
**Geändert:** Kacheln „Ihr Kollege bekommt / Sie bekommen“ nebeneinander, eine Karte „Link teilen“ mit Teilen bzw.
WhatsApp direkt unter dem Link, Nachricht und QR-Code aufklappbar, „So funktioniert die Prämie“ (vollständiger Text)
aufklappbar am Ende. Der geteilte Text ist unverändert (inkl. Offenlegung der Gutschrift).
Gemessen (Handy): Seite 2.180 → 1.320 px, WhatsApp-Knopf vorher bei rund 1.300 px, nachher bei rund 680 px.
KPI: Kollegen-Empfehlungen. SUS 78 → 91.

## WhatsApp verbinden, Hilfe (/buyer/hilfe/whatsapp)

**Warum schwer?** 15 schematische Bildschirme untereinander, am Handy rund neun Bildschirme lang.
**Geändert:** Anleitung und Video bleiben oben, die 15 Bildschirme sind zum Aufklappen. Handy: 4.558 → 1.473 px.
KPI: Selbstständigkeit. SUS 82 → 90.

## Leads bestellen (/buyer/bestellen, nur Pay-per-Lead)

Tippziele auf 40 bis 44 px (Woche wählen, Plus/Minus, „Jede Woche wiederholen“). Sonst unverändert (Zahlungsablauf).

## Geprüft, ohne Änderung

Neuigkeiten (seit 15.11. kompakt, ältere zugeklappt) und Einführung (drei Videos) erfüllen die Regeln.

## Entscheidungen Ole (19.11.2026, „3x ja“)

Benachrichtigungs-Hinweis als schmale Zeile, Zähler an Kontakte wie die Karte „Neue Leads“, „Nächste Tage“ zugeklappt:
umgesetzt (siehe Heute, Punkte 5 bis 7).
