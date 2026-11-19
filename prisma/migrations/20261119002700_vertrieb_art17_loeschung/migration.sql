-- Löschung auf Verlangen (Art. 17 DSGVO) im Vertrieb (Ole, 19.11.2026): nur additiv
ALTER TABLE "SalesContact" ADD COLUMN "art17GeloeschtAt" TIMESTAMP(3);
ALTER TABLE "SalesContact" ADD COLUMN "sperrHashes" TEXT[] DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "SalesContact_sperrHashes_idx" ON "SalesContact" USING GIN ("sperrHashes");
