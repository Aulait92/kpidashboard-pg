-- Einladung von 360dialog an eine andere E-Mail als den Login (Ole, 20.11.2026)
ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "dialog360InviteEmail" TEXT;
