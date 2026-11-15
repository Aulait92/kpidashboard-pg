-- Login-Adressen vereinheitlichen (Go-live 15.11.2026, Login mit „+“-Adressen), wie lib/login-email.ts:
-- trim, Kleinschreibung, Leerzeichen bzw. „%2b“ im lokalen Teil → „+“ (Rest einer URL-Kodierung).
-- Additiv und vorsichtig: nur Adressen mit genau einem „@“, die danach gültig aussehen, deren Zieladresse
-- noch frei ist und auf die genau ein Login abgebildet wird. Alles andere bleibt unverändert. Idempotent.

WITH roh AS (
  SELECT "id", "email",
    lower(regexp_replace("email", '^\s+|\s+$', '', 'g')) AS e
  FROM "User"
  WHERE "email" ~ '^[^@]+@[^@]+$'
), neu AS (
  SELECT "id", "email",
    regexp_replace(replace(split_part(e, '@', 1), '%2b', '+'), '\s+', '+', 'g')
      || '@' || regexp_replace(split_part(e, '@', 2), '\s+', '', 'g') AS ziel
  FROM roh
), eindeutig AS (
  SELECT n."id", n."ziel"
  FROM neu n
  WHERE n."ziel" <> n."email"
    AND n."ziel" ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
    AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."email" = n."ziel")
    AND (SELECT count(*) FROM neu m WHERE m."ziel" = n."ziel") = 1
)
UPDATE "User" u
SET "email" = e."ziel",
    -- E-Mail steht im Sitzungs-Cookie: neu anmelden lassen
    "sessionVersion" = u."sessionVersion" + 1
FROM eindeutig e
WHERE u."id" = e."id";
