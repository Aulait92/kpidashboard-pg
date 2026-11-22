# Belegwerkzeug für DATEV: Vergleich und Empfehlung (22.11.2026)

Auftrag Ole (22.11.2026): Buchhaltung automatisieren, Rechnungen aller Dienstleister historisch (ab 1.1.2026) und künftig
automatisch holen und den Buchungen zuordnen. Vorgaben Ole: Steuerberater arbeitet mit DATEV, spezialisiertes
Belegwerkzeug statt Eigenbau. Beteiligt: CFO (Vergleich), Red Team (Prüfung, vom CFO nach der Methode aus
`.claude/agents/red-team.md` durchgeführt, kein eigener Subagent verfügbar). Stufe A (Vertrag, laufende Kosten über
500 € im Jahr), Entscheidung Ole.

## Empfehlung

**GetMyInvoices (Tarif Professional, ca. 99 € netto/Monat) als Sammel- und Abgleichwerkzeug, Übergabe per DATEV-Schnittstelle
in DATEV Unternehmen online der Kanzlei.**

1. GetMyInvoices ist das einzige der Kandidaten, das genau unsere Lücke füllt: Abruf aus Anbieterportalen plus
   E-Mail-Postfächer plus Bank- und Amex-Abgleich, und es ist seit 2017 DATEV-Marktplatzpartner (Belegbilderservice,
   Belege landen in Unternehmen online beim Steuerberater).
2. Candis kostet ab 389 €/Monat und ist für 50 bis 150 Belege überdimensioniert; DATEV allein holt nichts aus Portalen und
   durchsucht keine Postfächer rückwirkend; Lexware Office und BuchhaltungsButler sind eigene Buchhaltungen und
   doppeln die Arbeit des Steuerberaters in DATEV.
3. GetMyInvoices hat eine API (API-Schlüssel, Dokumente auflisten und abrufen), mit der unsere App nachts die Belege holt und
   je `BankTransaction` „Beleg vorhanden ja/nein + Link“ anzeigen kann, ohne eigenen Portal-Eigenbau.

## Vergleich (Stand 22.11.2026)

Hinweis zur Quelle: Die Anbieterseiten (getmyinvoices.com, candis.io) waren aus dieser Sitzung nicht abrufbar (Netzwerk
der Umgebung). Angaben stammen aus Websuche (Anbieter-Snippets, DATEV-Marktplatz, DATEV-Preisliste 08/2026,
Vergleichsseiten). „nicht geprüft“ heißt: keine belastbare Quelle gefunden, vor Vertrag im Testzugang prüfen.

| Kriterium | GetMyInvoices | Candis | DATEV Unternehmen online + Belege online | Lexware Office (DATEV-Export) | BuchhaltungsButler |
|---|---|---|---|---|---|
| 1 Portalabruf | Ja, laut Anbieter 5.000 bis 10.000+ Portale; Amex mit eigener Schnittstelle (Amex-Seite bestätigt). Abdeckung unserer 19 Anbieter einzeln: nicht geprüft | Ja, laut Nutzerangabe 1.000+ Portale; einzeln nicht geprüft | Nein (nur Upload, App, Mail-Weiterleitung) | Nein bzw. nicht geprüft | nicht geprüft |
| 2 Postfächer (Gmail, eigene Domain, M365), rückwirkend | Ja, E-Mail-Abruf; Microsoft 365 und Rückwirkung: nicht geprüft | Ja (E-Mail-Eingang); Rückwirkung nicht geprüft | Nur Weiterleitung an Upload-Mail-Adresse, keine Suche im Postfach | Mail-Weiterleitung; nicht geprüft | Mail-Weiterleitung; nicht geprüft |
| 3 Bankabgleich (Commerzbank PSD2/CSV, Amex) | Ja, Bankkonten je Tarif (Professional laut Vergleichsseite 5) und Amex-Schnittstelle; Abgleichlogik nicht geprüft | Fokus Candis-Kreditkarte; Bankabgleich nicht geprüft | Ja, Bank online mit Bankdatenservice 1,37 €/Konto, Belege zu Umsätzen zuordnen | Ja, Bankabgleich im Produkt | Ja, Bankabgleich ist Kernfunktion |
| 4 Übergabe an DATEV | DATEV-Partner seit 11/2017, Belegbilderservice nach Unternehmen online; Buchungsvorschläge (Rechnungsdatenservice 1.0): nicht geprüft | Lizenzierte DATEV-Schnittstelle, Buchungs- und Stammdaten, Buchungsvorschläge | Ist DATEV | DATEV-Export und Rechnungsdatenservice 1.0 / Buchungsdatenservice | DATEV-Export (Buchungen und Belege verknüpft) |
| 5 API/Webhook für unsere App | REST-API mit Schlüssel (Make-Modul „neue Dokumente beobachten“); nativer Webhook nicht geprüft | nicht geprüft | Für uns praktisch nein (Partner-Schnittstellen nur für Marktplatzpartner) | REST-API ab Tarif XL | API vorhanden, Umfang nicht geprüft |
| 6 Kosten/Monat bei 50 bis 150 Belegen | Professional 99 € (200 Dok., 50 Portale); Standard 59 € (Limits nicht geprüft); je Mehrbeleg 0,25 € | ab 389 € (Basis) | 11,56 € + 3,83 € + 2 × 1,37 € ≈ 18 € (oft über die Kanzlei abgerechnet) | ab 7,90 €, mit API (XL) 32,90 € | ab 29,90 € (Light), Tarif mit API nicht geprüft |
| 7 Datenschutz (EU, AVV) | Anbieter fino data services GmbH, Kassel; Serverstandort und AVV: nicht geprüft | Berlin; nicht geprüft | DATEV eG, Nürnberg, Rechenzentrum Deutschland | AVV vorhanden (lexoffice-AVV); US-Übermittlung mit Standardvertragsklauseln | AVV vorhanden (Download) |
| 8 Aufwand Ole | mittel: ca. 3 bis 5 Stunden (19 Portalzugänge, 3 Postfächer, 2 Konten, DATEV-Verbindung), danach Pflege bei 2FA-Abbrüchen | hoch (Freigabe-Workflows, Kostenstellen) | gering, aber dauerhaft Handarbeit für jeden Beleg | hoch (Wechsel der Buchhaltung) | hoch (Wechsel der Buchhaltung) |
| Ergebnis | **Empfohlen** | Zu teuer | Nur als Ziel, nicht als Sammler | Doppelt zur Kanzlei | Doppelt zur Kanzlei |

