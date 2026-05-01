"""SCRIPT_TAG escape-trap audit for demo.ts.

The whole demo.ts client JS lives inside a TypeScript template literal
(backticks). A backslash escape sequence in the source is collapsed
ONCE by the TS template, so `\\n` in source becomes `\n` in the served
JS. To get a literal `\n` (two-char escape) in the served JS, the
source needs `\\n` (two backslashes).

Four trap patterns this audit catches in the script-body region:

  Trap 1 — single-backslash-apostrophe inside a JS string:
    source: '...don\\'t...' → served: '...don't...' (string ends early)
    safe:   '...don\\\\'t...' → served: '...don\\'t...' (escaped properly)

  Trap 2 — single-backslash-newline (or other escape) inside a JS string:
    source: split("\\n")  → served: split("(literal newline)") — broken
    safe:   split("\\\\n") → served: split("\\n") — works

  Trap 3 — single-backslash forward-slash inside a regex literal:
    source: /foo\\/bar/ → served: /foo/bar/ — invalid regex syntax
    safe:   /foo\\\\/bar/ → served: /foo\\/bar/ — works

  Trap 4 — unescaped backtick anywhere in the script body:
    source: // see `foo`        → ends the outer template literal early
    source: const x = "a `b" c"  → backtick mid-string, same problem
    safe:   replace bare ` with \\` (e.g. // see \\`foo\\`)
    Trap 4 is the trickiest: it can hide in COMMENTS, where neither the
    JS engine nor the trap_audit's "skip comment lines" filter sees it,
    but the OUTER TS template-literal parser absolutely does. A single
    bare backtick in a JS comment cascades into a syntax error 8000+
    lines below the actual location.

Script-body region is auto-detected by finding the `return `<script`
and the closing `</script>`;` markers, so it stays correct as demo.ts
grows or shrinks.
"""
import re
import sys


def find_script_body_lines(lines):
    r"""Return (start_line, end_line) (1-indexed inclusive) of the JS region.

    Scans for `return \`<script` (start) and `</script>\`;` (end). If the
    markers aren't found, falls back to a wide range so traps 1-3 still
    behave like the original audit.

    The start_line itself contains the OPENING backtick of the template
    literal, and end_line contains the CLOSING backtick — both are
    legitimate. Trap 4 scanning explicitly skips these boundary lines.
    """
    start = None
    end = None
    for i, line in enumerate(lines, 1):
        if start is None and 'return `<script' in line:
            start = i
        if start is not None and end is None and '</script>`;' in line:
            end = i
            break
    if start is None or end is None:
        return (1, len(lines))
    return (start, end)


BS = chr(92)        # backslash
APO = chr(39)       # apostrophe

with open('src/routes/demo.ts', 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')

script_start, script_end = find_script_body_lines(lines)
print(f'Scanning script body lines {script_start}..{script_end} ({script_end - script_start + 1} lines)')

traps_apo = []
traps_esc = []
traps_regex = []
traps_backtick = []  # Trap 4

for i, line in enumerate(lines, 1):
    if i < script_start or i > script_end:
        continue

    stripped = line.lstrip()
    is_comment = stripped.startswith('//') or stripped.startswith('*')

    # Trap 4: unescaped backtick ANYWHERE in the script body, including
    # inside comments. A bare ` terminates the outer TS template literal.
    # We do NOT skip comment lines here — the OUTER parser doesn't see
    # JS comments, only template-literal content.
    #
    # Skip the boundary lines themselves: start_line opens the template
    # with `return \`<script`, end_line closes with `</script>\`;`. Both
    # backticks are legitimate template-literal delimiters.
    if i != script_start and i != script_end:
        j = 0
        while j < len(line):
            if line[j] == '`':
                # Count consecutive backslashes immediately before this `
                bs = 0
                k = j - 1
                while k >= 0 and line[k] == BS:
                    bs += 1
                    k -= 1
                # Even count (incl. 0) → unescaped → trap.
                if bs % 2 == 0:
                    traps_backtick.append((i, line.rstrip()[:200]))
                    break
            j += 1

    # Traps 1–3 only apply outside comments (the JS parser's view).
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

    # Trap 2: single-backslash escape inside a JS string. Look for `"\X"`
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
            if bs_count == 1 and s[idx] in 'ntr':
                traps_esc.append((i, line.rstrip()[:200]))
                break
            bs_count = 0
            idx += 1

    # Trap 3: single-backslash forward-slash inside a regex literal.
    j = 0
    while j < len(line) - 1:
        if line[j] == BS and line[j+1] == '/':
            bs = 1
            k = j - 1
            while k >= 0 and line[k] == BS:
                bs += 1
                k -= 1
            if bs % 2 == 1:
                traps_regex.append((i, line.rstrip()[:200]))
                break
        j += 1

print(f'Trap 1 — single \\\' inside non-comment line: {len(traps_apo)} match(es)')
for i, l in traps_apo[:10]:
    print(f'  L{i}: {l}')
print()
print(f'Trap 2 — single-backslash escape in JS string: {len(traps_esc)} match(es)')
for i, l in traps_esc[:10]:
    print(f'  L{i}: {l}')
print()
print(f'Trap 3 — single \\/ in regex literal (or escape outside string): {len(traps_regex)} match(es)')
for i, l in traps_regex[:10]:
    print(f'  L{i}: {l}')
print()
print(f'Trap 4 — unescaped backtick in script body (incl. comments): {len(traps_backtick)} match(es)')
for i, l in traps_backtick[:10]:
    print(f'  L{i}: {l}')

if traps_apo or traps_esc or traps_regex or traps_backtick:
    print()
    print('REMEDIATION:')
    print('  Traps 1–3: double the backslash in source so served JS sees the intended escape.')
    print('  Trap 4:    escape the backtick (\\`) or replace with plain text in comments.')
    sys.exit(1)
