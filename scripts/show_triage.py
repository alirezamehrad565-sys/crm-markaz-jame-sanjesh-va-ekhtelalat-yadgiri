#!/usr/bin/env python3
"""Print a triage summary produced by triage_scanners.py in a readable form.

Usage: python3 -I show_triage.py <triage.json> [section ...]
"""
import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: show_triage.py <triage.json> [section ...]", file=sys.stderr)
        return 2
    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    wanted = sys.argv[2:]
    for section, body in data.items():
        if wanted and section not in wanted:
            continue
        print("=====", section)
        if isinstance(body, list):
            for row in body:
                print("  ", json.dumps(row, ensure_ascii=False))
        elif isinstance(body, dict):
            for key, value in body.items():
                if isinstance(value, (list, dict)):
                    print("  --", key)
                    items = value.items() if isinstance(value, dict) else enumerate(value)
                    for k, v in items:
                        print("     ", k, json.dumps(v, ensure_ascii=False))
                else:
                    print("  ", key, "=", value)
        else:
            print("  ", body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
