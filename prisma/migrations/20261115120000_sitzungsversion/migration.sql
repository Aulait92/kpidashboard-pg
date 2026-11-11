-- Sitzungsversion je Login: erhöht → alle bestehenden Sitzungen ungültig
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
