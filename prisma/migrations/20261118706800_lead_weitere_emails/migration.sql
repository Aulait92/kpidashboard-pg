-- Weitere E-Mail-Adressen am Lead (additiv): die bisherige Adresse bleibt erhalten, wenn der Lead im Chat eine neue nennt
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "weitereEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
