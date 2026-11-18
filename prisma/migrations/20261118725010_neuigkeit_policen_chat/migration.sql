-- Neuigkeit (18.11.2026): Policen direkt im Chat mit Einwilligung per Knopf, 90 Tage nach dem Termin gelöscht, in der
-- Terminvorbereitung „Dokumente erhalten“. Nur der Sach-Teil (Freischaltung Kranken/BU/Leben gibt Ole selbst bekannt).
-- Die beiden Einträge vom 17.11. werden berichtigt (kein automatisches Auslesen mehr, Löschfrist 90 Tage). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_policen_chat', 'Policen direkt im Chat, mit Einwilligung per Knopf',
 'Ihr Assistent bittet Leads mit bestehenden Verträgen, Fotos oder PDFs ihrer Policen (z. B. Haftpflicht, Hausrat, Kfz) direkt in den WhatsApp-Chat zu schicken, und holt vorher mit einem Tipp die Einwilligung ein. In der **Terminvorbereitung** sehen Sie sofort, wie viele Dokumente angekommen sind, und öffnen oder laden sie mit einem Klick. Die Unterlagen sind nur für Sie sichtbar und werden 90 Tage nach dem Termin automatisch gelöscht.',
 'verbessert', 'software', '2026-11-17 23:20:00', '2026-11-17 23:20:00', '2026-11-17 23:20:00')
ON CONFLICT ("id") DO NOTHING;

UPDATE "ProductUpdate" SET "body" = 'Ihr WhatsApp-Assistent lädt Leads mit bestehenden Verträgen ein, Fotos oder PDFs ihrer Policen vorab in den Chat zu schicken, damit Sie sich vor dem Termin einlesen können. Sie finden sie im Kontakt unter **Dokumente** und in der Terminvorbereitung. Die Unterlagen werden 90 Tage nach dem Termin automatisch gelöscht.', "updatedAt" = '2026-11-17 23:20:00'
WHERE "id" = 'upd_2611_policen_vorab';

UPDATE "ProductUpdate" SET "body" = 'Hat Ihr Kunde abgeschlossen, erinnert Sie die App zwei Wochen bevor seine per WhatsApp geschickten Unterlagen gelöscht werden (90 Tage nach dem Termin), sie in Ihre Kundenakte zu übernehmen. Brauchen Sie eine Unterlage für Ihre Beratungsdokumentation, tippen Sie im Kontakt unter **Dokumente** auf **Als Beratungsdokumentation behalten**. Widerruft ein Kunde am Telefon oder per E-Mail, löschen Sie dort alles mit **Einwilligung widerrufen / Unterlagen löschen**.', "updatedAt" = '2026-11-17 23:20:00'
WHERE "id" = 'upd_2611_policen_aufbewahrung';
