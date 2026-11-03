#!/usr/bin/env python3
"""Extract a version section from CHANGELOG.md for the GitHub Release."""

from pathlib import Path
import re
import sys
from typing import Optional

if len(sys.argv) != 3:
    raise SystemExit("usage: extract-release-notes.py VERSION OUTPUT_FILE")

version, output_name = sys.argv[1:]
lines = Path("CHANGELOG.md").read_text(encoding="utf-8").splitlines()
version_pattern = re.compile(rf"(?<![0-9.]){re.escape(version)}(?=$|[\s·])")
sections: list[list[str]] = []
current: Optional[list[str]] = None

for line in lines:
    if line.startswith("## "):
        if current is not None:
            sections.append(current)
        current = [line]
    elif current is not None:
        current.append(line)

if current is not None:
    sections.append(current)

matches = [section for section in sections if version_pattern.search(section[0])]
if len(matches) != 1:
    raise SystemExit(f"Expected one CHANGELOG.md section for {version}, found {len(matches)}")

notes = "\n".join(matches[0][1:]).strip()
if not notes:
    raise SystemExit(f"CHANGELOG.md section for {version} is empty")

Path(output_name).write_text(notes + "\n", encoding="utf-8")
