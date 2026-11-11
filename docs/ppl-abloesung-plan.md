# Pay-per-Lead: Ablösung von Airtable/Zapier – Anforderungen (Stand 11.11.2026, mit Ole)

Umsetzung geplant ab 12.11.2026. Ziel: Verteilung, Auslieferung, Storno und
Auswertung komplett in der App, Airtable/Zapier nur noch als Übergang.

## 1. Übersicht je Kunde ✅ (Admin → Pay-per-Lead → „Übersicht je Kunde“)
- Leads **diese Woche** und **diesen Monat** je Kunde (und Produkt): bestellt,
  geliefert, Rest, Reklamationen, Umsatz.
- Warnung, wenn ein Kunde hinter seiner Bestellung zurückliegt.

## 2. Vorrang für Gebietskunden (Heinrich von Kleist) ✅ (SubscriptionArea, Bezug → „Gebiete mit Vorrang“; greift in der App-Engine, also ab der Umstellung)
- Kunden mit PLZ-Gebieten bekommen Leads aus ihren Gebieten **immer zuerst**,
  vor Kunden ohne Gebietseinschränkung (sofern Filter passen).
- **Limits je PLZ-Gebiet**: jedes Gebiet hat eine eigene bestellte Menge;
  Vorrang gilt bis **100 % der Bestellung** je Gebiet und Zeitraum. Danach
  normale Verteilung.

## 3. Auswertung Tag / Woche / Monat ✅ (Admin → Pay-per-Lead → „Auswertung“; Eingang/Ablehnungen ab Juni 2026 aus dem Airtable-Abgleich, Tabelle `PplIntake`)
- Eingegangen, geliefert, **abgelehnt durch uns** nach Grund (Dublette, schwach,
  Beamter, außerhalb aller Gebiete, geparkt/kein Abnehmer) und **reklamiert durch
  Kunden** (Stornos) – **getrennt** anzeigen.
- **Leadpreis**: vor Ablehnungen (Meta-Kosten ÷ eingegangen), nach Ablehnungen
  (÷ geliefert), nach Reklamationen (÷ geliefert − storniert); je Tag/Woche/Monat
  und je Produkt.
- **Wirtschaft**: Umsatz (verkaufte Leads nach Stornos), Ausgaben (Meta-Kosten
  Pay-per-Lead + direkte Kosten), **Gewinn** und **Marge** – je Tag/Woche/Monat.

## 4. Stornos von Heinrich von Kleist
- Heinrich meldet Stornos in seinen **Abrechnungs-Mails**, die in Oles
  **Outlook** landen. Diese Mails automatisch auslesen und die Stornos den
  Leads zuordnen (Weg klären: Outlook-Regel → Weiterleitung an eine
  Eingangsadresse/Zapier-Parser → Webhook der App, oder Microsoft Graph mit
  Mail.Read). Beispiel-Mail von Ole besorgen.

## 5. Nebenbei beheben ✅ (Paketart-Anzeige „Pay-per-Lead“; Abgleich schreibt nur noch geänderte Kunden/Bezüge/Produkte)
- Kundenliste zeigt Pay-per-Lead-Kunden fälschlich als „Betreuung + Software“
  (Paketart aus dem Airtable-Abgleich).
- Sentry: N+1-Abfragen im Airtable-Abgleich (/api/sync).

---

# Ebenfalls für 12.11.2026 vorgemerkt: App im App Store

- Kundenbereich als App für iPhone/Android, Start mit **Capacitor-Hülle** um die
  bestehende App: native Push (APNs/FCM), Haptik, natives Teilen/Anrufen,
  Face-ID-Login, App-Symbol-Zähler; Verteilung zunächst über **TestFlight** an Ole.
- Ole testet ein paar Tage; reicht das Gefühl nicht → native Neuentwicklung
  (Expo/React Native) mit eigener API-Schicht, Kernabläufe zuerst.
- Ole: Apple-Developer-Konto für die UG beantragen (D-U-N-S-Nummer, dauert einige
  Tage), Google-Play-Konto anlegen.
