-- Live-Aktualisierung der Chats (lib/live.ts): jüngste Nachricht schnell finden
CREATE INDEX IF NOT EXISTS "Message_createdAt_idx" ON "Message"("createdAt");
