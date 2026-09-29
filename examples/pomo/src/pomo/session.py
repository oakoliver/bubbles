"""Focus and break sessions."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Callable


class Kind(str, Enum):
    FOCUS = "focus"
    SHORT_BREAK = "short_break"
    LONG_BREAK = "long_break"


DEFAULT_MINUTES = {
    Kind.FOCUS: 25,
    Kind.SHORT_BREAK: 5,
    Kind.LONG_BREAK: 15,
}

# A long break replaces the short one after this many focus sessions.
LONG_BREAK_EVERY = 4


@dataclass
class Session:
    kind: Kind
    minutes: int
    started_at: datetime = field(default_factory=datetime.now)
    finished_at: datetime | None = None
    interrupted: bool = False

    @property
    def ends_at(self) -> datetime:
        return self.started_at + timedelta(minutes=self.minutes)

    def remaining(self, now: datetime | None = None) -> timedelta:
        now = now or datetime.now()
        return max(self.ends_at - now, timedelta(0))

    def finish(self, interrupted: bool = False) -> None:
        self.finished_at = datetime.now()
        self.interrupted = interrupted


def next_break(completed_focus: int) -> Kind:
    """Returns the kind of break that follows the given number of focus sessions."""
    if completed_focus > 0 and completed_focus % LONG_BREAK_EVERY == 0:
        return Kind.LONG_BREAK
    return Kind.SHORT_BREAK


def run(
    session: Session,
    on_tick: Callable[[timedelta], None],
    sleep: Callable[[float], None] = time.sleep,
) -> Session:
    """Blocks until the session ends, calling on_tick once per second.

    Ctrl+C ends the session early and marks it as interrupted.
    """
    try:
        while (left := session.remaining()) > timedelta(0):
            on_tick(left)
            sleep(1)
    except KeyboardInterrupt:
        session.finish(interrupted=True)
        return session
    session.finish()
    return session


def format_remaining(left: timedelta) -> str:
    total = int(left.total_seconds())
    return f"{total // 60:02d}:{total % 60:02d}"
