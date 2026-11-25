-- Eskalation offene Lead-Antwort (Ole, 25.11.2026, lib/antwort-eskalation.ts): Beginn der Wartephase und Push an den Inhaber
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "attentionSince" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "attentionEscalatedAt" TIMESTAMP(3);
