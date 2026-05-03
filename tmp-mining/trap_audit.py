"""SCRIPT_TAG escape-trap audit for the demo bundle.

Originally a single-file scan of src/routes/demo.ts. Post Sec-31r refactor
the demo's inlined <script> body lives across 32 fragment files under
src/demo/script/fragments/, plus styles.ts (CSS template) and demo.ts
(HTML structure template). The audit now walks every TS template literal
in those files and flags the four classic traps:

  Trap 1 — single-backslash-apostrophe inside a JS string:
    source: '...don\\'t...' → served: '...don't...' (string ends early)
    safe:   '...don\\\\'t...' → served: '...don\\'t...' (escaped properly)

  Trap 2 — single-backslash-newline (or other escape) inside a JS string:
    source: split("\\n")  → served: split("(literal newline)") — broken
    safe:   split("\\\\n") → served: split("\\n") — works

  Trap 3 — single-backslash forward-slash inside a regex literal:
    source: /foo\\/bar/ → served: /foo/bar/ — invalid regex syntax
    safe:   /foo\\\\/bar/ → served: /foo\\/bar/ — works

  Trap 4 — unescaped backtick anywhere in a template-literal region:
    source: // see `foo`        → ends the outer template literal early
    source: const x = "a `b" c"  → backtick mid-string, same problem
    safe:   replace bare ` with \\` (e.g. // see \\`foo\\`)
    Trap 4 is the trickiest: it can hide in COMMENTS, where neither the
    JS engine nor the trap_audit's "skip comment lines" filter sees it,
    but the OUTER TS template-literal parser absolutely does. A single
    bare backtick in a JS comment cascades into a syntax error 8000+
    lines below the actual location.

Template-literal region detection per file:
  - For each file, find every line that opens a top-level template
    literal (matches /\\b(const|let|var)\\s+\\w+\\s*=\\s*`/, /return\\s+`/,
    or contains a bare `` ` `` after `=` or `(`). Find the closing line
    (the matching backtick). Audit the region between (exclusive of the
    opening and closing lines themselves).
  - If a file has no top-level template literals, skip it.

Files scanned (post-refactor):
  src/routes/demo.ts                  — the HTML template + script-tag wrapper
  src/demo/styles.ts                  — the CSS template (Trap 4 only relevant)
  src/demo/script/fragments/*.ts      — 32 inlined-JS fragments

Run:
  python tmp-mining/trap_audit.py

Exit code 0 = clean. Non-zero = trap detected (specific files + lines listed).
"""
from __future__ import annotations

import glob
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

BS = chr(92)        # backslash
APO = chr(39)       # apostrophe
BACKTICK = chr(96)


def find_template_regions(lines: list[str]) -> list[tuple[int, int]]:
    r"""Return list of (open_line, close_line) 1-indexed inclusive.

    Detects regions delimited by a backtick that opens a top-level
    template literal and the backtick that closes it. Heuristic:
      - An OPEN line matches:
        - ``export const NAME = ` ``
        - ``export function NAME(...): string {`` (next-line ``return `...``)
        - ``const NAME = ` ``
        - ``return ` ``
      - The matching CLOSE is the next line whose stripped content ends
        with `` `; `` or contains `` `; `` after the opening line.

    For nested or multiple regions in one file, both are returned.
    """
    regions: list[tuple[int, int]] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # Detect an opener: line ends with a bare backtick (last non-whitespace
        # char is `, with the previous char NOT a backslash). We look for
        # patterns where the opening backtick appears before any code that
        # would consume it.
        opener_match = (
            re.search(r'(?:^|\s|=|\()`(?!`)', line)
            and BACKTICK in line
        )
        # More direct: look for lines that have an UNESCAPED backtick AND
        # that backtick is the start of a template literal (not the end of
        # a previous one).
        backticks_in_line = [j for j, c in enumerate(line) if c == BACKTICK
                             and (j == 0 or line[j - 1] != BS)]
        if backticks_in_line:
            # Use the first unescaped backtick as the open. Then look for
            # the matching close on a later line: a line containing an
            # unescaped backtick. Skip the first occurrence on the SAME
            # line (e.g. `let x = \`hello\`;`).
            open_idx = backticks_in_line[0]
            # Same-line close?
            same_line_unescaped_after = [
                j for j in backticks_in_line if j > open_idx
            ]
            if same_line_unescaped_after:
                # Single-line literal — skip; not interesting (no body to scan).
                i += 1
                continue
            # Multi-line: scan forward for closing backtick line.
            j = i + 1
            close_line = None
            while j < len(lines):
                nl = lines[j]
                bt = [k for k, c in enumerate(nl) if c == BACKTICK
                      and (k == 0 or nl[k - 1] != BS)]
                if bt:
                    close_line = j
                    break
                j += 1
            if close_line is None:
                # Unterminated — leave it; the file would be a syntax error
                # and TypeScript would catch it. Don't try to be clever.
                i += 1
                continue
            regions.append((i + 1, close_line + 1))  # 1-indexed
            i = close_line + 1
            continue
        i += 1
    return regions


