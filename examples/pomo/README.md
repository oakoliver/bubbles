# pomo

A small command-line Pomodoro timer. It runs focus and break sessions, keeps a
local history, and prints a weekly report.

> This is a fictional sample project bundled with the bubbles examples so that
> `examples/ide.ts` has something realistic to browse. It is not maintained.

## Install

```sh
pip install -e .
```

## Usage

```sh
pomo start                 # 25 minute focus session
pomo start --minutes 50    # a longer one
pomo break                 # 5 minute break (15 after every fourth session)
pomo report --week         # totals per day for the current week
```

History is stored as JSON Lines in `~/.local/share/pomo/history.jsonl`.

## Development

```sh
pip install -e '.[dev]'
pytest
```
