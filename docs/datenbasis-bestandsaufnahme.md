# Datenbasis für Benchmarks: Bestandsaufnahme der Kette je Lead (Baustein 1)

Stand 17.11.2026, Branch `diagnose-kette` (ab `claude/whatsapp-crm` f8f4249). Rein aus Code und Schema; die echten
Abdeckungsquoten liefert die neue Diagnose-Abfrage:

```
GET /api/ops/diagnose?q=kette               alle Kunden (Gesamtsicht voll, je Kunde Kurzform)
GET /api/ops/diagnose?q=kette&kunde=<ID>    ein Kunde, volle Auswertung
```

Code: `src/lib/ops/kette.ts` (Laden, nur lesend), `src/lib/ops/kette-auswertung.ts` (reine Auswertung).
Tests: `tests/unit/kette-auswertung.test.ts`, `tests/integration/ops-kette.test.ts` (keine Personendaten in der Ausgabe).

Ausgabe je Zeitraum (`d30`, `d90`, `gesamt`, nach `Lead.createdAt`) und je Kundenart (`alle`, `vermittler`, `ppl`):
`leads`, `herkunft` (airtable, meta, zapier, pool, empfehlung, bestand, eigen, sonstige) und je Stufe `erreicht` plus
`felder` (`n`, `pct` bezogen auf `erreicht`) und `zahlen` (Mediane, Termin-Ergebnisse, Lieferwege). Storno und
Cross-Selling rechnen auf Vertragsebene (`basisVertraege`). `fehlendeFelder` listet je Stufe, was es gar nicht gibt.
Je Kunde nur Kunden-ID, Name, Paket, archiviert, Kundenart. Ausgeschlossen: `Lead.isTest`, `Customer.isTest`,
`plan = internal`, das Bewertungs-Demo. Kundenart je Lead (korrigiert 18.11.2026, `kundenartFuer`): Pay-per-Lead, wenn
`subscriptionId` gesetzt ist, der Lead mit `PoolLead` verknüpft ist oder aus dem Airtable-Eingang (`PplIntake`) kommt
**und** der Kunde dieses Produkt als Bezug (`LeadSubscription.productKey`) kauft; sonst Vermittler-Kunde. Vorher zählte
jede `PplIntake`-Verknüpfung als Pay-per-Lead, der Eingang enthält aber alle Airtable-Leads (Stand 17.11.: 0 Vermittler-Leads).
Anzeigenfelder (`adPlatform`, `adFormId`, `adCampaignId`, `adSetId`, `adId`) zählen seit 18.11. unter `stufen.anzeige`.

## 1. Stufen und Felder heute

