# Database design

SQLite, single file, created on first boot if missing. Stores users and their Kanban boards. The MVP only signs in one hardcoded user, but the schema is multi-user from day one so we never have to retrofit it.

This document is the source of truth for Part 6's implementation. Get sign-off before any backend code lands.

## Scope

In scope for this design:
- `users`, `boards`, `columns`, `cards`
- Ordering of columns within a board, and cards within a column
- Seed-data plan that mirrors the existing frontend `initialData`
- File location, connection pragmas, and the "create if missing" approach

Out of scope (deferred):
- Migrations beyond initial table creation (we add Alembic later if/when the schema needs to evolve)

The `chat_messages` table was added in Part 9 (`id TEXT PK`, `user_id TEXT FK -> users.id ON DELETE CASCADE`, `role TEXT CHECK in ('user','assistant')`, `content TEXT`, `created_at TEXT DEFAULT CURRENT_TIMESTAMP`) with `INDEX (user_id)`. Ordering is by SQLite's implicit `rowid` (auto-incrementing per insert) - `created_at` is only second-precision so two messages in the same turn would tie.

## Entity relationships

```
users (1) ──< (M) boards (1) ──< (M) columns (1) ──< (M) cards

users
  id              TEXT  PK
  username        TEXT  UNIQUE NOT NULL
  created_at      TEXT  NOT NULL DEFAULT CURRENT_TIMESTAMP

boards
  id              TEXT  PK
  user_id         TEXT  FK -> users.id  ON DELETE CASCADE  NOT NULL
  title           TEXT  NOT NULL
  created_at      TEXT  NOT NULL DEFAULT CURRENT_TIMESTAMP

columns
  id              TEXT  PK
  board_id        TEXT  FK -> boards.id  ON DELETE CASCADE  NOT NULL
  title           TEXT  NOT NULL
  position        INTEGER NOT NULL
  INDEX (board_id, position)

cards
  id              TEXT  PK
  column_id       TEXT  FK -> columns.id  ON DELETE CASCADE  NOT NULL
  title           TEXT  NOT NULL
  details         TEXT  NOT NULL DEFAULT ''
  position        INTEGER NOT NULL
  INDEX (column_id, position)
```

## DDL

```sql
CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  username   TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE boards (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE columns (
  id       TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title    TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE INDEX idx_columns_board_position ON columns(board_id, position);

CREATE TABLE cards (
  id        TEXT PRIMARY KEY,
  column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  title     TEXT NOT NULL,
  details   TEXT NOT NULL DEFAULT '',
  position  INTEGER NOT NULL
);
CREATE INDEX idx_cards_column_position ON cards(column_id, position);
```

## Design choices

**TEXT primary keys.** IDs are short strings (e.g. `col-7g4qm9`, `card-2lx8nf`) generated server-side. This matches the frontend's existing `Card.id` / `Column.id` typing in `src/lib/kanban.ts` so no mapping layer is needed. Seed rows use the existing readable IDs (`col-backlog`, `card-1`, ...).

**Ordering: integer `position`, zero-indexed, gapless within scope.** Columns are ordered within a board (`position` 0..n among rows with the same `board_id`); cards are ordered within a column. Reads use `ORDER BY position, id` so ties are deterministic. We deliberately do **not** add `UNIQUE(board_id, position)` or `UNIQUE(column_id, position)` — that would block intermediate states during reorders since SQLite has no deferred constraints. The app is responsible for keeping positions distinct.

**Cascading deletes.** Deleting a user deletes their boards, columns, and cards. Deleting a column deletes its cards. Keeps cleanup simple and prevents orphans.

**No `updated_at` for MVP.** We don't need it for any feature yet. Easy to add later. `created_at` is included only where it's plausibly useful (`users`, `boards`).

**One board per user (enforced by app, not schema).** The MVP only ever creates one board per user, but the schema allows multiple so a future "multiple boards" feature is a non-event. The app layer ensures only one is created at seed time.

## Ordering: how mutations work

For each mutation, the affected positions are recomputed atomically inside a transaction:

- **Create card in column C**: insert at `position = (SELECT COUNT(*) FROM cards WHERE column_id = C)`.
- **Delete card** at position `p` in column C: delete row, then `UPDATE cards SET position = position - 1 WHERE column_id = C AND position > p`.
- **Move card** to column C', index `i`: delete from old column (and shift positions down), then shift positions up in C' for `position >= i`, then insert with `position = i`.
- **Rename column / edit card**: no position changes; single `UPDATE`.

This keeps positions gapless and deterministic. The number of rows rewritten per move is bounded by the affected column sizes — fine for any realistic board.

## Seed data (created on first boot if `users` is empty)

```
users:    (id='user-default',  username='user')
boards:   (id='board-default', user_id='user-default', title='My Board')
columns:  (id='col-backlog',   board_id='board-default', title='Backlog',     position=0)
          (id='col-discovery', board_id='board-default', title='Discovery',   position=1)
          (id='col-progress',  board_id='board-default', title='In Progress', position=2)
          (id='col-review',    board_id='board-default', title='Review',      position=3)
          (id='col-done',      board_id='board-default', title='Done',        position=4)
cards:    eight rows mirroring `initialData.cards` in src/lib/kanban.ts,
          with `column_id` and `position` matching the cardIds arrays there.
```

The seed exactly matches what the frontend currently shows in-memory, so the first post-Part-6 page load looks identical to today's demo.

## API response shape (Part 6 will implement)

The Part 6 `GET /api/board` route returns the same shape the frontend already consumes from `lib/kanban.ts`:

```jsonc
{
  "columns": [
    { "id": "col-backlog",   "title": "Backlog",   "cardIds": ["card-1", "card-2"] },
    // ...
  ],
  "cards": {
    "card-1": { "id": "card-1", "title": "...", "details": "..." }
    // ...
  }
}
```

`cardIds` is materialized server-side by ordering the column's cards by `position`. The frontend therefore needs **no model changes** in Part 6 — only the data source changes (state via fetch instead of `initialData`).

## File location, connection, pragmas

- **File**: `/app/data/pm.db` inside the container.
- **Persistence**: a named docker volume `pm-data` mounted at `/app/data` so the DB survives container restarts and rebuilds.
- **Bootstrap**: on app startup, if `pm.db` is missing, create the file, run the DDL above, insert the seed rows. Idempotent: re-running against an existing DB is a no-op.
- **Pragmas applied on every connection**:
  - `PRAGMA foreign_keys = ON;` (SQLite defaults to off — required for our `REFERENCES ... ON DELETE CASCADE` to actually cascade)
  - `PRAGMA journal_mode = WAL;` (better read concurrency under our typical "many GETs, occasional writes" pattern)

## Migrations

None for MVP — startup just runs `CREATE TABLE IF NOT EXISTS` for each table. If the schema ever needs to change in a way that isn't additive, we'll introduce Alembic at that point.

## What I'd like sign-off on

1. **TEXT IDs server-generated** (not integer auto-increment, not client-provided).
2. **Integer `position` ordering** without UNIQUE constraints, with the mutation strategy described above.
3. **Cascading deletes** end-to-end.
4. **One docker volume** (`pm-data`) for the SQLite file, mounted at `/app/data`.
5. **Seed data mirrors `initialData`** exactly, using the existing readable IDs.
6. **No migrations framework** for MVP; create-if-missing only.

If any of these is wrong for your intent, flag it and I'll revise before Part 6 starts.
