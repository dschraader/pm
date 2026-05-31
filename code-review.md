# Code Review

**Scope:** Commits `1b48780`–`769596f` (Kanban API, board mutations, AI chat integration)  
**Date:** 2026-05-31  
**Effort:** High — 7 finder angles × up to 6 candidates, 1-vote verification pass

---

## Findings

Ranked most-severe first. Correctness bugs precede cleanup and efficiency findings.

---

### 1. Hardcoded session secret ships to production without a warning

**File:** `backend/app/main.py:26`  
**Severity:** Security / High

`SESSION_SECRET` falls back to `"dev-secret-change-me"` when the environment variable is absent. `docker-compose.yml` loads `.env` with `required: false`, so any deployment that omits the `.env` file silently runs with a publicly known signing key. Starlette's `SessionMiddleware` uses HMAC-signing; a known key lets any client forge a valid session cookie and impersonate any user. `https_only=False` compounds this by transmitting the cookie over plain HTTP.

**Fix:** Fail fast at startup if the env var is missing:
```python
secret_key = os.environ.get("SESSION_SECRET")
if not secret_key:
    raise RuntimeError("SESSION_SECRET environment variable must be set")
```
Set `https_only=True` and document the env var in `docker-compose.yml` or a `.env.example`.

---

### 2. AI-hallucinated mutation ID causes user message to vanish from chat history

**File:** `backend/app/main.py:210`  
**Severity:** Correctness / High

If the AI generates a mutation referencing an ID that does not exist (e.g., a hallucinated `column_id`), the corresponding board function raises `HTTPException(404)`. This exception propagates out of the `for mutation in response.mutations:` loop, skipping `chat.append_exchange`. The `get_db` dependency then rolls back the connection — correct for the board — but the user's message is never saved to history. On retry the AI has no record of the failed turn, which can produce context drift or repeated failures.

```python
for mutation in response.mutations:
    _apply_mutation(conn, username, mutation)   # 404 propagates from here

chat.append_exchange(...)  # never reached on exception
```

**Fix:** Persist the chat exchange before applying mutations, or wrap mutations in a nested savepoint so a mutation failure is isolated. At minimum, save the user message even on mutation failure:
```python
chat.append_exchange(conn, username, user_text=body.message, assistant_text=response.reply)
for mutation in response.mutations:
    _apply_mutation(conn, username, mutation)
```

---

### 3. Unbounded chat history will permanently break the chat endpoint for long-lived users

**File:** `backend/app/ai.py:121`  
**Severity:** Correctness / Medium-High

Every call to `ai.chat` loads the full conversation history and sends it to the model:

```python
for m in history:
    messages.append({"role": m.role, "content": m.content})
```

There is no truncation, summarisation, or message-count cap. Once the cumulative token count of the board JSON + full history + new message exceeds the model's context window, every subsequent request to `/api/ai/chat` fails with a 502 error. The endpoint is then permanently broken for that user with no recovery path short of deleting their history from the database.

**Fix:** Apply a sliding-window limit before building the messages list, e.g., keep only the most recent N exchanges:
```python
MAX_HISTORY = 40
for m in history[-MAX_HISTORY:]:
    messages.append({"role": m.role, "content": m.content})
```

---

### 4. Empty-string titles are accepted by all validation layers

**File:** `backend/app/main.py:39` (also `ai.py:23`)  
**Severity:** Correctness / Medium

`RenameColumnRequest`, `CreateCardRequest`, `EditCardRequest`, and their AI mutation counterparts (`RenameColumnMutation`, `CreateCardMutation`, `EditCardMutation`) all accept `title: str` with no `min_length` constraint. The SQLite schema enforces `NOT NULL` but permits empty strings. A column or card can therefore be renamed to `""` — either by a direct API call or by an AI mutation — and the blank title is stored silently.

**Fix:** Add `min_length=1` to all title fields:
```python
from pydantic import BaseModel, Field

class RenameColumnRequest(BaseModel):
    title: str = Field(min_length=1)
```
Apply the same constraint in `ai.py`'s mutation models.

---

### 5. `board.load_board` is called twice on every AI chat request

**File:** `backend/app/main.py:196` and `:223`  
**Severity:** Efficiency / Low-Medium

`ai_chat` calls `board.load_board` once to build the AI context (line 196) and a second time to include in the response (line 223). Each `load_board` issues three DB queries (`_board_id_for_user` + `SELECT columns` + `SELECT cards`). When no mutations occur both calls return identical data, tripling the DB work for zero benefit.

**Fix:** Reuse the post-mutation board state rather than reloading:
```python
current_board = board.load_board(conn, username)
# ... apply mutations ...
updated_board = board.load_board(conn, username) if response.mutations else current_board
return {"reply": ..., "board": updated_board}
```

---

