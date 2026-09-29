"""Command-line entry point."""

from __future__ import annotations

import argparse
import sys

from . import __version__
from .report import render_week
from .session import DEFAULT_MINUTES, Kind, Session, format_remaining, next_break, run
from .store import Store


def _tick(left) -> None:
    sys.stdout.write(f"\r{format_remaining(left)} ")
    sys.stdout.flush()


def cmd_start(args: argparse.Namespace, store: Store) -> int:
    session = Session(Kind.FOCUS, args.minutes or DEFAULT_MINUTES[Kind.FOCUS])
    run(session, _tick)
    store.append(session)
    print("\ninterrupted" if session.interrupted else "\ndone, take a break")
    return 130 if session.interrupted else 0


def cmd_break(args: argparse.Namespace, store: Store) -> int:
    kind = next_break(store.completed_focus_today())
    session = Session(kind, args.minutes or DEFAULT_MINUTES[kind])
    run(session, _tick)
    store.append(session)
    print("\nback to work")
    return 0


def cmd_report(args: argparse.Namespace, store: Store) -> int:
    print(render_week(store))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pomo", description=__doc__)
    parser.add_argument("--version", action="version", version=f"pomo {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)

    start = sub.add_parser("start", help="start a focus session")
    start.add_argument("--minutes", type=int)
    start.set_defaults(func=cmd_start)

    brk = sub.add_parser("break", help="take a break")
    brk.add_argument("--minutes", type=int)
    brk.set_defaults(func=cmd_break)

    report = sub.add_parser("report", help="show totals")
    report.add_argument("--week", action="store_true", default=True)
    report.set_defaults(func=cmd_report)

    args = parser.parse_args(argv)
    return args.func(args, Store())


if __name__ == "__main__":
    raise SystemExit(main())
