-- Leadpreis als Spanne (Ole, 14.11.2026): Startwerte für das neue Feld „von“ (cplFrom) in der
-- gespeicherten Rechner-Konfiguration (Tabelle "RechnerConfig", Zeile 'default', JSON config.products).
-- Ohne gespeicherte Zeile gelten die Startwerte im Code (DEFAULT_PRODUCTS in src/lib/rechner.ts).
--   Katze 3–5, Hund 10–12, Pferd 11–13, Kindersparplan 15–20, Privatschutz 20–25 (€ pro Lead).
-- Der obere Wert (cpl, damit wird gerechnet) wird nur angehoben, wenn er bisher niedriger ist.
-- Makler-Werte (cplMakler, cplMaklerNote) bleiben unverändert. Fehlende Produkte (Hund, Pferd,
-- Kindersparplan) werden inaktiv angehängt. Keine Schemaänderung.

-- 1) Vorhandene Produkte: „von“ setzen, oberen Wert höchstens anheben
UPDATE "RechnerConfig" rc
SET "config" = jsonb_set(rc."config", '{products}', COALESCE((
      SELECT jsonb_agg(
        CASE WHEN m.k IS NULL THEN e.p
        ELSE e.p || jsonb_build_object(
          'cplFrom', m.lo,
          'cpl', GREATEST(
            CASE WHEN (e.p->>'cpl') ~ '^[0-9]+([.,][0-9]+)?$' THEN replace(e.p->>'cpl', ',', '.')::numeric ELSE 0 END,
            m.hi))
        END ORDER BY e.ord)
      FROM jsonb_array_elements(rc."config"->'products') WITH ORDINALITY AS e(p, ord)
      LEFT JOIN LATERAL (
        SELECT t.k, t.lo, t.hi
        FROM (VALUES
          (1, 'hund', 'hund', 10, 12),
          (2, 'pferd', 'pferd', 11, 13),
          (3, 'kindersparplan', 'kinderspar', 15, 20),
          (4, 'privatschutz', 'privatschutz', 20, 25),
          (5, 'tkv', '(katze|\mtkv\M)', 3, 5)
        ) AS t(prio, k, pat, lo, hi)
        WHERE e.p->>'key' = t.k OR (e.p->>'key') ~* t.pat OR (e.p->>'name') ~* t.pat
        ORDER BY t.prio
        LIMIT 1
      ) m ON true
    ), '[]'::jsonb)),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE rc."id" = 'default' AND jsonb_typeof(rc."config"->'products') = 'array';

-- 2) Hund, Pferd, Kindersparplan anhängen (inaktiv), falls kein Produkt dafür existiert
UPDATE "RechnerConfig" rc
SET "config" = jsonb_set(rc."config", '{products}', (rc."config"->'products') || COALESCE((
      SELECT jsonb_agg(t.obj ORDER BY t.prio)
      FROM (VALUES
        (1, 'hund', 'hund', jsonb_build_object(
          'key', 'hund', 'name', 'Hundekrankenversicherung', 'active', false, 'maklerOnly', false, 'match', 'hund',
          'provisionKey', NULL, 'kind', 'percent', 'vertreterRate', 0.55, 'vertreterTrail', 0, 'maklerRate', 0, 'maklerTrail', 0.225, 'months', 0,
          'cpl', 12, 'cplFrom', 10, 'cplNote', 'Erfahrungswert', 'cplOverride', false, 'cplMakler', NULL, 'cplMaklerNote', '',
          'customerRate', 0.09, 'contractsPerCustomer', 1, 'terminRate', 0, 'premium', 500, 'minLeads30', NULL, 'crossSell', NULL)),
        (2, 'pferd', 'pferd', jsonb_build_object(
          'key', 'pferd', 'name', 'Pferdeversicherung', 'active', false, 'maklerOnly', false, 'match', 'pferd',
          'provisionKey', NULL, 'kind', 'percent', 'vertreterRate', 0.55, 'vertreterTrail', 0, 'maklerRate', 0, 'maklerTrail', 0.225, 'months', 0,
          'cpl', 13, 'cplFrom', 11, 'cplNote', 'Erfahrungswert', 'cplOverride', false, 'cplMakler', NULL, 'cplMaklerNote', '',
          'customerRate', 0.09, 'contractsPerCustomer', 1, 'terminRate', 0, 'premium', 600, 'minLeads30', NULL, 'crossSell', NULL)),
        (3, 'kindersparplan', 'kinderspar', jsonb_build_object(
          'key', 'kindersparplan', 'name', 'Kindersparplan', 'active', false, 'maklerOnly', false, 'match', 'kinderspar',
          'provisionKey', NULL, 'kind', 'percent', 'vertreterRate', 0.55, 'vertreterTrail', 0, 'maklerRate', 0, 'maklerTrail', 0.225, 'months', 0,
          'cpl', 20, 'cplFrom', 15, 'cplNote', 'Erfahrungswert', 'cplOverride', false, 'cplMakler', NULL, 'cplMaklerNote', '',
          'customerRate', 0.08, 'contractsPerCustomer', 1, 'terminRate', 0, 'premium', 600, 'minLeads30', NULL, 'crossSell', NULL))
      ) AS t(prio, k, pat, obj)
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(rc."config"->'products') AS e(p)
        WHERE e.p->>'key' = t.k OR (e.p->>'key') ~* t.pat OR (e.p->>'name') ~* t.pat
      )
    ), '[]'::jsonb)),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE rc."id" = 'default' AND jsonb_typeof(rc."config"->'products') = 'array';