## Kosten pro Monat (netto)

| Posten | Vorsichtiger Fall | Erwarteter Fall |
|---|---|---|
| GetMyInvoices Professional | 99 € | 99 € (jährlich 5 % Rabatt, ca. 94 €) |
| Nachholen 1.1. bis 30.11.2026 (ca. 1.100 Belege, einmalig) | ca. 275 € (0,25 € je Mehrbeleg) oder 2 Monate Advanced (179 €, 500 Dok.) | im Kontingent verteilt, wenn Portale nur Monat für Monat liefern |
| DATEV Unternehmen online, Belege online, Bankdatenservice 2 Konten, Belegbilderservice | ca. 21 € (wenn uns berechnet) | 0 € (wenn Kanzlei es trägt oder schon hat) |
| Summe laufend | ca. 120 € | ca. 95 bis 100 € |
| Einmalig | ca. 275 € Nachholen | 0 bis 275 € |

Jahr: ca. 1.200 bis 1.450 € laufend plus einmalig bis 275 €. Gegenrechnung: Spart der Steuerberater 1 bis 2 Stunden
Belegsuche je Monat (Stundensatz beim Steuerberater erfragen), trägt sich das Werkzeug ab etwa 60 bis 100 € Stundensatz.
Monatszahlung statt Jahresvertrag im ersten Quartal (Ausstieg möglich, 5 % Rabatt sind weniger wert als die Option).

## Was Ole einrichten muss

1. Steuerberater fragen (Fragen unten), vor allem: Unternehmen online vorhanden, welcher Weg der Übergabe gewünscht.
2. GetMyInvoices 14 Tage testen (ohne Kreditkarte), in dieser Zeit die Abdeckungsprüfung unten machen.
3. Portale verbinden: Meta Ads, Google Ads, Google Workspace, Anthropic, OpenAI, Instantly, Zapier, Slack, Railway,
   360dialog, Stripe, Lovable, Outbrain, Vodafone, Telekom, Apple, PayPal, Fiverr, Amex, Commerzbank. Wo ein Portal fehlt
   oder an 2FA scheitert: Mail-Weg nutzen (die meisten SaaS schicken die Rechnung ohnehin per Mail).
4. Postfächer verbinden: Gmail, hallo@olekannapinn.com, Microsoft 365; Import ab 1.1.2026 starten.
5. Commerzbank Geschäftskonto und Amex verbinden (Amex über eigene Schnittstelle, Bank über Bankzugang oder CSV).
6. DATEV-Verbindung aktivieren (Kanzlei gibt Mandantennummer und Zugang frei), erst Testlauf mit einem Monat.
7. API-Schlüssel in GetMyInvoices anlegen und selbst in Railway hinterlegen (nie in den Chat); dann baut der CTO den
   nächtlichen Abgleich mit `BankTransaction`.

