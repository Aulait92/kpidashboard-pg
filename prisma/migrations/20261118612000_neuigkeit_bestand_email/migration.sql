-- Neuigkeit: Bestandskampagnen auch per E-Mail, Einwilligung je Kanal, Abmeldelink
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_bestand_email', 'Bestandskunden jetzt auch per E-Mail anschreiben',
 'Kampagnen unter **Bestand** gehen jetzt auch per E-Mail raus, persönlich über Ihr eigenes Postfach und mit Abmeldelink. Je Kampagne wählen Sie **WhatsApp bevorzugt, sonst E-Mail**, **nur WhatsApp** oder **nur E-Mail**, und die Vorschau zeigt, wer auf welchem Weg erreichbar ist. Unter **Bestand → Einwilligungen & Versand** sehen Sie je Kunde die Einwilligung für WhatsApp und E-Mail und holen fehlende per Link ein.',
 'neu', 'alle', '2026-11-14 14:17:00', '2026-11-14 14:17:00', '2026-11-14 14:17:00')
ON CONFLICT ("id") DO NOTHING;
