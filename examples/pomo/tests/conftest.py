import pytest

from pomo.store import Store


@pytest.fixture
def store(tmp_path):
    return Store(tmp_path / "history.jsonl")
