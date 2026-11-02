from fastapi.testclient import TestClient

from grd.api import create_app


def test_compiled_workspace_preserves_api_auth_and_missing_paths(tmp_path, monkeypatch):
    monkeypatch.setenv("GRD_TOKEN_SECRET", "testing-secret-not-valid-for-deployment-123456789")
    root = tmp_path / "site"
    root.mkdir()
    (root / "index.html").write_text("<html><title>GRD workspace</title></html>")
    (root / "assets").mkdir()
    (root / "assets" / "app.js").write_text("console.log('workspace')")
    monkeypatch.setenv("GRD_WEB_DIST", str(root))
    with TestClient(create_app("sqlite://")) as client:
        response = client.get("/")
        assert response.status_code == 200
        assert "GRD workspace" in response.text
        assert client.get("/assets/app.js").status_code == 200
        assert client.get("/api/v1/me").status_code == 401
        assert client.get("/api/v1/not-an-endpoint").status_code == 404
        assert client.get("/.env").status_code == 404
        assert client.get("/docs").status_code == 200