| Stufe | Feld(er) | Schema | Geschrieben in |
|---|---|---|---|
| Anzeige / Quelle | Produkt `Lead.source` | prisma/schema.prisma:607 | lib/lead-intake.ts:218 (aus `LeadSource.productKey`), lib/airtable.ts:1250, lib/ppl/engine.ts:241 |
| | Kanal `Lead.adChannel` (Meta/Outbrain/TikTok, frei) | schema:668 | lib/airtable.ts:1200 (Airtable „Source“), lib/lead-intake.ts:227 (fest „Meta“) |
| | Meta-Lead-ID `Lead.externalId` (leadgen_id) | schema:641 | lib/lead-intake.ts:217; Perspective `perspective:<id>` über app/api/leads/pool/route.ts:58 |
| | Formular-ID nur indirekt: `consentData.formId` (Einwilligungsnachweis), `LeadReentry.formId` | schema:624, :3583 | lib/lead-intake.ts:180-186; Zuordnung Formular → Kunde/Produkt über `LeadSource` (schema:2144) |
| | Kampagne, Anzeigengruppe, Anzeige | **fehlt** | Meta liefert `ad_id`, `ad_name`, `adset_name`, `campaign_name` (lib/meta-leads.ts:64-67), lib/lead-intake.ts:42-55 behält nur `campaignName`/`adName` im Zwischenobjekt, `prisma.lead.create` (lib/lead-intake.ts:215-230) speichert sie nicht. `adset_id`/`campaign_id` werden gar nicht abgefragt. Nur `UnassignedLead.payload` (schema:2174) hat sie für nicht zugeordnete Leads. |
| Lead | `Lead.createdAt` | schema:657 | Meta: `created_time` (lib/lead-intake.ts:226); Airtable: **Zuweisungsdatum**, sonst „Datum“ (lib/airtable.ts:1177-1180); Pool: Lieferzeit (lib/ppl/engine.ts:250) |
| Erster Kontakt | `firstContactAt`, `reached`, `contactAttempts`, `callAttempts` | schema:658, :660 | lib/lead-progress.ts:71-105 (Erstanschreiben, Antwort, Buchung), lib/whatsapp/outreach.ts:280-284 (automatisches WhatsApp zählt als Erstkontakt), app/buyer/actions.ts:217 und :473, app/buyer/inbox-actions.ts:145, lib/call-attempts.ts:86, lib/telefonat-server.ts:109; von Hand änderbar/löschbar app/buyer/actions.ts:378; Airtable überschreibt bei jedem Abgleich (lib/airtable.ts:1183, :1270) |
| Termin gebucht | `Appointment` (createdAt, startsAt, mode) | schema:1265 | lib/calendar/index.ts (Buchung, :414), lib/lead-manual.ts:51 (von Hand), Status „In Beratung“ (lib/lead-progress.ts:79) |
| Termin-Status | `Appointment.status` booked/completed/no_show/cancelled, `cancelledAt`, `cancelledBy` | schema:1275, :1304 | Ergebnis „Wie lief's?“ app/buyer/actions.ts:521, app/buyer/inbox-actions.ts:203, next-step-actions.ts:201; Absage lib/calendar/index.ts:511, :666; Verschieben = neu buchen + alten absagen (lib/calendar/index.ts:536-588) bzw. Zeit ändern mit Verlaufseintrag (lib/lead-manual.ts:110-115) |
| Angebot | nur Lead-Status „Angebot gesendet“; Verlaufseintrag (`LeadHistory`, Text) ; Datei `LeadFile.kind = angebot`; Angebote/Tarifauswahl am Termin `Appointment.offersJson`/`tarifauswahl` | schema:3563, :3635, :1284, :1288 | app/buyer/actions.ts:497 (ohne Verlaufseintrag), app/buyer/inbox-actions.ts:129/150 und :224-232 (mit Verlauf), lib/tarifauswahl-server.ts:172 |
| Abschluss | `Lead.closedAt`, `closeValue`, `policyDoneAt`; `LeadContract` (sparte, premium, insurer, contractNo, productName, fileId, signedAt) | schema:659, :674, :676, :3657-3700 | app/buyer/actions.ts:250, :539, inbox-actions.ts:144; Vertrag lib/vertraege.ts:235-288 (`syncPrimaryContract`), weitere Verträge lib/vertraege.ts:553/:587 |
| Storno (Vertrag) | `LeadContract.status = storniert`, `cancelledAt`, `cancelReason`, `chargeback` | schema:3690-3697 | lib/vertrag-kuendigung.ts, lib/vertraege.ts |
| Storno (Lead beim Vermittler) | Status „Storno…“, `Revenue.cancelled` | schema:790 | lib/airtable.ts:1186-1198 |
| Cross-Selling | weitere `LeadContract` ohne `primaryLeadId` | schema:3663 | lib/vertraege.ts:553 |
| PPL Lieferung | `Lead.subscriptionId`, `orderId`, `deliveredAt`; `PoolLead` (status, via, leadId); `PplIntake` (Airtable-Eingang) | schema:678-682, :2396, :3007 | lib/ppl/engine.ts:234-257, lib/ppl/intake.ts |
| PPL Storno | `stornoState`, `stornoReason`, `stornoRequestedAt`, `stornoDecidedAt`, `creditAmount` | schema:684-716 | lib/ppl/storno.ts:74, :94, :105 |
| PPL Käufer-Rückmeldung | nur wenn der Käufer in der App arbeitet (Status, Termine, Abschluss); HvK-Abrechnung `HvkReklamation.leadId` | schema:4245 | lib/ppl/hvk-abrechnung-server.ts |
| Rückmeldung an Meta | `CapiEvent` (lead/erreicht/termin/abschluss mit Zeitpunkt) | schema:3982 | lib/capi/shared.ts:75-90 leitet die Stufen ab |

## 2. Was ganz fehlt

1. **Anzeige-Ebene**: keine `campaignId`, `adsetId`, `adId`, `formId`, Kampagnen-/Anzeigenname am Lead. Meta liefert
   ad_id und Namen schon heute bei jedem Lead (lib/meta-leads.ts:66), sie werden verworfen. Kosten liegen nur je
   Kunde/Produkt/Tag vor (`Cost` schema:816, `CustomerAdSpend` schema:460), nicht je Kampagne oder Anzeige.
   Kosten pro Termin/Abschluss je Anzeige sind damit heute nicht berechenbar.
2. **Erreicht-Zeitpunkt**: `reached` ist nur ja/nein. `firstContactAt` ist der erste Kontakt*versuch* (bei
   WhatsApp-Kunden das automatische Erstanschreiben, lib/whatsapp/outreach.ts:283), nicht das erste Gespräch.
   Die Meta-Rückmeldung behilft sich mit `statusChangedAt` bzw. „jetzt“ (lib/capi/shared.ts:84).
