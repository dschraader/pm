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
