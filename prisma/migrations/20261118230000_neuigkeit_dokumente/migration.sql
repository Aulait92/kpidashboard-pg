-- Neuigkeit von heute ergänzen: Dokumente am Lead
UPDATE "ProductUpdate" SET
  "title" = 'Notizen, Verlauf und Dokumente am Lead',
  "body" = 'Beim Lead schreiben Sie Notizen jetzt unter **Notizen & Verlauf** und tippen auf **Speichern**: Sie stehen dort mit Datum, zusammen mit Anrufen, Wiedervorlagen und Abschluss. Unter **Dokumente** laden Sie das Angebot oder die Police hoch. Nach einem Abschluss sehen Sie oben Beitrag und geschätzte Provision, und auf **Heute** erscheint **Police fertig machen**, bis Sie es abhaken.',
  "updatedAt" = NOW()
WHERE "id" = 'upd_2611_verlauf_police';
