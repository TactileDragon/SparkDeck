-- 001_baseline.sql
--
-- STATUS: RECORD ONLY. This describes the production database (Neon project
-- "SparkDeck", branch "production", database "neondb") as it was read on
-- 2026-11-09, before migration tracking began. 000_schema_migrations.sql
-- records it as applied. Do not run it on production.
--
-- Why it exists: the core tables were first created by hand, so until now
-- the real structure lived only inside Neon. This file is the written copy.
-- Every statement uses IF NOT EXISTS, so it could also build an empty test
-- database with the same shape.
--
-- Things worth knowing, all confirmed against the live database:
--   * folders.parent_folder_id is INTEGER and has no foreign key. api-data.js
--     handles a missing parent by moving that folder to the top level.
--   * folders.user_id and decks.user_id allow NULL, although api-data.js
--     always fills them in.
--   * decks.description and users.display_name exist but the app doesn't use them.
--   * folders has two dropped column slots (4 and 5) left over from the
--     February 2026 type fix. PostgreSQL keeps those slots forever. They
--     take no space and need no action.


CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid  TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS folders (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(255) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  parent_folder_id  INTEGER
);
CREATE INDEX IF NOT EXISTS folders_name_idx    ON folders (name);
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders (user_id);

CREATE TABLE IF NOT EXISTS decks (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  category     VARCHAR(128),
  folder_id    INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  visibility   TEXT DEFAULT 'private'
  -- shuffle is added by 002_deck_shuffle.sql
);
CREATE INDEX IF NOT EXISTS decks_created_at_idx ON decks (created_at);
CREATE INDEX IF NOT EXISTS decks_folder_idx     ON decks (folder_id);
CREATE INDEX IF NOT EXISTS idx_decks_user_id    ON decks (user_id);
CREATE INDEX IF NOT EXISTS idx_decks_visibility ON decks (visibility);

CREATE TABLE IF NOT EXISTS cards (
  id          SERIAL PRIMARY KEY,
  deck_id     INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  front       TEXT NOT NULL,
  back        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  media_url   TEXT
);
CREATE INDEX IF NOT EXISTS cards_deck_idx      ON cards (deck_id);
CREATE INDEX IF NOT EXISTS cards_deck_sort_idx ON cards (deck_id, sort_order);

CREATE TABLE IF NOT EXISTS user_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  stats_enabled   BOOLEAN DEFAULT true,
  dark_mode       BOOLEAN DEFAULT false,
  font_size       TEXT DEFAULT 'medium',
  high_contrast   BOOLEAN DEFAULT false,
  reduced_motion  BOOLEAN DEFAULT false,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS study_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_name      TEXT NOT NULL,
  cards_studied  INTEGER DEFAULT 0,
  studied_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_study_sessions_user_id ON study_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_date    ON study_sessions (studied_at);
