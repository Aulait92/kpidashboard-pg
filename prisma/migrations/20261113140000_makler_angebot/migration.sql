-- Angebot: Vertreter oder Makler (Garantien im Angebot, Bestandskunden-Modul für Makler inklusive), nur hinzufügend.
ALTER TABLE "Offer" ADD COLUMN "vermittlerTyp" TEXT NOT NULL DEFAULT 'vertreter';