def audit_file(path: Path) -> tuple[
    list[tuple[int, str]],  # trap1
    list[tuple[int, str]],  # trap2
    list[tuple[int, str]],  # trap3
    list[tuple[int, str]],  # trap4
]:
    """Audit a single file, returning lists of (line, snippet) per trap."""
    lines = path.read_text(encoding="utf-8").splitlines()
    regions = find_template_regions(lines)
    if not regions:
        return ([], [], [], [])

    traps_apo: list[tuple[int, str]] = []
    traps_esc: list[tuple[int, str]] = []
    traps_regex: list[tuple[int, str]] = []
    traps_backtick: list[tuple[int, str]] = []

    in_region_lines: set[int] = set()
    boundary_lines: set[int] = set()
    for start, end in regions:
        for k in range(start, end + 1):
            if k == start or k == end:
                boundary_lines.add(k)
            in_region_lines.add(k)

    for i, line in enumerate(lines, 1):
        if i not in in_region_lines:
            continue

        stripped = line.lstrip()
        is_comment = stripped.startswith("//") or stripped.startswith("*")

        # Trap 4: unescaped backtick INSIDE a region (excluding boundary lines
        # which contain the legitimate open/close backticks).
        if i not in boundary_lines:
            j = 0
            while j < len(line):
                if line[j] == BACKTICK:
                    bs = 0
                    k = j - 1
                    while k >= 0 and line[k] == BS:
                        bs += 1
                        k -= 1
                    if bs % 2 == 0:
                        traps_backtick.append((i, line.rstrip()[:200]))
                        break
                j += 1

        # Traps 1–3 only apply outside comments (JS parser's view).
        if is_comment:
            continue

        # Trap 1: single \' inside a non-comment line.
        j = 0
        while j < len(line):
            if line[j] == APO:
                bs = 0
                k = j - 1
                while k >= 0 and line[k] == BS:
                    bs += 1
                    k -= 1
                if bs == 1:
                    traps_apo.append((i, line.rstrip()[:200]))
                    break
            j += 1

        # Trap 2: single-backslash escape inside a JS string. Look for "\X"
        # where X is n/t/r and there's no preceding extra \.
        for m in re.finditer(r'"([^"]*?)"', line):
            s = m.group(1)
            bs_count = 0
            idx = 0
            while idx < len(s):
                if s[idx] == BS:
                    bs_count += 1
                    idx += 1
                    continue
                if bs_count == 1 and s[idx] in "ntr":
                    traps_esc.append((i, line.rstrip()[:200]))
                    break
                bs_count = 0
                idx += 1

        # Trap 3: single \/ inside a regex literal. Heuristic: look for `\/`
        # where the backslash isn't itself escaped.
        j = 0
        while j < len(line) - 1:
            if line[j] == BS and line[j + 1] == "/":
                bs = 1
                k = j - 1
                while k >= 0 and line[k] == BS:
                    bs += 1
                    k -= 1
                if bs % 2 == 1:
                    traps_regex.append((i, line.rstrip()[:200]))
                    break
            j += 1

    return (traps_apo, traps_esc, traps_regex, traps_backtick)


def main() -> int:
    targets = [
        REPO_ROOT / "src" / "routes" / "demo.ts",
        REPO_ROOT / "src" / "demo" / "styles.ts",
        *sorted(
            (REPO_ROOT / "src" / "demo" / "script").glob("**/*.ts")
        ),
    ]
    targets = [p for p in targets if p.is_file()]

    total_apo = total_esc = total_regex = total_bt = 0
    any_findings = False

    print(f"Auditing {len(targets)} files for SCRIPT_TAG escape traps...")
    print()

    for path in targets:
        rel = path.relative_to(REPO_ROOT).as_posix()
        traps_apo, traps_esc, traps_regex, traps_bt = audit_file(path)
        n = len(traps_apo) + len(traps_esc) + len(traps_regex) + len(traps_bt)
        if n == 0:
            continue
        any_findings = True
        print(f"=== {rel} ===")
        if traps_apo:
            print(f"  Trap 1 (single \\'): {len(traps_apo)}")
            for i, l in traps_apo[:5]:
                print(f"    L{i}: {l}")
        if traps_esc:
            print(f"  Trap 2 (\\n/\\t/\\r in string): {len(traps_esc)}")
            for i, l in traps_esc[:5]:
                print(f"    L{i}: {l}")
        if traps_regex:
            print(f"  Trap 3 (\\/ in regex): {len(traps_regex)}")
            for i, l in traps_regex[:5]:
                print(f"    L{i}: {l}")
        if traps_bt:
            print(f"  Trap 4 (unescaped `): {len(traps_bt)}")
            for i, l in traps_bt[:5]:
                print(f"    L{i}: {l}")
        print()
        total_apo += len(traps_apo)
        total_esc += len(traps_esc)
        total_regex += len(traps_regex)
        total_bt += len(traps_bt)

    print(f"Totals  Trap1={total_apo}  Trap2={total_esc}  Trap3={total_regex}  Trap4={total_bt}")
    if any_findings:
        print()
        print("REMEDIATION:")
        print("  Traps 1–3: double the backslash in source so served JS sees the intended escape.")
        print("  Trap 4:    escape the backtick (\\`) or replace with plain text in comments.")
        return 1
    print("CLEAN — no traps detected.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
