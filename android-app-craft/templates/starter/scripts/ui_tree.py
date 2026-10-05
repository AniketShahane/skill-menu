#!/usr/bin/env python3
"""Reads a `uiautomator dump` file and prints tap targets, so no script guesses a coordinate.

  ui_tree.py <dump.xml>                 every labelled node:  label<TAB>x<TAB>y
  ui_tree.py <dump.xml> <label>         the centre of the first match:  x y   (empty if none)
  ui_tree.py <dump.xml> --match REGEX   every labelled node whose label matches REGEX
  ui_tree.py <dump.xml> --package PKG ...   the same, counting only nodes of package PKG

A node answers to its content-desc, its text and its resource-id (Compose test tags show up as
resource-ids only when the app sets testTagsAsResourceId); the first of those is what it prints
as its label. A <label> matches exactly first, then case-insensitively, then as a substring.
Zero-area nodes are skipped: an off-screen or collapsed node has bounds but cannot be tapped.

Parsed as XML, not by regex: a regex over `text=... bounds=` matches the empty text attribute
and skips the content-desc on the same node (flick:docs/store/codec-matrix-test.sh:54-62 had
to filter those out by hand).
"""
import re
import sys
import xml.etree.ElementTree as ET

BOUNDS = re.compile(r"\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]")


def targets(path, package=None):
    try:
        root = ET.parse(path).getroot()
    except (ET.ParseError, OSError) as failure:
        sys.exit(f"ui_tree.py: cannot read {path}: {failure}")
    for node in root.iter("node"):
        if package and node.get("package") != package:
            continue
        names = [n for n in (node.get(k, "").strip() for k in ("content-desc", "text", "resource-id")) if n]
        match = BOUNDS.fullmatch(node.get("bounds", ""))
        if not names or not match:
            continue
        x1, y1, x2, y2 = map(int, match.groups())
        if x2 <= x1 or y2 <= y1:
            continue
        yield names, (x1 + x2) // 2, (y1 + y2) // 2


def main(argv):
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(__doc__.strip())
        return 0 if len(argv) >= 2 else 2
    path, rest = argv[1], argv[2:]
    package = None
    if len(rest) >= 2 and rest[0] == "--package":
        package, rest = rest[1], rest[2:]
    nodes = list(targets(path, package))
    if not rest:
        for names, x, y in nodes:
            print(f"{names[0]}\t{x}\t{y}")
        return 0
    if rest[0] == "--match" and len(rest) == 2:
        pattern = re.compile(rest[1])
        for names, x, y in nodes:
            if any(pattern.search(n) for n in names):
                print(f"{names[0]}\t{x}\t{y}")
        return 0
    wanted = rest[0]
    for test in (
        lambda name: name == wanted,
        lambda name: name.lower() == wanted.lower(),
        lambda name: wanted.lower() in name.lower(),
    ):
        for names, x, y in nodes:
            if any(test(n) for n in names):
                print(f"{x} {y}")
                return 0
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
