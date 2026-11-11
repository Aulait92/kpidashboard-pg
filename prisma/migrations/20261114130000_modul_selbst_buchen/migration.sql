-- Bestandskunden-Modul im Kundenbereich selbst buchen/kündigen:
-- Kündigung zum Ende des Abrechnungszeitraums (Zugang bis hier, danach Abschalten im Cron).
ALTER TABLE "Customer" ADD COLUMN "bestandCancelAt" TIMESTAMP(3);