Für die App (CTO, nach Freigabe): nachts Dokumente per API holen, über Betrag, Datum und Gegenpartei zuordnen,
pro Umsatz unter Geld „Beleg ja/nein + Link“ anzeigen, Liste „Umsätze ohne Beleg“ als Aufgabe. Keine Belege oder
Bankdaten ins Repo, nur Verweis (Dokument-ID, Link).

## Red Team: die drei stärksten Einwände

1. **Portalabdeckung ist nicht bewiesen.** Für keinen der 19 Anbieter einzeln belegt; Meta, Google und Apple arbeiten mit
   2FA, Robot-Abrufe brechen dort erfahrungsgemäß ab. Entkräftet durch: Abdeckungsprüfung im Test (Ziel mindestens 80 %
   der Belege automatisch, Rest über Mail-Import); Stripe-basierte SaaS (Anthropic, OpenAI, Railway, Lovable, Instantly,
   Zapier, Slack) kommen fast immer auch per Mail.
2. **„Direkt den Buchungen zuordnen“ passiert am Ende in DATEV, nicht in GetMyInvoices.** Laut DATEV-Community kein voll
   automatischer Transfer, Belege werden in Unternehmen online als Buchungsvorschlag bzw. über Bank online verknüpft.
   Doppelte Zuordnung (GetMyInvoices, DATEV, unsere App) kann auseinanderlaufen. Entkräftet durch: Steuerberater legt fest,
   welches System führt (Empfehlung: DATEV Bank online führt, GetMyInvoices liefert, unsere App zeigt nur an).
3. **Datenschutz und GoBD ungeklärt.** Serverstandort, AVV und Unterauftragnehmer von GetMyInvoices nicht geprüft; Zugriff
   auf drei komplette Postfächer (auch private Gmail-Mails) und Bankkonten. Zudem braucht es eine Verfahrensdokumentation
   und ein GoBD-Archiv. Entkräftet durch: AVV und TOM vor Vertrag anfordern (Datenschutz-Agent prüft), Postfach-Import
   per Filter auf Rechnungen begrenzen, Archiv bleibt DATEV Unternehmen online.

Weitere Punkte: Preise nur aus Drittquellen (vor Vertrag auf der Preisseite prüfen); Lock-in gering, Belege bleiben in
DATEV; Alternative bei Ausfall wäre Candis, nicht Eigenbau.

## Offene Fragen an den Steuerberater

1. Haben wir bereits DATEV Unternehmen online und Belege online, wer trägt die Kosten?
2. Gewünschter Übergabeweg: nur Belegbilder (Belegbilderservice) oder Buchungsvorschläge (Rechnungsdatenservice 1.0)?
3. Wer ordnet Beleg und Bankumsatz zu: wir (Bank online) oder die Kanzlei? Ändert das das Honorar?
4. Reicht DATEV Unternehmen online als GoBD-Archiv, und brauchen wir eine Verfahrensdokumentation für den Ablauf?
5. Rückwirkend ab 1.1.2026: bereits verbuchte Monate neu liefern oder nur fehlende Belege?
6. Wie sollen Reverse-Charge-Rechnungen (Meta, Google, Anthropic, OpenAI, Lovable usw., § 13b) gekennzeichnet sein?
7. Stundensatz für Belegarbeit heute, damit wir die Ersparnis messen können.

## Abdeckungsprüfung im Test (Pflicht vor Vertrag)

Für jeden der 19 Anbieter festhalten: Portal vorhanden ja/nein, Abruf klappt ja/nein, Mail-Import als Rückfall ja/nein.
Dazu: Microsoft-365-Anbindung, Rückwirkung ab 1.1.2026 im Postfach, Serverstandort und AVV, API-Endpunkt für Dokumente
mit Zahlungsstatus, Webhook ja/nein.

## Quellen (Websuche, 22.11.2026)

- DATEV-Preisliste für Unternehmen, Stand 08/2026: datev.de/content/dam/markenassets/preislisten/auszug_der_datev-preisliste_fuer_unternehmen.pdf
- DATEV-Marktplatz GetMyInvoices: datev.de/web/de/marktplatz/getmyinvoices
- DATEV-Community „Candis, getmyinvoices“: datev-community.de/t5/Unternehmen-online/Candis-getmyinvoices/td-p/66751
- American Express zu GetMyInvoices: americanexpress.com/de-de/amexcited/business/benefits/vorteile/getmyinvoices-fuer-rechnungsmanagement
- Make-Modul GetMyInvoices (API): make.com/en/help/app/getmyinvoices
- GetMyInvoices Tarife (Drittquellen): stark.marketing/blog/getmyinvoices-test, yupana.de/vergleiche/getmyinvoices-alternative
- Candis Preise: candis.io/preise.md
- Lexware DATEV-Datenservices: help.lexware.de (Rechnungsdatenservice 1.0 / Buchungsdatenservice), lexware.de/funktionen/datev-schnittstelle
- BuchhaltungsButler: gruenderkueche.de/empfehlungen/buchhaltungsbutler-im-test, buchhaltungsbutler.de (AVV)
- Nicht abrufbar aus der Sitzung: getmyinvoices.com, candis.io (Hosts müssen in den Netzwerkeinstellungen erlaubt werden)

