-- Neuigkeit: Ergebnisse der Bestandskampagnen je Kanal
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_bestand_statistik', 'Was Ihre Bestandskampagnen bringen',
 'Unter **Bestand** sehen Sie jetzt für jede Kampagne, wie viele Kunden geantwortet, einen Termin gemacht und abgeschlossen haben, getrennt nach WhatsApp und E-Mail, dazu die geschätzte Provision mit Ihren Sätzen je Sparte. Abschlüsse aus Bestandskampagnen stehen auch in **Zahlen** unter Kosten & Ertrag.',
 'neu', 'alle', '2026-11-14 14:17:00', '2026-11-14 14:17:00', '2026-11-14 14:17:00')
ON CONFLICT ("id") DO NOTHING;
