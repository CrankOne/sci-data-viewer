from __future__ import annotations

"""
Resolves FS struct for the server: client static and misc static directories
based on SCIVIEWER_DIR environment variable.
"""

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ViewerPaths:
    clientDist: Path
    miscStatic: Path

    @property
    def clientAssets(self) -> Path:
        return self.clientDist / "assets"

def discover_paths() -> ViewerPaths:
    """
    Resolve shared runtime assets.

    SCIVIEWER_DIR, when set, must contain:

        client/
            index.html
            assets/
        misc-static/
    """

    if data_dir := os.environ.get("SCIVIEWER_DIR"):
        root = Path(data_dir).expanduser().resolve()
        return ViewerPaths(
            clientDist=root / "client",
            miscStatic=root / "misc-static",
        )
    projectRoot = Path(__file__).resolve().parents[3]
    return ViewerPaths(
        clientDist=projectRoot / "client" / "dist",
        miscStatic=projectRoot / "misc-static",
    )
