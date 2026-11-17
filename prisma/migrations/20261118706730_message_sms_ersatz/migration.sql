-- SMS-Ersatz (Ole, 17.11.2026): Kommt eine WhatsApp-Terminnachricht im Vertrieb nicht an, geht derselbe Text
-- einmal per SMS (seven.io) raus. smsAt sperrt doppelte SMS bei wiederholtem Status-Webhook, smsStatus ist das Ergebnis.
ALTER TABLE "Message" ADD COLUMN "smsAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN "smsStatus" TEXT;
