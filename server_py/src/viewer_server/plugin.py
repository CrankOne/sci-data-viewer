from dataclasses import dataclass
from typing import Protocol, Sequence


class DataSource(Protocol):
    """
    A data source protocol defining a series of geometry definitions available
    for client application.
    """
    def describe(self) -> dict:
        ...

    def get_scene(self, request: dict) -> dict:
        ...

@dataclass(frozen=True)
class ViewerPlugin:
    """
    Describes a viewer extension.
    """
    name: str
    api_version: int
    sources: Sequence[DataSource]
    frontend: dict | None = None
