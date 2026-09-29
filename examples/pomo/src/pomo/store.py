"""Session history, stored as JSON Lines."""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Iterator

from .session import Kind, Session


def default_path() -> Path:
    base = os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share"
    return Path(base) / "pomo" / "history.jsonl"


class Store:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or default_path()

    def append(self, session: Session) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "kind": session.kind.value,
            "minutes": session.minutes,
            "started_at": session.started_at.isoformat(),
            "finished_at": session.finished_at.isoformat() if session.finished_at else None,
            "interrupted": session.interrupted,
        }
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")

    def __iter__(self) -> Iterator[Session]:
        if not self.path.exists():
            return
        with self.path.open(encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                r = json.loads(line)
                yield Session(
                    kind=Kind(r["kind"]),
                    minutes=r["minutes"],
                    started_at=datetime.fromisoformat(r["started_at"]),
                    finished_at=datetime.fromisoformat(r["finished_at"]) if r["finished_at"] else None,
                    interrupted=r["interrupted"],
                )

    def completed_focus_today(self) -> int:
        today = datetime.now().date()
        return sum(
            1
            for s in self
            if s.kind is Kind.FOCUS and not s.interrupted and s.started_at.date() == today
        )