### 6. `_board_id_for_user` is called once per mutation inside the AI chat loop

**File:** `backend/app/board.py:84`  
**Severity:** Efficiency / Low-Medium

Every board mutation function (`rename_column`, `create_card`, `edit_card`, `delete_card`, `move_card`) begins with `_board_id_for_user(conn, username)`, which executes a JOIN query. When `ai_chat` applies N mutations in a loop, this executes N identical lookup queries against the same immutable `board_id`.

**Fix:** Resolve `board_id` once outside the loop and pass it through, or cache it for the lifetime of the request.

---

### 7. `handleAddCard` does not use `runMutation`, diverging from sibling handlers

**File:** `frontend/src/components/KanbanBoard.tsx:109`  
**Severity:** Simplification / Low

`handleDeleteCard` and `handleRenameColumn` both use the `runMutation` helper (optimistic update → server request → rollback on error). `handleAddCard` bypasses it and awaits the server directly:

```tsx
const handleAddCard = async (columnId, title, details) => {
  setMutationError(null);
  try {
    const fromServer = await api.createCard(columnId, title, details || "No details yet.");
    setBoard(fromServer);
  } catch (err) {
    setMutationError(errorMessage(err));
  }
};
```

This makes card creation the only mutation that blocks the UI without feedback. It also silently substitutes `"No details yet."` for an empty `details` argument — a presentation default embedded in business logic that must be hunted down if copy changes. Any future cross-cutting concern added to `runMutation` (loading state, analytics) is silently omitted for add-card.

---

### 8. `errorMessage` is defined in three components with diverging copy

**File:** `frontend/src/components/KanbanBoard.tsx:28`, `ChatSidebar.tsx:30`, `AppShell.tsx:16`  
**Severity:** Reuse / Low

All three components define a nearly identical `errorMessage(err)` helper. The KanbanBoard version already diverges by appending `" Changes were reverted."`. Centralise in `frontend/src/lib/errors.ts` and import from there to ensure consistent error messaging.

---

### 9. The `position = -1` sentinel for card moves has no database constraint

**File:** `backend/app/board.py:164`  
**Severity:** Altitude / Low

During `move_card`, the moving card is temporarily set to `position = -1` as a stash-sentinel while adjacent positions are shifted. This invariant is enforced only in application code; the schema has no `CHECK (position >= 0)` constraint. A future code path (bulk import, admin migration, concurrent request) that reads or writes cards without knowing the sentinel convention could persist `position = -1` permanently, making a card invisible in `load_board` ordering or producing corrupt positions.

**Fix:** Add a `CHECK (position >= -1)` during write operations or document the in-flight range in a schema comment. A stricter guard (`CHECK (position >= 0)`) combined with an explicit SQL savepoint around the stash/shift/set sequence would eliminate the risk entirely.

---

### 10. Unreachable `else` branch in `_apply_mutation` creates silent maintenance trap

**File:** `backend/app/main.py:176`  
**Severity:** Simplification / Low

The final `else` branch raises `HTTPException(500, "Unknown mutation type")`. Because `Mutation` in `ai.py` is a Pydantic discriminated union, any response that does not match a known type is rejected at parse time before `_apply_mutation` is ever called — the branch is unreachable. More importantly, it creates a false sense of safety: if a developer adds a new mutation subtype to `ai.py` without updating `_apply_mutation`, the code silently compiles and only fails at runtime with a 500, rather than at the type-check or test stage.

**Fix:** Remove the dead `else` branch. Add the new subtype to `_apply_mutation` as part of the same PR that extends the `Mutation` union, and consider a `match` statement to make the exhaustiveness check explicit.

---

## Summary

| # | File | Issue | Severity |
|---|------|-------|----------|
| 1 | `main.py:26` | Hardcoded session secret ships to prod silently | Security / High |
| 2 | `main.py:210` | Mutation failure loses user message from chat history | Correctness / High |
| 3 | `ai.py:121` | Unbounded history permanently breaks chat for long-lived users | Correctness / Medium-High |
| 4 | `main.py:39` | Empty-string titles accepted by all validation layers | Correctness / Medium |
| 5 | `main.py:196,223` | `load_board` called twice per AI chat request | Efficiency / Low-Medium |
| 6 | `board.py:84` | `_board_id_for_user` repeated N times per mutation loop | Efficiency / Low-Medium |
| 7 | `KanbanBoard.tsx:109` | `handleAddCard` skips `runMutation`, diverges from siblings | Simplification / Low |
| 8 | `KanbanBoard.tsx:28` | `errorMessage` duplicated in 3 components with diverging copy | Reuse / Low |
| 9 | `board.py:164` | `position = -1` sentinel has no DB constraint | Altitude / Low |
| 10 | `main.py:176` | Unreachable `else` in `_apply_mutation` masks missing-subtype errors | Simplification / Low |