3. **Angebot als Objekt**: kein Zeitpunkt, kein Angebotsstatus (offen/angenommen/abgelehnt), kein Beitrag, keine
   Verbindung Angebot ↔ Vertrag. Nur Lead-Status (wird beim nächsten Schritt überschrieben) und Verlaufstext.
4. **Tarif am Vertrag**: `LeadContract` hat keinen Tarifnamen. `productName` gibt es nur bei Sparte „Sonstiges“.
   Der Tarif steht höchstens in der Tarifauswahl der Terminvorbereitung (Appointment.tarifauswahl, vor dem Abschluss).
5. **Verschoben** als eigener Termin-Status bzw. Verweis alter → neuer Termin. Heute nur ableitbar (Absage und
   Neubuchung innerhalb von Minuten) oder aus dem Verlaufstext „Termin verschoben“.
6. **Käufer-Rückmeldung bei Pay-per-Lead per E-Mail/Webhook**: kein Rückkanal; nur HvK-Abrechnung (gekauft/reklamiert).
7. **Herkunft Perspective**: Funnel-Payload wird bis auf das Feld `source` verworfen (lib/ppl/perspective.ts:141-142);
   keine UTM-/Kampagnenangaben.

## 3. Was lückenhaft befüllt wird (aus Code-Sicht)

- **Airtable-Leads** (Altbestand): `createdAt` = Zuweisungsdatum (Tag), `closedAt` = `createdAt` (lib/airtable.ts:1226),
  also keine echte Abschlusszeit; Zeit bis Abschluss für diese Leads unbrauchbar. Feld `closedAtPlausibel` zeigt den Anteil.
- **closedAt** wird bei jedem erneuten Setzen auf „Abschluss“ neu gesetzt (app/buyer/actions.ts:250), auch ohne
  Statuswechsel; beim Verlassen von „Abschluss“ gelöscht.
- **firstContactAt**: von Hand änderbar und löschbar (app/buyer/actions.ts:378), Airtable-Abgleich überschreibt
  (lib/airtable.ts:1270). Bei WhatsApp-Kunden misst „Zeit bis Kontakt“ meist das automatische Erstanschreiben;
  die Abfrage zeigt den Median deshalb mit und ohne Automatik (`erstkontaktAutomatisch`).
- **Termin-Ergebnis**: nur wenn der Vermittler „Wie lief's?“ beantwortet; vergangene Termine bleiben sonst
  `booked` (`vorbeiOhneErgebnis`). Termine außerhalb der App (eigener Kalender, Airtable-Status „Termin vereinbart“)
  haben keine Zeile (`termin.felder.terminZeile`).
- **Angebot**: Zeitpunkt nur über den Verlauf; „Angebot gesendet“ aus „Wie lief's?“ im Lead-Detail schreibt keinen
  Verlaufseintrag (app/buyer/actions.ts:497-545), anders als die Anrufliste (inbox-actions.ts:150, :224).
- **Abschluss-Pflichtfelder**: `syncPrimaryContract` (lib/vertraege.ts:235-288) übernimmt nur Sparte und Beitrag aus
  dem Abschluss-Dialog; Gesellschaft, Vertragsnummer und Police nur, wenn der Vermittler den Vertrag nachträglich
  bearbeitet. Abschlüsse aus dem Airtable-Abgleich haben gar keinen gespeicherten Vertrag (virtuell abgeleitet,
  lib/vertraege.ts:408-412), Sparte dann aus dem Produkt geraten. `premium` ist nicht einheitlich (PKV: Monatsbeitrag,
  Tarifoptimierung: Ersparnis, Leben/BU: Monatsbeitrag × 12). Nach DSGVO-Löschung sind `insurer`/`contractNo` leer
  (lib/erasure.ts:129).
- **Storno Vertrag**: `cancelReason` erst seit 14.11.2026, Altfälle ohne Grund; kein Zeitpunkt der Erfassung.
- **Pay-per-Lead**: Leads aus der Airtable-Zeit haben weder `subscriptionId` noch `deliveredAt`; Storno dort nur als
  Status „Storno“ (`nurStatusOhneStornoFeld`). Käufer-Rückmeldung nur bei Lieferweg `app` (Zahlen je `lieferweg_*`).

## 4. Vorschlag Baustein 2: Kette schließen

