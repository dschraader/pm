def test_login_with_correct_credentials_sets_session(client):
    response = client.post("/api/login", json={"username": "user", "password": "password"})
    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    assert "pm_session" in response.cookies


def test_login_with_wrong_credentials_returns_401(client):
    response = client.post("/api/login", json={"username": "user", "password": "wrong"})
    assert response.status_code == 401
    assert "pm_session" not in response.cookies


def test_me_without_session_returns_401(client):
    response = client.get("/api/me")
    assert response.status_code == 401


def test_me_with_session_returns_user(client):
    client.post("/api/login", json={"username": "user", "password": "password"})
    response = client.get("/api/me")
    assert response.status_code == 200
    assert response.json() == {"username": "user"}


def test_logout_clears_session(client):
    client.post("/api/login", json={"username": "user", "password": "password"})
    assert client.get("/api/me").status_code == 200

    logout_response = client.post("/api/logout")
    assert logout_response.status_code == 200
    assert logout_response.json() == {"ok": True}

    assert client.get("/api/me").status_code == 401


def test_register_creates_user_and_allows_login(client):
    response = client.post(
        "/api/register", json={"username": "alice", "password": "securepass"}
    )
    assert response.status_code == 201
    assert response.json() == {"username": "alice"}

    login_response = client.post(
        "/api/login", json={"username": "alice", "password": "securepass"}
    )
    assert login_response.status_code == 200
    assert login_response.json() == {"username": "alice"}


def test_register_duplicate_username_returns_409(client):
    client.post("/api/register", json={"username": "bob", "password": "password1"})
    response = client.post("/api/register", json={"username": "bob", "password": "password2"})
    assert response.status_code == 409


def test_register_password_too_short_returns_422(client):
    response = client.post("/api/register", json={"username": "charlie", "password": "abc"})
    assert response.status_code == 422


def test_register_username_empty_returns_422(client):
    response = client.post("/api/register", json={"username": "", "password": "password123"})
    assert response.status_code == 422


def test_new_user_gets_default_board(client):
    client.post("/api/register", json={"username": "newuser", "password": "password123"})
    client.post("/api/login", json={"username": "newuser", "password": "password123"})
    response = client.get("/api/board")
    assert response.status_code == 200
    data = response.json()
    assert len(data["columns"]) == 4
    assert [c["title"] for c in data["columns"]] == [
        "Backlog", "In Progress", "Review", "Done"
    ]
