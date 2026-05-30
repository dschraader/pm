import re


def test_next_static_asset_resolves(client):
    html = client.get("/").text
    match = re.search(r'/(_next/static/[^"\'\s]+\.(?:js|css))', html)
    assert match, "No _next/static asset reference found in index.html"

    asset_path = "/" + match.group(1)
    response = client.get(asset_path)
    assert response.status_code == 200

    suffix = asset_path.rsplit(".", 1)[-1]
    content_type = response.headers["content-type"]
    if suffix == "js":
        assert "javascript" in content_type
    else:
        assert content_type.startswith("text/css")
