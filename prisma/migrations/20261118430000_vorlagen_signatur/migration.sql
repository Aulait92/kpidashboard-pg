-- E-Mail-Vorlagen: Signatur standardmäßig drin (Ole, 14.11.2026).
-- Vorlagen, die mit dem Standard-Gruß „Viele Grüße / {meinname}“ enden und noch keine {signatur} haben,
-- enden jetzt mit {signatur}. Ohne hinterlegte Signatur wird daraus beim Schreiben wieder „Viele Grüße / Name“.
UPDATE "MailTemplate"
SET "body" = regexp_replace("body", E'\\n\\nViele Grüße\\n\\{meinname\\}\\s*$', E'\n\n{signatur}'),
    "updatedAt" = now()
WHERE "body" !~ '\{signatur\}'
  AND "body" ~ E'\\n\\nViele Grüße\\n\\{meinname\\}\\s*$';
