from datetime import datetime, timedelta

from pomo.session import Kind, Session, format_remaining, next_break, run


def test_remaining_never_negative():
    s = Session(Kind.FOCUS, 25, started_at=datetime(2026, 3, 2, 9, 0))
    assert s.remaining(datetime(2026, 3, 2, 10, 0)) == timedelta(0)


def test_long_break_after_every_fourth_focus():
    assert next_break(1) is Kind.SHORT_BREAK
    assert next_break(4) is Kind.LONG_BREAK
    assert next_break(8) is Kind.LONG_BREAK
    assert next_break(0) is Kind.SHORT_BREAK


def test_format_remaining():
    assert format_remaining(timedelta(minutes=4, seconds=7)) == "04:07"


def test_run_ticks_until_done():
    s = Session(Kind.SHORT_BREAK, 0)
    ticks = []
    run(s, ticks.append, sleep=lambda _: None)
    assert s.finished_at is not None and not s.interrupted
    assert ticks == []
