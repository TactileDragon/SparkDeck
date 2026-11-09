# Database migrations

This folder is the written history of every change to SparkDeck's database structure (its tables and columns). It does not hold anyone's decks or cards, and the app never reads it. Nothing in it runs automatically.

Each file is numbered. You run them yourself, in order, in Neon's SQL Editor. The database keeps a matching list in a table called `schema_migrations`, so you can always ask it what has already been applied.

## The files

- `000_schema_migrations.sql`: creates the tracking table and records the two changes below.
- `001_baseline.sql`: a record of how the tables looked before this folder existed, read from the live database on 2026-11-09. Recorded, not run.
- `002_deck_shuffle.sql`: the shuffle column. Already applied, kept here as a record.

## How to apply a new migration

Every file has the same parts, in the same order: preflight, change, verify, and undo. You paste one part at a time into Neon's SQL Editor and run it.

1. **Make a snapshot.** In the Neon Console, open the SparkDeck project and go to Branches. Create a branch from the `production` branch using its current data, and name it `backup-` followed by today's date. This is your undo button for the whole database.
2. **Run the preflight.** Copy the PREFLIGHT part of the file, paste it into the SQL Editor, and run it. It only reads data. Read the single row it returns and compare it with the expected result written in the file. If it doesn't match, stop.
3. **Run the change.** Copy everything from `BEGIN;` to `COMMIT;` and run it. If any line errors, nothing is saved. Run `ROLLBACK;` on its own to clear the error, and stop.
4. **Run the verify query.** It returns one row, with a column named `result` that says PASS or FAIL.
5. **Check the app.** Log in, refresh, and make sure your decks and folders look right.
6. **Keep or delete the snapshot.** After a few days of normal use, the backup branch can be deleted in Neon's Branches page.

## Rules

- Never drop a column or table that holds user data. To change a column's type, add a new column, copy the data across, check it, and only then switch the code over.
- Never add a web endpoint that changes the database structure. This folder replaces the old `setup-database` function for exactly that reason.
- Every change sits between `BEGIN;` and `COMMIT;` and adds its own row to `schema_migrations`.
- Every verify query returns a single row, so it's quick to read with a screen reader.

## Checking what has been applied

This only reads data. It lists every recorded migration, oldest first:

```sql
SELECT version, applied_at FROM schema_migrations ORDER BY version;
```
