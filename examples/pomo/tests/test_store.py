from datetime import datetime

from pomo.session import Kind, Session


def test_round_trip(store):
    s = Session(Kind.FOCUS, 25, started_at=datetime(2026, 3, 2, 9, 0))
    s.finish()
    store.append(s)
    [loaded] = list(store)
    assert loaded.kind is Kind.FOCUS
    assert loaded.minutes == 25
    assert loaded.started_at == s.started_at


def test_missing_file_is_empty(store):
    assert list(store) == []
