def test_list_boards_returns_seed_board(auth_client):
    response = auth_client.get("/api/boards")
    assert response.status_code == 200
    boards = response.json()
    assert len(boards) == 1
    assert boards[0]["id"] == "board-default"
    assert boards[0]["title"] == "My Board"


def test_list_boards_requires_auth(client):
    assert client.get("/api/boards").status_code == 401


def test_create_board_returns_new_board(auth_client):
    response = auth_client.post("/api/boards", json={"title": "Sprint Board"})
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Sprint Board"
    assert data["id"].startswith("board-")

    boards = auth_client.get("/api/boards").json()
    assert len(boards) == 2
    titles = [b["title"] for b in boards]
    assert "My Board" in titles
    assert "Sprint Board" in titles


def test_create_board_requires_title(auth_client):
    assert auth_client.post("/api/boards", json={}).status_code == 422


def test_create_board_has_default_columns(auth_client):
    new_board = auth_client.post("/api/boards", json={"title": "New"}).json()
    board_data = auth_client.get(f"/api/boards/{new_board['id']}").json()
    assert [c["title"] for c in board_data["columns"]] == [
        "Backlog", "In Progress", "Review", "Done"
    ]


def test_get_board_by_id(auth_client):
    response = auth_client.get("/api/boards/board-default")
    assert response.status_code == 200
    data = response.json()
    assert len(data["columns"]) == 5
    assert data["cards"]["card-1"]["title"] == "Align roadmap themes"


def test_get_board_by_id_not_found(auth_client):
    assert auth_client.get("/api/boards/board-missing").status_code == 404


def test_get_board_by_id_requires_auth(client):
    assert client.get("/api/boards/board-default").status_code == 401


def test_rename_board(auth_client):
    response = auth_client.put("/api/boards/board-default", json={"title": "Renamed Board"})
    assert response.status_code == 200
    assert response.json()["title"] == "Renamed Board"

    boards = auth_client.get("/api/boards").json()
    assert boards[0]["title"] == "Renamed Board"


def test_rename_board_not_found(auth_client):
    assert auth_client.put("/api/boards/board-missing", json={"title": "X"}).status_code == 404


def test_delete_board(auth_client):
    new_board = auth_client.post("/api/boards", json={"title": "Temp"}).json()
    response = auth_client.delete(f"/api/boards/{new_board['id']}")
    assert response.status_code == 200

    boards = auth_client.get("/api/boards").json()
    assert len(boards) == 1
    assert boards[0]["id"] == "board-default"


def test_delete_board_not_found(auth_client):
    assert auth_client.delete("/api/boards/board-missing").status_code == 404


def test_board_scoped_rename_column(auth_client):
    response = auth_client.put(
        "/api/boards/board-default/columns/col-backlog", json={"title": "Inbox"}
    )
    assert response.status_code == 200
    data = response.json()
    col = next(c for c in data["columns"] if c["id"] == "col-backlog")
    assert col["title"] == "Inbox"


def test_board_scoped_create_card(auth_client):
    response = auth_client.post(
        "/api/boards/board-default/columns/col-backlog/cards",
        json={"title": "New card", "details": "Details"},
    )
    assert response.status_code == 200
    data = response.json()
    col = next(c for c in data["columns"] if c["id"] == "col-backlog")
    new_id = col["cardIds"][-1]
    assert data["cards"][new_id]["title"] == "New card"


def test_board_scoped_edit_card(auth_client):
    response = auth_client.put(
        "/api/boards/board-default/cards/card-1",
        json={"title": "Updated", "details": "New details"},
    )
    assert response.status_code == 200
    assert response.json()["cards"]["card-1"]["title"] == "Updated"


def test_board_scoped_delete_card(auth_client):
    response = auth_client.delete("/api/boards/board-default/cards/card-1")
    assert response.status_code == 200
    assert "card-1" not in response.json()["cards"]


def test_board_scoped_move_card(auth_client):
    response = auth_client.post(
        "/api/boards/board-default/cards/card-1/move",
        json={"toColumnId": "col-done", "toIndex": 0},
    )
    assert response.status_code == 200
    data = response.json()
    done_col = next(c for c in data["columns"] if c["id"] == "col-done")
    assert done_col["cardIds"][0] == "card-1"


def test_cross_user_board_isolation(client):
    client.post("/api/register", json={"username": "user2", "password": "password123"})
    client.post("/api/login", json={"username": "user2", "password": "password123"})
    user2_board = client.post("/api/boards", json={"title": "User2 Board"}).json()

    client.post("/api/logout")
    client.post("/api/login", json={"username": "user", "password": "password"})

    assert client.get(f"/api/boards/{user2_board['id']}").status_code == 404
    assert (
        client.delete(f"/api/boards/{user2_board['id']}").status_code == 404
    )
