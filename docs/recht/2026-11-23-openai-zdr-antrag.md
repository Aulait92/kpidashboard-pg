# OpenAI Zero Data Retention (ZDR): Antrag (23.11.2026)

- **Stand:** Fragebogen am 23.11.2026 an OpenAI (Vladimir) gesendet. Alternative laut OpenAI: ZDR für 20.000 $ pro Jahr
  oder kostenlos nach Prüfung durch Trust & Safety, wenn der Fall nicht „high risk“ ist.
- **Beantragt für:** Organisation org-RQKcLubAu4rADzYs5yIWz78s, Projekt „Policen EU“ (proj_gqFcuabeTyl6XikI6Bs9uwI9),
  EU-Datenresidenz (eu.api.openai.com), Modell GPT-6.1 Terra (Projekt auf dieses Modell beschränkt).
- **Beschrieben als:** strukturierte Extraktion aus Versicherungspolicen (Responses API, `store: false`, Structured Outputs,
  Dokument inline, keine Files-API), B2B-SaaS für Versicherungsvermittler, kein Endkunden-Chat, keine automatisierten
  Entscheidungen. Gesundheitssparten (PKV, BU, Leben) erst nach schriftlicher ZDR-Bestätigung.
- **Folge für die App:** Nach schriftlicher Bestätigung den Nachweis im Admin hinterlegen
  (`PolicenAuslesenEinstellung.zdrNachweisAm`, lib/policen/auslesen/konfig.ts K2); erst dann laufen Kranken, BU und Leben.
- **Plan B bei Ablehnung:** Azure OpenAI in einer EU-Region mit Antrag auf Abschaltung der Missbrauchsüberwachung
  (ohne Aufpreis); Code-Umstellung nötig.
- **Offen:** Antwort von OpenAI, schriftliche Bestätigung zu ZDR und EU-Datenresidenz ablegen.
