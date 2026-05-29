def test_root_serves_placeholder(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "Hello from the PM backend" in response.text
    assert response.headers["content-type"].startswith("text/html")
