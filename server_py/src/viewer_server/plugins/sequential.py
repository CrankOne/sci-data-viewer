"""
Generic server-side support for the "sequential" data source capability
(doc/sources.rst, "Sequential capability"): cursor-based forward-only
traversal, implemented once here so any plugin can expose one without
re-implementing the REST contract.

v1 lifecycle is explicit-release-only: cursors live in an in-memory,
single-process dict with no idle timeout and no reaper thread. A cursor
abandoned without DELETE (tab closed, client crash) leaks whatever it
holds open until process restart. This store also does not survive
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
class Cursor(Protocol):
    """
    A single traversal cursor's position. A freshly-constructed cursor
    (i.e. whatever a plugin's `cursor_factory` returns) MUST already be
    positioned at the first item -- `current()`/`finished` must be valid
    immediately, since `POST /cursors` returns the initial representation
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
    Cursor over any Iterator[JSON-serializable item] -- lets a plugin
    author supply a plain generator and get a working cursor, without
    touching the Cursor protocol directly.
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
class _CursorEntry:
    cursor: Cursor
    lock: threading.Lock = field(default_factory=threading.Lock)


class CursorStore:
    """
    In-memory, thread-safe cursor table. See module docstring for the v1
    lifecycle caveats (explicit release only, single-process).
    """

    def __init__(self) -> None:
        self._cursors: dict[str, _CursorEntry] = {}
        self._table_lock = threading.Lock()

    def create(self, cursor_factory: Callable[[], Cursor]) -> tuple[str, Cursor]:
        cursor_id = secrets.token_urlsafe(16)
        cursor = cursor_factory()
        with self._table_lock:
            self._cursors[cursor_id] = _CursorEntry(cursor)
        return cursor_id, cursor

    def get(self, cursor_id: str) -> Cursor | None:
        entry = self._cursors.get(cursor_id)
        if entry is None:
            return None
        with entry.lock:
            return entry.cursor

    def advance(self, cursor_id: str) -> Cursor | None:
        entry = self._cursors.get(cursor_id)
        if entry is None:
            return None
        with entry.lock:
            entry.cursor.advance()
            return entry.cursor

    def release(self, cursor_id: str) -> bool:
        with self._table_lock:
            entry = self._cursors.pop(cursor_id, None)
        if entry is None:
            return False
        with entry.lock:
            entry.cursor.close()
        return True


def _cursor_body(cursor: Cursor) -> dict[str, Any]:
    return {"current": cursor.current(), "finished": cursor.finished}


def register_sequential_routes(
    blueprint: Blueprint,
    url_rule: str,
    cursor_factory: Callable[[], Cursor],
    *,
    store: CursorStore | None = None,
    name: str | None = None,
) -> CursorStore:
    """
    Registers the four routes doc/sources.rst's "Sequential capability"
    defines, relative to `url_rule` (itself relative to `blueprint`'s
    url_prefix): `POST/GET/POST/DELETE {url_rule}/cursors[/<cursor_id>]`.

    `name` (defaulting from `url_rule`) must be unique per call on a given
    blueprint -- it seeds both the Flask endpoint names and the cursor
    id's URL segment, so registering this twice on one blueprint (two
    independent sequential sources, or two plugins sharing a blueprint)
    without distinct names collides on Flask endpoint registration at
    import time instead of failing silently or overwriting routes.
    """
    store = store if store is not None else CursorStore()
    slug = (name or url_rule).strip("/").replace("/", "_")
    cursors_rule = f"{url_rule.rstrip('/')}/cursors"
    cursor_rule = f"{cursors_rule}/<cursor_id>"

    def create_cursor():
        cursor_id, cursor = store.create(cursor_factory)
        response = jsonify(_cursor_body(cursor))
        response.status_code = 201
        response.headers["Location"] = url_for(
            f"{blueprint.name}.{slug}_cursor", cursor_id=cursor_id
        )
        response.headers["Access-Control-Expose-Headers"] = "Location"
        return response

    def get_cursor(cursor_id: str):
        cursor = store.get(cursor_id)
        if cursor is None:
            abort(404)
        return jsonify(_cursor_body(cursor))

    def advance_cursor(cursor_id: str):
        cursor = store.advance(cursor_id)
        if cursor is None:
            abort(404)
        return jsonify(_cursor_body(cursor))

    def release_cursor(cursor_id: str):
        if not store.release(cursor_id):
            abort(404)
        return "", 204

    blueprint.add_url_rule(
        cursors_rule, endpoint=f"{slug}_cursors_create", view_func=create_cursor, methods=["POST"]
    )
    blueprint.add_url_rule(
        cursor_rule, endpoint=f"{slug}_cursor", view_func=get_cursor, methods=["GET"]
    )
    blueprint.add_url_rule(
        cursor_rule,
        endpoint=f"{slug}_cursor_advance",
        view_func=advance_cursor,
        methods=["POST"],
    )
    blueprint.add_url_rule(
        cursor_rule,
        endpoint=f"{slug}_cursor_release",
        view_func=release_cursor,
        methods=["DELETE"],
    )

    return store