## Belegprüfung Postfach performancegrowth.de (22.11.2026)

Grundlage: Ausgaben seit 1.1.2026 je Gegenpartei (Ops-Diagnose `q=bank-anbieter`, 35 Anbieter, 346 Umsätze) gegen Rechnungsmails im
Microsoft-365-Postfach ole.kannapinn@performancegrowth.de. Das Postfach enthält erst Mails ab 16.04.2026.

- Vollständig per Postfach: Asana (Abo gekündigt, läuft bis 12.12.2026), seven.io.
- Teilweise: Instantly (ab Juni, Stripe-Belege), Anthropic (erst ab November).
- Fehlt im Postfach, Abruf per Portal nötig: Meta (beide Werbekonten, ca. 41.800 €, größter Posten), Amex-Kontoauszüge,
  Microsoft 365 (dazu offene Mahnung, Karte abgelehnt), Google Cloud/Workspace/One, Outbrain, Zapier, Airtable, Slack, Railway,
  Telekom, Commerzbank-Postbox, Fiverr, XING, Byteplant, Wolt, Klarna (Händlerbeleg beim Händler).
- Über DATEV bzw. Post: Steuerberater Dr. Müller, DATEV eG, odacer.
- Von Meta und Google gab es keine Mails an dieses Postfach: Rechnungen gehen vermutlich an Gmail bzw. hallo@olekannapinn.com.
  Empfehlung: diese Postfächer im Belegwerkzeug anbinden, künftig alle Rechnungsadressen auf eine Adresse umstellen.

## Datenschutz-Vorprüfung GetMyInvoices (22.11.2026, Quellen gelesen)

Quellen: getmyinvoices.com/de/sicherheit, getmyinvoices.com/de/avv, AVV-PDF legal.finodata.com/de/AVV.pdf (Stand 01.08.2023),
Liste weitere Auftragsverarbeiter legal.finodata.com/de/Weiteren_Auftragsverarbeiter.pdf (Stand März 2025),
sites.getmyinvoices.com/mcp.

- Anbieter: fino data services GmbH, Universitätsplatz 12, 34127 Kassel. AVV nach Art. 28 DSGVO vorhanden, online abrufbar.
- Speicherung: Rechenzentren in Deutschland (AWS Frankfurt, Google Cloud Deutschland), ISO 27001, SOC 1, ISAE 3402;
  AES-256, Schlüssel je Konto, Zugangsdaten verschlüsselt; GetMyInvoices selbst nach ISO/IEC 27001 zertifiziert; 2FA möglich.
- Allgemeine Genehmigung für weitere Auftragsverarbeiter, Änderungen mit 4 Wochen Einspruchsfrist.
- Weitere Auftragsverarbeiter mit USA-Bezug: Mailgun (E-Mail, EU-Server, Support-Zugriff aus USA nach Freigabe), Cloudflare,
  **Plenty Staff Inc. (OCR-Training und Service)**, ActiveCampaign (CRM), Zendesk (Helpdesk), Datadog (Monitoring);
  Drittlandübermittlung über Standardvertragsklauseln.
- Bewertung: für Geschäftsrechnungen vertretbar (gelb-grün). Auflagen: (1) Postfach-Import per Filter auf Rechnungen
  begrenzen, beim privaten Gmail nur Absender bzw. Betreff mit Rechnung, keine Komplettspiegelung; (2) bei fino nachfragen,
  ob Belege für das OCR-Training durch Plenty Staff ausgeschlossen werden können (Opt-out); (3) 2FA im Konto einschalten;
  (4) AVV gilt laut Ziffer 1.1 automatisch mit dem Vertrag (Testkonto G-6712208-0 seit 22.11.2026), PDF in docs/recht/getmyinvoices-avv-2023-08-01.pdf, Unterauftragnehmer in docs/recht/getmyinvoices-unterauftragnehmer-2025-03.pdf. 2FA ist eingeschaltet (Ole, 22.11.2026).
- MCP-Server: nur lesend, ohne Aufpreis, Adresse https://api.getmyinvoices.com/accounts/mcp-v1/public/index.php;
  Einrichtung als Connector in claude.ai, danach neue Sitzung.
- Preise: auf der Preisseite werden Beträge per Skript geladen, Leistungen je Paket gelesen (Professional: 200 Dokumente,
  50 Portale, 10 Postfächer, 5 Bankkonten, 10 Nutzer); der Betrag ca. 99 € bleibt bis zur Bestätigung im Konto „nicht geprüft“.
