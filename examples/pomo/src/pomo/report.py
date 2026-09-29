"""Weekly totals."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Iterable

from .session import Kind, Session

BAR = "█"


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def minutes_per_day(sessions: Iterable[Session], start: date) -> dict[date, int]:
    totals: dict[date, int] = defaultdict(int)
    for s in sessions:
        d = s.started_at.date()
        if s.kind is Kind.FOCUS and not s.interrupted and start <= d < start + timedelta(days=7):
            totals[d] += s.minutes
    return {start + timedelta(days=i): totals[start + timedelta(days=i)] for i in range(7)}


def render_week(sessions: Iterable[Session], today: date | None = None, width: int = 30) -> str:
    today = today or datetime.now().date()
    days = minutes_per_day(sessions, week_start(today))
    most = max(days.values()) or 1
    lines = []
    for day, minutes in days.items():
        bar = BAR * round(minutes / most * width)
        lines.append(f"{day:%a}  {bar:<{width}}  {minutes // 60}h{minutes % 60:02d}")
    total = sum(days.values())
    lines.append(f"total {total // 60}h{total % 60:02d}")
    return "\n".join(lines)
