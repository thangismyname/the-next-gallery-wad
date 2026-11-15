"""The Next Gallery — AI Service App package."""
from __future__ import annotations

import tomllib
from pathlib import Path


def _version() -> str:
    """Phiên bản lấy từ pyproject.toml (nguồn duy nhất)."""
    try:
        with (Path(__file__).resolve().parent.parent / "pyproject.toml").open("rb") as f:
            return tomllib.load(f)["project"]["version"]
    except (OSError, KeyError, tomllib.TOMLDecodeError):
        return "0.0.0"


__version__ = _version()