**A. Anzeige am Lead speichern (größter Hebel, klein)**
- Migration `Lead`: `metaFormId`, `metaCampaignId`, `metaCampaignName`, `metaAdsetId`, `metaAdsetName`, `metaAdId`,
  `metaAdName`, `metaPlatform`, `isOrganic` (alle optional, Index auf `metaCampaignId`, `metaAdId`). Gleiche Felder an
  `LeadReentry` (jede Einsendung kann aus einer anderen Anzeige kommen).
- `fetchMetaLead` um `adset_id,campaign_id` erweitern (lib/meta-leads.ts:66), `IncomingLead` und `fromFlatPayload`
  (Zapier liefert `ad_id`, `adset_id`, `campaign_id`, `form_id` flach) durchreichen, in `ingestLead` speichern
  (lib/lead-intake.ts:215).
- Rückfüllung: (1) `consentData.formId` → `metaFormId` per SQL; (2) für Meta-Leads mit `externalId` der letzten 90 Tage
  `GET /{leadgen_id}?fields=ad_id,adset_id,campaign_id,form_id,...` in kleinen Stapeln (Meta hält Leads 90 Tage);
  (3) `UnassignedLead.payload` für später zugeordnete; (4) `CampaignRun.built` (schema:3332: campaignId, adSetIds,
  formId, adIds) als Zuordnung Formular → Kampagne für unsere eigenen Kampagnen; (5) Airtable-Altbestand bleibt ohne
  Anzeige (als Lücke ausweisen).
- Kosten je Anzeige/Tag (Meta Insights `level=ad`) in eine neue Tabelle `AdSpendDaily(adId, adsetId, campaignId,
  customerId, date, spend, impressions, clicks, leads)`, damit Kosten pro Termin/Abschluss je Anzeige rechenbar werden.

**B. Zeitstempel je Stufe als Ereignisse**
- Neue Tabelle `LeadStageEvent(leadId, customerId, stage, at, source)` mit `stage` in
  erstkontakt | erreicht | termin_gebucht | termin_erschienen | termin_nicht_erschienen | termin_verschoben |
  termin_abgesagt | angebot | abschluss | storno, je Lead und Stufe frühester Zeitpunkt unveränderlich
  (wie `CapiEvent`, das man darauf umstellen kann). Geschrieben an den bestehenden Stellen (lib/lead-progress.ts,
  app/buyer/actions.ts, inbox-actions.ts, lib/calendar/index.ts, lib/vertraege.ts), `source` = automatisch/vermittler/lead.
- Rückfüllung aus `LeadHistory` (Termin, Angebot, Abschluss), `Appointment` (createdAt, cancelledAt), `CapiEvent`,
  `LeadContract.signedAt`, erste eingehende WhatsApp-Nachricht (`Message`) für „erreicht“.
- `Lead.reachedAt` und `Lead.firstHumanContactAt` (erstes Telefonat/erste Antwort des Vermittlers) zusätzlich, damit
  „Zeit bis Kontakt“ ehrlich wird.

**C. Angebot und Vertrag**
- `LeadOffer(leadId, appointmentId?, sentAt, status offen/angenommen/abgelehnt, sparte, insurer, tarif, premiumYear)`;
  aus `Appointment.offersJson`/`tarifauswahl` beim Bestätigen anlegen, beim Abschluss mit dem Vertrag verknüpfen
  (`LeadContract.offerId`).
- `LeadContract.tariff` (Tarifname) und `premiumYear` (einheitlicher Jahresbeitrag, PKV × 12, Tarifoptimierung null)
  plus `premiumKind`; im Abschluss-Dialog Gesellschaft und Tarif vorbelegen aus der Tarifauswahl des letzten Termins.
- `closedAt` nur beim ersten Wechsel auf „Abschluss“ setzen; Airtable-Altfälle mit `closedAt = createdAt` als
  „Zeitpunkt unbekannt“ markieren statt falsch zu rechnen.

**D. Pay-per-Lead**
- Rückkanal für Käufer ohne App: Link in der Lieferungs-Mail („Wie lief der Lead?“: erreicht/Termin/Abschluss/
  falsche Daten), Webhook-Antwort-Endpunkt; HvK-Abrechnung als Rückmeldung „gekauft/reklamiert“ je Lead speichern.
- Perspective: ganzen Payload ohne Personendaten (UTM, Funnel, Zeitstempel) in `PoolLead.meta` sichern, UTM-Parameter
  im Funnel einschalten und als Kampagne/Anzeige übernehmen.
- Airtable-Altleads: `subscriptionId`/`deliveredAt` aus `PplIntake` nachtragen.

**Reihenfolge**: A (sofort, rückwirkend nur 90 Tage möglich, daher zuerst), dann B, dann C, D parallel. Danach
`q=kette` erneut laufen lassen und die Abdeckung vorher/nachher vergleichen.
