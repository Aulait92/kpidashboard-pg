-- Erstkontakt sofort: neue Leads werden ohne Wartezeit per WhatsApp angeschrieben.
-- Bisheriger Standard (10 Min.) wird für bestehende Assistenten ebenfalls auf 0 gesetzt;
-- bewusst abweichende Werte bleiben unverändert.
ALTER TABLE "AgentConfig" ALTER COLUMN "outreachDelayMin" SET DEFAULT 0;
UPDATE "AgentConfig" SET "outreachDelayMin" = 0 WHERE "outreachDelayMin" = 10;
