"""SCRIPT_TAG escape-trap audit for demo.ts.

The whole demo.ts client JS lives inside a TypeScript template literal
(backticks). A backslash escape sequence in the source is collapsed
ONCE by the TS template, so `\\n` in source becomes `\n` in the served
JS. To get a literal `\n` (two-char escape) in the served JS, the
source needs `\\n` (two backslashes).

Two trap patterns this audit catches in the script-body region:

  Trap 1 — single-backslash-apostrophe inside a JS string:
    source: '...don\\'t...' → served: '...don't...' (string ends early)
    safe:   '...don\\\\'t...' → served: '...don\\'t...' (escaped properly)

  Trap 2 — single-backslash-newline (or other escape) inside a JS string:
    source: split("\\n")  → served: split("(literal newline)") — broken
    safe:   split("\\\\n") → served: split("\\n") — works
"""
import sys

BS = chr(92)        # backslash
APO = chr(39)       # apostrophe
SCRIPT_BODY_START_LINE = 4322   # approximate; tune if demo.ts shifts

with open('src/routes/demo.ts', 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')

traps_apo = []
traps_esc = []

for i, line in enumerate(lines, 1):
    if i < SCRIPT_BODY_START_LINE:
        continue
    stripped = line.lstrip()
    if stripped.startswith('//') or stripped.startswith('*'):
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

    # Trap 2: single-backslash escape inside a JS string.
    # Match patterns like split("\n"), join("\n"), "\n", etc. where
    # the surrounding quotes are " and the escape is single-backslash.
    # We look for `"\X"` where X is n/t/r and there's no preceding \.
    import re
    for m in re.finditer(r'"([^"]*?)"', line):
        s = m.group(1)
        # Look for unsafe \n / \t / \r in the string body.
        bs_count = 0
        idx = 0
        while idx < len(s):
            if s[idx] == BS:
                bs_count += 1
                idx += 1
                continue
            # Reset and check what follows BS run.
            if bs_count == 1 and s[idx] in 'ntr':
                # Single \n / \t / \r — the trap.
                traps_esc.append((i, line.rstrip()[:200]))
                break
            bs_count = 0
            idx += 1

# Trap 3: single-backslash forward-slash inside a regex literal.
# `/foo\/bar/` in source → `/foo/bar/` in served JS — invalid syntax.
# Common in regex literals; use string-slice or double-backslash instead.
traps_regex = []
for i, line in enumerate(lines, 1):
    if i < SCRIPT_BODY_START_LINE: continue
    stripped = line.lstrip()
    if stripped.startswith('//') or stripped.startswith('*'): continue
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

if traps_apo or traps_esc or traps_regex:
    print()
    print('REMEDIATION: double the backslash in source so the served JS sees the intended escape.')
    sys.exit(1)
