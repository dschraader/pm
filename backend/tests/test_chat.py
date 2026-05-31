from app import ai


def _column(board, column_id):
    return next(column for column in board["columns"] if column["id"] == column_id)


def test_chat_history_requires_auth(client):
    assert client.get("/api/ai/chat/history").status_code == 401


def test_chat_history_empty_for_fresh_user(auth_client):
    response = auth_client.get("/api/ai/chat/history")
    assert response.status_code == 200
    assert response.json() == {"messages": []}


def test_ai_chat_requires_auth(client):
    response = client.post("/api/ai/chat", json={"message": "hi"})
    assert response.status_code == 401


def test_ai_chat_plain_reply_persists_history(auth_client, monkeypatch):
    def fake_chat(board_state, history, message):
        return ai.AIResponse(reply="Hello there!", mutations=[])

    monkeypatch.setattr(ai, "chat", fake_chat)
    response = auth_client.post("/api/ai/chat", json={"message": "Hi"})
    assert response.status_code == 200
    data = response.json()
    assert data["reply"] == "Hello there!"
    assert data["appliedMutations"] == []
    assert len(data["board"]["columns"]) == 5  # board unchanged

    history = auth_client.get("/api/ai/chat/history").json()["messages"]
    assert len(history) == 2
    assert history[0]["role"] == "user"
    assert history[0]["content"] == "Hi"
    assert history[0]["created_at"]  # populated by the DB default
    assert history[1]["role"] == "assistant"
    assert history[1]["content"] == "Hello there!"
    assert history[1]["created_at"]


def test_ai_chat_applies_single_mutation(auth_client, monkeypatch):
    def fake_chat(board_state, history, message):
        return ai.AIResponse(
            reply="Renamed.",
            mutations=[
                ai.RenameColumnMutation(
                    type="rename_column", column_id="col-backlog", title="Inbox"
                )
            ],
        )

    monkeypatch.setattr(ai, "chat", fake_chat)
    response = auth_client.post(
        "/api/ai/chat", json={"message": "Rename backlog to Inbox"}
    )
    assert response.status_code == 200
    data = response.json()
    assert _column(data["board"], "col-backlog")["title"] == "Inbox"
    assert data["appliedMutations"][0]["type"] == "rename_column"


def test_ai_chat_applies_multiple_mutations(auth_client, monkeypatch):
    def fake_chat(board_state, history, message):
        return ai.AIResponse(
            reply="Done.",
            mutations=[
                ai.RenameColumnMutation(
                    type="rename_column", column_id="col-backlog", title="Inbox"
                ),
                ai.CreateCardMutation(
                    type="create_card",
                    column_id="col-done",
                    title="From AI",
                    details="Imported.",
                ),
                ai.MoveCardMutation(
                    type="move_card",
                    card_id="card-1",
                    to_column_id="col-done",
                    to_index=0,
                ),
            ],
        )

    monkeypatch.setattr(ai, "chat", fake_chat)
    response = auth_client.post("/api/ai/chat", json={"message": "do three"})
    assert response.status_code == 200
    data = response.json()
    assert _column(data["board"], "col-backlog")["title"] == "Inbox"
    done = _column(data["board"], "col-done")
    assert done["cardIds"][0] == "card-1"
    assert any(
        data["board"]["cards"][cid]["title"] == "From AI" for cid in done["cardIds"]
    )


def test_ai_chat_invalid_mutation_rolls_back_atomically(auth_client, monkeypatch):
    def fake_chat(board_state, history, message):
        return ai.AIResponse(
            reply="Trying...",
            mutations=[
                # First one is valid; second one references a missing card.
                ai.RenameColumnMutation(
                    type="rename_column", column_id="col-backlog", title="Inbox"
                ),
                ai.DeleteCardMutation(type="delete_card", card_id="card-missing"),
            ],
        )

    monkeypatch.setattr(ai, "chat", fake_chat)
    response = auth_client.post("/api/ai/chat", json={"message": "bad batch"})
    assert response.status_code == 404

    # Rename must have been rolled back.
    board_json = auth_client.get("/api/board").json()
    assert _column(board_json, "col-backlog")["title"] == "Backlog"

    # Chat history must not have been persisted either.
    history = auth_client.get("/api/ai/chat/history").json()["messages"]
    assert history == []


def test_ai_chat_sees_board_and_prior_history(auth_client, monkeypatch):
    captured: dict = {}

    def fake_chat(board_state, history, message):
        captured["board"] = board_state
        captured["history"] = list(history)
        captured["message"] = message
        return ai.AIResponse(reply="ok", mutations=[])

    monkeypatch.setattr(ai, "chat", fake_chat)

    auth_client.post("/api/ai/chat", json={"message": "first"})
    assert captured["history"] == []
    assert captured["message"] == "first"
    assert len(captured["board"]["columns"]) == 5
    assert captured["board"]["columns"][0]["id"] == "col-backlog"

    captured.clear()
    auth_client.post("/api/ai/chat", json={"message": "second"})
    history = captured["history"]
    assert [m.role for m in history] == ["user", "assistant"]
    assert [m.content for m in history] == ["first", "ok"]
    assert captured["message"] == "second"


def test_ai_chat_missing_api_key_returns_500(auth_client, monkeypatch):
    def fake_chat(board_state, history, message):
        raise ai.AIConfigError("OPENROUTER_API_KEY is not set")

    monkeypatch.setattr(ai, "chat", fake_chat)
    response = auth_client.post("/api/ai/chat", json={"message": "x"})
    assert response.status_code == 500
    assert "OPENROUTER_API_KEY" in response.json()["detail"]


def test_ai_chat_upstream_failure_returns_502(auth_client, monkeypatch):
    def fake_chat(board_state, history, message):
        raise RuntimeError("Connection failed")

    monkeypatch.setattr(ai, "chat", fake_chat)
    response = auth_client.post("/api/ai/chat", json={"message": "x"})
    assert response.status_code == 502
    assert "AI provider error" in response.json()["detail"]
