-- Keine Gedankenstriche in Texten an Kunden und Leads (Ole, 14.11.2026, AGENTS.md):
-- Neuigkeiten, gespeicherte E-Mail-Vorlagen und Signaturen bereinigen. „ – “ bzw. „ — “ zwischen Wörtern
-- wird zu „, “; Bis-Striche zwischen Zahlen („1–3“, „9 – 12“) bleiben. WhatsApp-Vorlagen bleiben unverändert
-- (bei Meta freigegebener Wortlaut, neue Fassungen kommen ohne Gedankenstriche aus dem Code).
UPDATE "ProductUpdate"
SET "title" = regexp_replace(regexp_replace("title", '\s*[–—]\s*([.!?:;,])', '\1', 'g'), '([^0-9[:space:]])\s*[–—]\s*([^0-9[:space:]])', '\1, \2', 'g'),
    "body" = regexp_replace(regexp_replace("body", '\s*[–—]\s*([.!?:;,])', '\1', 'g'), '([^0-9[:space:]])\s*[–—]\s*([^0-9[:space:]])', '\1, \2', 'g')
WHERE "title" ~ '[–—]' OR "body" ~ '[–—]';

UPDATE "MailTemplate"
SET "subject" = regexp_replace(regexp_replace("subject", '\s*[–—]\s*([.!?:;,])', '\1', 'g'), '([^0-9[:space:]])\s*[–—]\s*([^0-9[:space:]])', '\1, \2', 'g'),
    "body" = regexp_replace(regexp_replace("body", '\s*[–—]\s*([.!?:;,])', '\1', 'g'), '([^0-9[:space:]])\s*[–—]\s*([^0-9[:space:]])', '\1, \2', 'g')
WHERE "subject" ~ '[–—]' OR "body" ~ '[–—]';

UPDATE "User"
SET "mailSignature" = regexp_replace(regexp_replace("mailSignature", '\s*[–—]\s*([.!?:;,])', '\1', 'g'), '([^0-9[:space:]])\s*[–—]\s*([^0-9[:space:]])', '\1, \2', 'g')
WHERE "mailSignature" ~ '[–—]';
