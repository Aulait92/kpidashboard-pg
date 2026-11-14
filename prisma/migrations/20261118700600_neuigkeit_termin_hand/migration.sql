-- Neuigkeit: Termin von Hand eintragen, WhatsApp-Gespräch aus dem Kontakt starten, Knöpfe erklären sich
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_termin_hand', 'Termin von Hand eintragen und WhatsApp-Gespräch starten',
 'Im Kontakt unter **Termin** tragen Sie einen Termin jetzt auch von Hand ein (Telefon, Video oder vor Ort), auch ohne verbundenen Kalender. Er steht danach auf **Heute**. Gibt es mit einem Lead noch keinen Chat, startet **Chat** das WhatsApp-Gespräch mit Ihrer freigegebenen Erstnachricht. Fehlt für einen Knopf etwas, etwa die Telefonnummer, erklärt ein Tippen darauf, was zu tun ist.',
 'neu', 'alle', '2026-11-14 18:50:00', '2026-11-14 18:50:00', '2026-11-14 18:50:00')
ON CONFLICT ("id") DO NOTHING;
