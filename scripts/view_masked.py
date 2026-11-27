#!/usr/bin/env python3
"""Print source lines with every long string literal masked, for triaging secret-scanner hits.

Shows the code structure around a scanner hit (identifier names, literal lengths) without
writing the literal values to the terminal or to any file.

Usage: python3 -I view_masked.py <root> <file:line> [<file:line> ...]
"""
import re
import sys
from pathlib import Path

LITERAL = re.compile(r"""(['"`])(?P<body>(?:\\.|(?!\1).)*)\1""")


def mask(match: re.Match) -> str:
    body = match.group("body")
    if len(body) < 9:
        return match.group(0)
    return "%s<masked len=%d>%s" % (match.group(1), len(body), match.group(1))


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: view_masked.py <root> <file:line> [...]", file=sys.stderr)
        return 2
    root = Path(sys.argv[1])
    cache: dict[str, list[str]] = {}
    for spec in sys.argv[2:]:
        name, _, line_s = spec.rpartition(":")
        try:
            lines = cache.setdefault(name, (root / name).read_text(encoding="utf-8", errors="replace").splitlines())
        except OSError as error:
            print("##", spec, "unreadable:", error)
            continue
        line = int(line_s)
        print("##", spec)
        for no in range(max(1, line - 1), min(len(lines), line + 1) + 1):
            text = LITERAL.sub(mask, lines[no - 1])
            text = re.sub(r"[A-Za-z0-9+/=_\-]{24,}", lambda m: "<masked token len=%d>" % len(m.group(0)), text)
            print("  %5d%s %s" % (no, ">" if no == line else " ", text[:260]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
