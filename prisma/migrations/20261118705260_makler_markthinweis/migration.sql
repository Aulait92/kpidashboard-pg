-- Makler: eigener Text für den Hinweis auf die Marktauswahl auf Empfehlungs- und Vergleichsfolie (§ 60 Abs. 1, 2 VVG).
-- NULL = Standard „Verglichen wurden Tarife von {gesellschaften}.“ (lib/praesentation.ts). Additiv.
ALTER TABLE "Customer" ADD COLUMN "maklerMarkthinweis" TEXT;
