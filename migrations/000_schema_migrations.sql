-- 000_schema_migrations.sql
--
-- What it does: creates a small bookkeeping table called schema_migrations.
-- Each migration adds one row to it, so the database itself can tell you
-- which changes have been applied. It holds no user data.
--
-- It also records the two schema states that existed before tracking began:
--   001_baseline      the tables as they were built before this folder existed
--   002_deck_shuffle  decks.shuffle, added by hand in the Neon SQL Editor
-- Those two are recorded only. Nothing in them is re-run.
--
-- Touches existing tables: no.
-- Safe to paste twice: yes. The second run changes nothing.


-- ===== PART 1: PREFLIGHT (read-only) =====
-- Expected result: one row, one column, saying either
--   "READY: tracking table does not exist yet" or
--   "ALREADY DONE: tracking table exists"

SELECT CASE
         WHEN to_regclass('public.schema_migrations') IS NULL
           THEN 'READY: tracking table does not exist yet'
         ELSE 'ALREADY DONE: tracking table exists'
       END AS preflight;


-- ===== PART 2: THE CHANGE =====

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version, description) VALUES
  ('000_schema_migrations', 'Created the schema_migrations tracking table.'),
  ('001_baseline',          'Schema as it existed before tracking began. Recorded, not re-run.'),
  ('002_deck_shuffle',      'decks.shuffle BOOLEAN DEFAULT true. Applied by hand in 2026, recorded here.')
ON CONFLICT (version) DO NOTHING;

COMMIT;


-- ===== PART 3: VERIFY (read-only) =====
-- Expected result: one row, with the result column reading PASS.

SELECT CASE WHEN COUNT(*) = 3 THEN 'PASS' ELSE 'FAIL' END AS result,
       string_agg(version, ', ' ORDER BY version) AS versions_recorded
FROM schema_migrations
WHERE version IN ('000_schema_migrations', '001_baseline', '002_deck_shuffle');


-- ===== UNDO (do not run unless asked) =====
-- Removes only the bookkeeping table. No user data is affected.
-- DROP TABLE schema_migrations;
