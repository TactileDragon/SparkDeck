-- 002_deck_shuffle.sql
--
-- STATUS: ALREADY APPLIED in production (run by hand in the Neon SQL Editor
-- when the per-deck shuffle toggle shipped). This file is the written record.
-- 000_schema_migrations.sql records it in the schema_migrations table.
-- Do not run it again. It would be harmless, but there is no reason to.
--
-- What it did: added decks.shuffle. true means the deck shuffles when studied,
-- false means it is studied in order. Existing decks received true.
-- api-data.js treats a missing value as true.


-- ===== THE CHANGE (as originally run) =====
-- ALTER TABLE decks ADD COLUMN IF NOT EXISTS shuffle BOOLEAN DEFAULT true;


-- ===== VERIFY (read-only) =====
-- Expected result: one row. result reads PASS when the column exists as a boolean.

SELECT CASE WHEN data_type = 'boolean' THEN 'PASS' ELSE 'FAIL' END AS result,
       data_type,
       column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'decks' AND column_name = 'shuffle';


-- ===== UNDO (do not run unless asked) =====
-- WARNING: this erases every deck's shuffle choice, and the app code
-- reads this column, so the code would need changing first.
-- ALTER TABLE decks DROP COLUMN shuffle;
