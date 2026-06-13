# Ralph Loop Improvements

Four loops were completed on 2 June 2026, each building on the last. The commits below capture the work in order.

---

## Loop 1 — User Management and Multiple Kanban Boards
**Commit:** `0d02f80`

- Replaced hardcoded credentials with real user registration backed by PBKDF2 password hashing
- New `/api/register` endpoint creates a user and a default board in one step
- DB migration adds `password_hash` column to existing databases on startup
- Board management CRUD: list, create, rename, and delete boards per user
- All board API routes scoped to `/api/boards/{id}/...`; legacy `/api/board` routes kept for backward compat
- Frontend board selector bar with tab switching and inline board title editing
- Login form gains a registration toggle with confirm-password validation
- AI chat passes `board_id` so mutations apply to the correct board
- 66 backend tests, 28 frontend tests — all green

---

## Loop 2 — Column Management, Per-Board Chat History, and UX
**Commit:** `bcabbd4`

- Add and delete columns per board with cascade deletion and automatic position reordering
- Chat history scoped to `board_id`; messages stored per board and reloaded on board switch
- DB migration adds `board_id` to `chat_messages` for existing containers
- Top bar: username display and logout button moved from board header to app shell
- Inline add-column form at the end of the columns row
- Column delete button (hover-reveal trash icon)
- Playwright e2e tests updated; new tests for register flow, add-column, and add-column-survives-reload
- 71 backend + 29 frontend tests — all green

---

## Loop 3 — Card Editing, AI Column Mutations, and Test Fixes
**Commit:** `61909bf`

- `CardEditModal` component: click pencil icon on any card to edit title and details inline
- AI mutation schema extended with `add_column` and `delete_column` types (7 mutation types total)
- AI system prompt updated to document all mutation types including column operations
- `_apply_mutation` backend handler covers the two new column mutation types
- `highlights.ts` computes changed IDs for `add_column` (highlight new column) and `delete_column`
- Playwright e2e heading reference corrected from "Kanban Studio" to "My Board"
- 73 backend + 31 frontend tests — all green

---

## Loop 4 — Column Drag-and-Drop Reordering and Card Due Dates
**Commit:** `fd0c2db`

- Column drag-and-drop reordering: grip handle in column header; `useSortable` applied to columns alongside existing card DnD
- `KanbanBoard` wraps columns in a horizontal `SortableContext`; column ghost shown in `DragOverlay`
- Backend: `PATCH /api/boards/{id}/columns/reorder` validates and persists new column order
- Card due dates: `due_date TEXT` column added to DB with migration for existing containers
- Due date input in `CardEditModal`; create and edit API calls include `dueDate`
- `KanbanCard` displays a due date badge with relative labels ("Due today", "3d overdue") in red when past
- `api.ts`: `reorderColumns` added; `createCard`/`editCard` signatures updated with `dueDate`
- 79 backend + 31 frontend tests — all green
