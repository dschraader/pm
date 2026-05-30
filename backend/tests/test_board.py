def _column(board, column_id):
    return next(column for column in board["columns"] if column["id"] == column_id)


def test_get_board_returns_seed(auth_client):
    response = auth_client.get("/api/board")
    assert response.status_code == 200
    data = response.json()

    assert [c["id"] for c in data["columns"]] == [
        "col-backlog",
        "col-discovery",
        "col-progress",
        "col-review",
        "col-done",
    ]
    assert _column(data, "col-backlog")["cardIds"] == ["card-1", "card-2"]
    assert _column(data, "col-discovery")["cardIds"] == ["card-3"]
    assert _column(data, "col-progress")["cardIds"] == ["card-4", "card-5"]
    assert _column(data, "col-review")["cardIds"] == ["card-6"]
    assert _column(data, "col-done")["cardIds"] == ["card-7", "card-8"]
    assert data["cards"]["card-1"]["title"] == "Align roadmap themes"


def test_get_board_requires_auth(client):
    response = client.get("/api/board")
    assert response.status_code == 401


def test_rename_column(auth_client):
    response = auth_client.put(
        "/api/board/columns/col-backlog", json={"title": "Inbox"}
    )
    assert response.status_code == 200
    assert _column(response.json(), "col-backlog")["title"] == "Inbox"


def test_rename_column_unknown_404(auth_client):
    response = auth_client.put(
        "/api/board/columns/col-missing", json={"title": "X"}
    )
    assert response.status_code == 404


def test_rename_column_requires_auth(client):
    response = client.put("/api/board/columns/col-backlog", json={"title": "X"})
    assert response.status_code == 401


def test_create_card_appends_to_column(auth_client):
    response = auth_client.post(
        "/api/board/columns/col-backlog/cards",
        json={"title": "Brand new card", "details": "Notes"},
    )
    assert response.status_code == 200
    data = response.json()

    backlog = _column(data, "col-backlog")
    new_card_id = backlog["cardIds"][-1]
    assert backlog["cardIds"] == ["card-1", "card-2", new_card_id]
    assert data["cards"][new_card_id]["title"] == "Brand new card"
    assert data["cards"][new_card_id]["details"] == "Notes"


def test_create_card_unknown_column_404(auth_client):
    response = auth_client.post(
        "/api/board/columns/col-missing/cards", json={"title": "X"}
    )
    assert response.status_code == 404


def test_create_card_missing_title_422(auth_client):
    response = auth_client.post(
        "/api/board/columns/col-backlog/cards", json={"details": "no title"}
    )
    assert response.status_code == 422


def test_edit_card(auth_client):
    response = auth_client.put(
        "/api/board/cards/card-1",
        json={"title": "Renamed", "details": "Updated"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["cards"]["card-1"]["title"] == "Renamed"
    assert data["cards"]["card-1"]["details"] == "Updated"


def test_edit_card_unknown_404(auth_client):
    response = auth_client.put(
        "/api/board/cards/card-missing", json={"title": "X", "details": ""}
    )
    assert response.status_code == 404


def test_delete_card_collapses_positions(auth_client):
    response = auth_client.delete("/api/board/cards/card-1")
    assert response.status_code == 200
    data = response.json()
    assert "card-1" not in data["cards"]
    assert _column(data, "col-backlog")["cardIds"] == ["card-2"]


def test_delete_card_unknown_404(auth_client):
    response = auth_client.delete("/api/board/cards/card-missing")
    assert response.status_code == 404


def test_move_card_within_column(auth_client):
    response = auth_client.post(
        "/api/board/cards/card-1/move",
        json={"toColumnId": "col-backlog", "toIndex": 1},
    )
    assert response.status_code == 200
    assert _column(response.json(), "col-backlog")["cardIds"] == ["card-2", "card-1"]


def test_move_card_across_columns(auth_client):
    response = auth_client.post(
        "/api/board/cards/card-1/move",
        json={"toColumnId": "col-done", "toIndex": 0},
    )
    assert response.status_code == 200
    data = response.json()
    assert _column(data, "col-backlog")["cardIds"] == ["card-2"]
    assert _column(data, "col-done")["cardIds"] == ["card-1", "card-7", "card-8"]


def test_move_card_to_end_of_other_column(auth_client):
    response = auth_client.post(
        "/api/board/cards/card-1/move",
        json={"toColumnId": "col-done", "toIndex": 99},
    )
    assert response.status_code == 200
    data = response.json()
    assert _column(data, "col-done")["cardIds"] == ["card-7", "card-8", "card-1"]


def test_move_card_unknown_card_404(auth_client):
    response = auth_client.post(
        "/api/board/cards/card-missing/move",
        json={"toColumnId": "col-done", "toIndex": 0},
    )
    assert response.status_code == 404


def test_move_card_unknown_target_column_404(auth_client):
    response = auth_client.post(
        "/api/board/cards/card-1/move",
        json={"toColumnId": "col-missing", "toIndex": 0},
    )
    assert response.status_code == 404


def test_mutations_persist_across_requests(auth_client):
    auth_client.put(
        "/api/board/columns/col-backlog", json={"title": "Inbox"}
    )
    response = auth_client.get("/api/board")
    assert _column(response.json(), "col-backlog")["title"] == "Inbox"
