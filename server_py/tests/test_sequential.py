from __future__ import annotations

import pytest
from flask import Blueprint, Flask

from viewer_server.plugins.sequential import GeneratorCursor, register_sequential_routes


@pytest.fixture
def client():
    app = Flask(__name__)
    blueprint = Blueprint("seq_test", __name__, url_prefix="/seq")
    register_sequential_routes(
        blueprint, "/items", lambda: GeneratorCursor(iter(["a", "b"])), name="items"
    )
    app.register_blueprint(blueprint)
    return app.test_client()


def _create(client):
    response = client.post("/seq/items/sessions")
    assert response.status_code == 201
    location = response.headers["Location"]
    assert response.headers.get("Access-Control-Expose-Headers") == "Location"
    return location, response.get_json()


def test_full_lifecycle(client):
    location, body = _create(client)
    assert body == {"current": "a", "finished": False}

    response = client.get(location)
    assert response.status_code == 200
    assert response.get_json() == {"current": "a", "finished": False}

    response = client.post(location)
    assert response.status_code == 200
    assert response.get_json() == {"current": "b", "finished": False}

    response = client.post(location)
    assert response.status_code == 200
    assert response.get_json() == {"current": None, "finished": True}

    # advancing a finished session is a no-op, not an error
    response = client.post(location)
    assert response.status_code == 200
    assert response.get_json() == {"current": None, "finished": True}

    response = client.delete(location)
    assert response.status_code == 204

    # released session is gone
    for response in (client.get(location), client.post(location), client.delete(location)):
        assert response.status_code == 404


def test_unknown_session_404(client):
    for response in (
        client.get("/seq/items/sessions/does-not-exist"),
        client.post("/seq/items/sessions/does-not-exist"),
        client.delete("/seq/items/sessions/does-not-exist"),
    ):
        assert response.status_code == 404


def test_independent_sessions(client):
    location1, _ = _create(client)
    location2, _ = _create(client)
    assert location1 != location2

    client.post(location1)  # advance only the first session
    assert client.get(location1).get_json() == {"current": "b", "finished": False}
    assert client.get(location2).get_json() == {"current": "a", "finished": False}
