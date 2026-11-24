-- Neuigkeit (Ole, 24.11.2026): iPhone-App im App Store (Link = IOS_APP_STORE_URL in src/lib/app-store.ts). Kein Push.
-- Eine Zeile nur mit [Text](https://…) zeigt die Neuigkeiten-Seite als Knopf (components/neuigkeiten.tsx).
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_iphone_app', 'Neue Leads jetzt direkt aufs iPhone',
 'Ab heute gibt es performancegrowth als App für Ihr iPhone. Jeder neue Lead erscheint sofort auf Ihrem Handy, und mit einem Fingertipp rufen Sie an oder antworten per WhatsApp. Unsere Erfahrung zeigt: Wer in den ersten 5 Minuten anruft, erreicht seine Interessenten deutlich öfter.

[Jetzt im App Store laden](https://apps.apple.com/de/app/performancegrowth/id6838442707)',
 'neu', 'software', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
