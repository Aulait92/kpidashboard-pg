-- Ansprache von Leads/Kunden je Kunde: "sie" (Standard, auch für bestehende Kunden) oder "du" (Ole, 14.11.2026).
ALTER TABLE "Customer" ADD COLUMN "leadAddress" TEXT NOT NULL DEFAULT 'sie';
