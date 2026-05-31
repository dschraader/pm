import pytest

from app import ai


def test_ai_ping_returns_reply(auth_client, monkeypatch):
    monkeypatch.setattr(ai, "ping", lambda: "4")
    response = auth_client.post("/api/ai/ping")
    assert response.status_code == 200
    assert response.json() == {"reply": "4"}


def test_ai_ping_requires_auth(client):
    response = client.post("/api/ai/ping")
    assert response.status_code == 401


def test_ai_ping_missing_api_key_returns_500(auth_client, monkeypatch):
    def fake_ping():
        raise ai.AIConfigError("OPENROUTER_API_KEY is not set")

    monkeypatch.setattr(ai, "ping", fake_ping)
    response = auth_client.post("/api/ai/ping")
    assert response.status_code == 500
    assert "OPENROUTER_API_KEY" in response.json()["detail"]


def test_ai_ping_upstream_error_returns_502(auth_client, monkeypatch):
    def fake_ping():
        raise Exception("Connection refused")

    monkeypatch.setattr(ai, "ping", fake_ping)
    response = auth_client.post("/api/ai/ping")
    assert response.status_code == 502
    assert "AI provider error" in response.json()["detail"]
    assert "Connection refused" in response.json()["detail"]


def test_ai_module_raises_config_error_without_key(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(ai.AIConfigError):
        ai.ping()
