"""
Generic server-side support for the "sequential" data source capability
(doc/sources.rst, "Sequential capability"): session-based forward-only
traversal, implemented once here so any plugin can expose one without
re-implementing the REST contract.

v1 lifecycle is explicit-release-only: sessions live in an in-memory,
single-process dict with no idle timeout and no reaper thread. A session
abandoned without DELETE (tab closed, client crash) leaks whatever its
cursor holds open until process restart. This store also does not survive
a server restart and does not work across multiple worker processes (e.g.
a multi-worker gunicorn deployment) -- consistent with this project's
actual deployment model today (a single `Flask.app.run()` process), but a
hard requirement to fix (shared store + idle-timeout reaper) before ever
running behind multi-process WSGI.
"""

from __future__ import annotations

import secrets
import threading
from dataclasses import dataclass, field
from typing import Any, Callable, Iterator, Protocol, runtime_checkable

from flask import Blueprint, abort, jsonify, url_for


@runtime_checkable
class SessionCursor(Protocol):
    """
    A single traversal session's position. A freshly-constructed cursor
    (i.e. whatever a plugin's `cursor_factory` returns) MUST already be
    positioned at the first item -- `current()`/`finished` must be valid
    immediately, since `POST /sessions` returns the initial representation
    synchronously.
    """

    @property
    def finished(self) -> bool: ...

    def current(self) -> Any | None: ...

    def advance(self) -> None:
        """Moves exactly one step forward. MUST be a no-op once finished."""
        ...

    def close(self) -> None: ...


class GeneratorCursor:
    """
    SessionCursor over any Iterator[JSON-serializable item] -- lets a
    plugin author supply a plain generator and get a working cursor,
    without touching the SessionCursor protocol directly.
    """

    def __init__(self, items: Iterator[Any]) -> None:
        self._it = iter(items)
        self._current: Any | None = None
        self._finished = False
        self._pull()

    @property
    def finished(self) -> bool:
        return self._finished

    def current(self) -> Any | None:
        return self._current

    def advance(self) -> None:
        if self._finished:
            return
        self._pull()

    def close(self) -> None:
        close = getattr(self._it, "close", None)
        if close is not None:
            close()

    def _pull(self) -> None:
        try:
            self._current = next(self._it)
        except StopIteration:
            self._current, self._finished = None, True


@dataclass
class _Session:
    cursor: SessionCursor
    lock: threading.Lock = field(default_factory=threading.Lock)


class SessionStore:
    """
    In-memory, thread-safe session table. See module docstring for the v1
    lifecycle caveats (explicit release only, single-process).
    """

    def __init__(self) -> None:
        self._sessions: dict[str, _Session] = {}
        self._table_lock = threading.Lock()

    def create(self, cursor_factory: Callable[[], SessionCursor]) -> tuple[str, SessionCursor]:
        session_id = secrets.token_urlsafe(16)
        cursor = cursor_factory()
        with self._table_lock:
            self._sessions[session_id] = _Session(cursor)
        return session_id, cursor

    def get(self, session_id: str) -> SessionCursor | None:
        session = self._sessions.get(session_id)
        if session is None:
            return None
        with session.lock:
            return session.cursor

    def advance(self, session_id: str) -> SessionCursor | None:
        session = self._sessions.get(session_id)
        if session is None:
            return None
        with session.lock:
            session.cursor.advance()
            return session.cursor

    def release(self, session_id: str) -> bool:
        with self._table_lock:
            session = self._sessions.pop(session_id, None)
        if session is None:
            return False
        with session.lock:
            session.cursor.close()
        return True


def _session_body(cursor: SessionCursor) -> dict[str, Any]:
    return {"current": cursor.current(), "finished": cursor.finished}


def register_sequential_routes(
    blueprint: Blueprint,
    url_rule: str,
    cursor_factory: Callable[[], SessionCursor],
    *,
    store: SessionStore | None = None,
    name: str | None = None,
) -> SessionStore:
    """
    Registers the four routes doc/sources.rst's "Sequential capability"
    defines, relative to `url_rule` (itself relative to `blueprint`'s
    url_prefix): `POST/GET/POST/DELETE {url_rule}/sessions[/<session_id>]`.

    `name` (defaulting from `url_rule`) must be unique per call on a given
    blueprint -- it seeds both the Flask endpoint names and the session
    id's URL segment, so registering this twice on one blueprint (two
    independent sequential sources, or two plugins sharing a blueprint)
    without distinct names collides on Flask endpoint registration at
    import time instead of failing silently or overwriting routes.
    """
    store = store if store is not None else SessionStore()
    slug = (name or url_rule).strip("/").replace("/", "_")
    sessions_rule = f"{url_rule.rstrip('/')}/sessions"
    session_rule = f"{sessions_rule}/<session_id>"

    def create_session():
        session_id, cursor = store.create(cursor_factory)
        response = jsonify(_session_body(cursor))
        response.status_code = 201
        response.headers["Location"] = url_for(
            f"{blueprint.name}.{slug}_session", session_id=session_id
        )
        response.headers["Access-Control-Expose-Headers"] = "Location"
        return response

    def get_session(session_id: str):
        cursor = store.get(session_id)
        if cursor is None:
            abort(404)
        return jsonify(_session_body(cursor))

    def advance_session(session_id: str):
        cursor = store.advance(session_id)
        if cursor is None:
            abort(404)
        return jsonify(_session_body(cursor))

    def release_session(session_id: str):
        if not store.release(session_id):
            abort(404)
        return "", 204

    blueprint.add_url_rule(
        sessions_rule, endpoint=f"{slug}_sessions_create", view_func=create_session, methods=["POST"]
    )
    blueprint.add_url_rule(
        session_rule, endpoint=f"{slug}_session", view_func=get_session, methods=["GET"]
    )
    blueprint.add_url_rule(
        session_rule,
        endpoint=f"{slug}_session_advance",
        view_func=advance_session,
        methods=["POST"],
    )
    blueprint.add_url_rule(
        session_rule,
        endpoint=f"{slug}_session_release",
        view_func=release_session,
        methods=["DELETE"],
    )

    return store
