-- Neuigkeit: Erneut eingetragen ohne doppelten Lead (Ole, 16.11.2026; lib/lead-erneut.ts). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_erneut_eingetragen', 'Kein doppelter Lead mehr',
 'Trägt sich ein Kontakt ein zweites Mal bei Ihnen ein, kommen die neuen Angaben in den bestehenden Kontakt, und er steht unter **Heute** oben auf Ihrer Anrufliste. Ihr Assistent schickt dabei keine zweite Begrüßung per WhatsApp.',
 'verbessert', 'software', '2026-11-16 07:00:00', '2026-11-16 07:00:00', '2026-11-16 07:00:00')
ON CONFLICT ("id") DO NOTHING;
