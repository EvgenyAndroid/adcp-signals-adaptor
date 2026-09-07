#!/usr/bin/env node
// scripts/adcp-watch.mjs
//
// Daily AdCP ecosystem watcher. Runs all checks, diffs against the last-known
// state stored in a tracking issue body, posts a comment ONLY when something
// substantive changed. The noise floor is the whole point: most days nothing
// changes, the workflow run is silent, and a comment in the tracking issue
// means something actually moved.
//
// State storage: in the tracking issue body inside the
// <!-- adcp-watcher:state:start --> ... :end --> markers. No state file, no
// commits — keeps the watcher idempotent against the repo.
//
// Tracking issue: auto-created on first run if no open issue carries the
// `adcp-watcher-tracker` label. Pre-create one manually if you want a specific
// number; the script finds it by label, not number.
//
// Local run: `gh auth login` + `node scripts/adcp-watch.mjs` (no API key needed).
// Local --dry: prints what would change without editing the issue or posting.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// No @adcp/sdk import here any more (2026-09-07). The watcher used to run the
// SDK's legacy `testAllScenarios()` suite itself. That suite is 7 scenarios
// for a signals-only agent on ANY SDK version and never matched the AAO
// registry card, which is graded by the storyboard runner — so the daily
// snapshot reported a number nothing else agreed with. Section 3d now reads
// the card's own public feeds instead; see the note there.

const CONFIG_PATH = ".github/adcp-watch-config.json";
const STATE_OPEN = "<!-- adcp-watcher:state:start -->";
const STATE_CLOSE = "<!-- adcp-watcher:state:end -->";
const DRY_RUN = process.argv.includes("--dry");

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const repo =
  process.env.GITHUB_REPOSITORY ??
  execSync("gh repo view --json nameWithOwner -q .nameWithOwner").toString().trim();
// A card whose newest history run is older than this is treated as stalled.
// The healthy cadence is a grader heartbeat every ~12h; 36h absorbs one
// missed beat without crying wolf.
const STALL_AFTER_MS = 36 * 60 * 60 * 1000;

function gh(args) {
  return execSync(`gh ${args}`, { encoding: "utf8" });
}
function ghJson(args) {
  return JSON.parse(gh(args));
}
function ghBodyFile(cmdPrefix, body) {
  // gh accepts large bodies via --body-file but not via --body on Windows
  // because of arg-length limits — write to tmp and clean up. Returns the
  // command's stdout so callers can parse, e.g., the URL gh issue create
  // prints on success.
  const tmp = join(tmpdir(), `adcp-watcher-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  writeFileSync(tmp, body);
  try {
    return gh(`${cmdPrefix} --body-file ${JSON.stringify(tmp)}`);
  } finally {
    unlinkSync(tmp);
  }
}

// ─── 1. Find or create tracking issue ─────────────────────────────────────────
function findOrCreateTrackingIssue() {
  const label = config.tracking_issue_label;
  const list = ghJson(
    `issue list --repo ${repo} --label ${label} --state open --limit 1 --json number,body,title`
  );
  if (list.length > 0) return list[0];

  if (DRY_RUN) {
    console.log("[dry-run] would create tracking issue with label", label);
    return { number: 0, body: "", title: "AdCP Ecosystem Watcher" };
  }

  // Create the label first if it doesn't exist. gh exits non-zero with
  // "already exists" in stderr when the label is already there — swallow
  // only that specific case so real failures (auth, validation) surface.
  try {
    gh(`label create ${label} --repo ${repo} --color BFD4F2 --description "Auto-created by adcp-watch"`);
  } catch (e) {
    const msg = String(e?.stderr ?? e?.message ?? e);
    if (!/already exists/i.test(msg)) throw e;
  }

  const seedBody = [
    "# AdCP Ecosystem Watcher",
    "",
    "Automated daily monitor for the `@adcp/sdk` SDK, the AdCP spec, our tracked",
    "upstream issues, and the registry's compliance card for the deployed adapter. Comments below",
    "are diff reports posted only when state changes — silence means nothing moved.",
    "",
    "**Watched:** see [`.github/adcp-watch-config.json`](../blob/HEAD/.github/adcp-watch-config.json).",
    "**Workflow:** [`.github/workflows/adcp-watch.yml`](../blob/HEAD/.github/workflows/adcp-watch.yml).",
    "",
    STATE_OPEN,
    "```json",
    "{}",
    "```",
    STATE_CLOSE,
    "",
  ].join("\n");

  // gh issue create prints the new issue's URL on stdout. Parse the issue
  // number from there rather than re-querying by label — GitHub's
  // label-filtered list index lags issue creation by a few seconds and
  // the immediate re-query came back empty in the wild.
  const createOutput = ghBodyFile(
    `issue create --repo ${repo} --title "AdCP Ecosystem Watcher" --label ${label}`,
    seedBody
  );
  const numMatch = createOutput.match(/\/issues\/(\d+)/);
  if (!numMatch) {
    throw new Error(
      `could not parse issue number from gh issue create output: ${JSON.stringify(createOutput)}`
    );
  }
  return ghJson(
    `issue view ${numMatch[1]} --repo ${repo} --json number,body,title`
  );
}

// ─── 2. Extract state JSON from issue body ────────────────────────────────────
function extractState(body) {
  const start = body.indexOf(STATE_OPEN);
  const end = body.indexOf(STATE_CLOSE);
  if (start < 0 || end < 0) return {};
  const between = body.slice(start + STATE_OPEN.length, end);
  const match = between.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) return {};
  try {
    return JSON.parse(match[1]);
  } catch {
    return {};
  }
}

// ─── 3. Run all checks → new state ────────────────────────────────────────────
async function buildNewState() {
  const newState = { last_check_utc: new Date().toISOString() };

  // 3a. SDK pin vs the CONFORMANCE-CANONICAL dist-tags.
  //     We deliberately do NOT track bare `latest`: it floats ahead on
  //     dev-tooling point releases the deployed worker never imports (the
  //     worker bundles vendored schemas — the SDK is only used by the
  //     compliance runner), so `latest` churn (7.11.1→.2→.3 in three days)
  //     was pure watcher noise. Track the `adcp-3.0` / `adcp-3.1` dist-tags
  //     instead — the builds our storyboard suite actually grades against.
  //     Fires only when a conformance build moves.
  //     Post-GA (2026-06-26): upstream RETIRED the `adcp-3.1` parallel tag.
  //     `latest` (9.x, GA) is now the canonical 3.1 conformance build, so
  //     conformance_3_1 falls back to `latest` when `adcp-3.1` is absent —
  //     otherwise it reads null forever and the 3.1 line goes untracked.
  //     (Revisit if a future 4.0 line ever claims `latest`.)
  const pkgJson = JSON.parse(readFileSync(config.client_sdk.package_json_path, "utf8"));
  const pin =
    pkgJson.devDependencies?.[config.client_sdk.package_name] ??
    pkgJson.dependencies?.[config.client_sdk.package_name] ??
    null;
  let distTags = null;
  try {
    distTags = JSON.parse(execSync(`npm view ${config.client_sdk.package_name} dist-tags --json`, { encoding: "utf8" }));
  } catch (e) {
    distTags = { error: String(e.message ?? e) };
  }
  newState.client_sdk = distTags?.error
    ? { current_pin: pin, error: distTags.error }
    : {
        current_pin: pin,
        conformance_3_0: distTags?.["adcp-3.0"] ?? null,
        conformance_3_1: distTags?.["adcp-3.1"] ?? distTags?.["latest"] ?? null,
      };

  // 3a-bis. Secondary SDKs — packages we don't pin yet but want to watch
  // (e.g. @adcp/sdk while migrating off @adcp/client). Watcher pings on
  // every new release so we can audit before bumping. State diff fires
  // any time `latest_published` for a secondary changes.
  if (Array.isArray(config.secondary_sdks) && config.secondary_sdks.length > 0) {
    newState.secondary_sdks = {};
    for (const s of config.secondary_sdks) {
      let secondaryLatest = null;
      try {
        secondaryLatest = JSON.parse(execSync(`npm view ${s.package_name} version --json`, { encoding: "utf8" }));
      } catch (e) {
        secondaryLatest = { error: String(e.message ?? e) };
      }
      newState.secondary_sdks[s.package_name] = { latest_published: secondaryLatest };
    }
  }

  // 3b. AdCP spec latest release.
  //     `/releases/latest` returns only the latest STABLE release — GitHub
  //     excludes prereleases from that endpoint — so it sat at v3.0.15 and was
  //     structurally blind to the entire 3.1.0-rc.* line (rc.10..rc.14 all
  //     slipped past silently). Also track the latest PRERELEASE via `/releases`
  //     (which DOES include prereleases, newest first) so each new RC fires a
  //     state change. `latest_tag` keeps its stable-only meaning for callers.
  try {
    const stable = ghJson(`api repos/${config.spec_repo}/releases/latest`);
    newState.spec_release = {
      latest_tag: stable.tag_name,
      published_at: stable.published_at,
    };
    const all = ghJson(`api repos/${config.spec_repo}/releases?per_page=10`);
    const newestPrerelease = Array.isArray(all)
      ? all.find((r) => r.prerelease && !r.draft)
      : null;
    if (newestPrerelease && newestPrerelease.tag_name !== stable.tag_name) {
      newState.spec_release.latest_prerelease_tag = newestPrerelease.tag_name;
      newState.spec_release.latest_prerelease_published_at =
        newestPrerelease.published_at;
    }
  } catch (e) {
    newState.spec_release = { error: String(e.message ?? e) };
  }

  // 3b-bis. Signals-relevant SCHEMA DRIFT: latest stable tag vs. main.
  //
  // The release check above sees THAT a version shipped; it cannot see WHAT
  // changed inside it. That gap was live: v3.1.2→v3.1.4 looked identical at
  // the version level while `signals/activate-signal-request.json` gained
  // `governance_context`, and v3.1.5 relocated `retry_after` inside
  // `protocol/get-adcp-capabilities-response.json` — both invisible here
  // until diffed by hand.
  //
  // Method: per-directory tree-SHA listing, NOT the compare API. GitHub's
  // `/compare/a...b` caps `files[]` at 300 and `--paginate` does not extend
  // it; a v3.1.0→v3.1.1 audit returned exactly 300 entries and silently
  // omitted the rest. Listing each directory's blob SHAs and diffing the
  // lists has no such ceiling.
  //
  // Emits a sorted filename array per directory (empty = identical), so the
  // generic state walker reports "core/targeting.json changed" in the issue
  // comment. Known-benign churn still shows up — the point is visibility,
  // and judging benign-vs-material is a human call, not the watcher's.
  newState.spec_schema_drift = {};
  const driftTag = newState.spec_release?.latest_tag;
  if (driftTag) {
    newState.spec_schema_drift.baseline_tag = driftTag;
    for (const dir of config.spec_schema_drift_dirs ?? []) {
      try {
        const listing = (ref) => {
          const rows = ghJson(
            `api "repos/${config.spec_repo}/contents/${dir}?ref=${ref}"`
          );
          if (!Array.isArray(rows)) return null;
          return new Map(rows.map((r) => [r.name, r.sha]));
        };
        const atTag = listing(driftTag);
        const atMain = listing("main");
        if (!atTag || !atMain) {
          newState.spec_schema_drift[dir] = { error: "listing unavailable" };
          continue;
        }
        const changed = [];
        for (const [name, sha] of atMain) {
          if (!atTag.has(name)) changed.push(`${name} (added on main)`);
          else if (atTag.get(name) !== sha) changed.push(name);
        }
        for (const name of atTag.keys()) {
          if (!atMain.has(name)) changed.push(`${name} (removed on main)`);
        }
        newState.spec_schema_drift[dir] = changed.sort();
      } catch (e) {
        newState.spec_schema_drift[dir] = { error: String(e.message ?? e) };
      }
    }
  }

  // 3c. Tracked upstream issues / PRs
  newState.tracked_issues = {};
  for (const item of config.tracked_issues) {
    const key = `${item.repo}#${item.number}`;
    try {
      const data = ghJson(`api repos/${item.repo}/issues/${item.number}`);
      newState.tracked_issues[key] = {
        state: data.state,
        labels: (data.labels ?? []).map((l) => l.name).sort(),
        milestone: data.milestone?.title ?? null,
        merged: data.pull_request ? Boolean(data.pull_request.merged_at) : null,
        updated_at: data.updated_at,
      };
    } catch (e) {
      newState.tracked_issues[key] = { error: String(e.message ?? e) };
    }
  }

  // 3c-bis. External agent registries (e.g. agenticadvertising.org).
  // Identity for diff = config.agent_id_field (default "url"). Stored as
  // a stable, sorted dict keyed on identity → summary fields, so the
  // generic walker reports "agent X added/removed" cleanly. Network
  // errors store as { error } so the watcher's silence-on-no-change
  // semantics still fire on transient failures.
  if (Array.isArray(config.external_registries) && config.external_registries.length > 0) {
    newState.external_registries = {};
    for (const reg of config.external_registries) {
      const idField = reg.agent_id_field || "url";
      const summaryFields = Array.isArray(reg.agent_summary_fields)
        ? reg.agent_summary_fields
        : ["name"];
      try {
        const r = await fetch(reg.url, { headers: { "Accept": "application/json" } });
        if (!r.ok) {
          newState.external_registries[reg.name] = {
            error: `HTTP ${r.status} ${r.statusText}`,
          };
          continue;
        }
        const j = await r.json();
        // Accept both top-level array and { agents } / { data } / { results }.
        const list = Array.isArray(j) ? j : (j.agents || j.data || j.results || []);
        const agents = {};
        for (const a of list) {
          const id = a?.[idField];
          if (typeof id !== "string" || id.length === 0) continue;
          // Pick stable summary fields. Skip absent ones rather than
          // emitting null — keeps the diff focused on real changes.
          const summary = {};
          for (const f of summaryFields) {
            if (a[f] !== undefined && a[f] !== null) summary[f] = a[f];
          }
          agents[id] = summary;
        }
        newState.external_registries[reg.name] = {
          count: Object.keys(agents).length,
          agents,
        };
      } catch (e) {
        newState.external_registries[reg.name] = {
          error: String(e?.message ?? e),
        };
      }
    }
  }

  // 3c-ter. Contribution-page parity. Every OPEN upstream issue/PR authored
  // by config.contribution_page.author on spec_repo must be cited (linked) on
  // the public contributions page. One-directional by design: the page may
  // cite extra numbers freely (references, maintainer-authored work) — only
  // MISSING authored items are drift. Found live: #5739/#5748 (filed,
  // implemented, triaged into 3.2.0) never made it onto the page because the
  // manual file-RFC → update-page step got skipped for a "Conformance" issue
  // that didn't match the RFC mental filter. This check replaces that memory
  // dependence. Fires once when a new authored item is missing, and once more
  // when the gap closes (missing list empties).
  if (config.contribution_page?.url && config.contribution_page?.author) {
    const cp = config.contribution_page;
    try {
      // The search API returns issues AND PRs (PRs carry a `pull_request` key).
      const found = ghJson(
        `api "search/issues?q=repo:${config.spec_repo}+author:${cp.author}+state:open&per_page=100"`
      );
      const authored = Array.isArray(found?.items) ? found.items : [];
      const r = await fetch(cp.url, { headers: { Accept: "text/html" } });
      if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${cp.url}`);
      const html = await r.text();
      const cited = new Set();
      const linkRe = new RegExp(
        `${config.spec_repo.replace("/", "\\/")}\\/(?:issues|pull)\\/(\\d+)`,
        "g"
      );
      let m;
      while ((m = linkRe.exec(html)) !== null) cited.add(m[1]);
      const missing = authored
        .filter((it) => !cited.has(String(it.number)))
        .map((it) => `#${it.number} (${it.pull_request ? "pr" : "issue"}) ${String(it.title).slice(0, 60)}`)
        .sort();
      newState.contribution_page = {
        authored_open: authored.length,
        missing_from_page: missing,
      };
    } catch (e) {
      newState.contribution_page = { error: String(e?.message ?? e) };
    }
  }

  // 3d. Compliance, as the registry grades it.
  //
  // Until 2026-09-07 this ran the SDK's `testAllScenarios()` locally. That is
  // the legacy scenario suite — 7 scenarios for a signals-only agent, and
  // byte-identical output on @adcp/sdk 5.25.1 and 13.0.0 — so it could never
  // reproduce the AAO card (35 storyboards on the 3.1.x line), which is graded
  // by the storyboard runner. A watcher should track the card, so this reads
  // the two public feeds the card is built from: no API key, no 20-second
  // suite in CI, and the number here is the number a buyer sees.
  //
  // Two feeds, both unauthenticated:
  //   …/agents/<urlencoded agent_url>/compliance         — current verdict
  //   …/agents/<urlencoded agent_url>/compliance/history — the runs behind it
  //
  // What goes in the state and why:
  //   - line / status / headline / verified / storyboards_passing — the grade.
  //   - non_passing — every storyboard not `passing`, with step counts for
  //     partials, sorted so the array diff only fires on real movement.
  //   - notices — e.g. the AdCP 4.0 future_required / deprecation notices.
  //   - history_stalled — TRUE when the newest history run is older than
  //     STALL_AFTER_MS. This is the failure mode the sales card exhibited from
  //     2026-08-19 to 2026-09-07: `last_checked_at` kept ticking twice a day
  //     (a health check) while zero comply runs executed and every storyboard
  //     verdict silently froze. Neither field above reveals that; this does.
  //   - latest_run_at / last_checked_at — kept for humans reading the
  //     snapshot, EXCLUDED from the diff (see skipKeys): the first recurs
  //     every ~12h and the second is a health-check stamp that has been
  //     observed null and future-dated. Neither means anything changed.
  //
  // Requires config.registry_card.agent_url = the URL the registry keys the
  // card on (the /mcp form on the custom domain), NOT the workers.dev origin.
  {
    const card = config.registry_card ?? {};
    const apiBase = card.api_base ?? "https://agenticadvertising.org/api/registry/agents";
    if (!card.agent_url) {
      newState.compliance = { skipped: "no registry_card.agent_url in config" };
    } else {
      try {
        const enc = encodeURIComponent(card.agent_url);
        const getJson = async (url) => {
          const r = await fetch(url, { headers: { Accept: "application/json" } });
          if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
          return r.json();
        };
        const [c, h] = await Promise.all([
          getJson(`${apiBase}/${enc}/compliance`),
          getJson(`${apiBase}/${enc}/compliance/history`),
        ]);
        const runs = Array.isArray(h?.runs)
          ? [...h.runs].sort((a, b) => String(a.tested_at).localeCompare(String(b.tested_at)))
          : [];
        const latest = runs[runs.length - 1] ?? null;
        const latestAt = latest?.tested_at ? Date.parse(latest.tested_at) : NaN;
        const nonPassing = (c.storyboard_statuses ?? [])
          .filter((s) => s.status !== "passing")
          .map((s) =>
            s.status === "partial"
              ? `${s.storyboard_id}:partial(${s.steps_passed}/${s.steps_total})`
              : `${s.storyboard_id}:${s.status}`
          )
          .sort();
        newState.compliance = {
          source: `${apiBase}/${enc}/compliance`,
          adcp_version: c.adcp_version ?? null,
          status: c.status ?? null,
          headline: c.headline ?? null,
          verified: c.verified ?? null,
          storyboards_passing: c.storyboards_passing ?? null,
          storyboards_total: c.storyboards_total ?? null,
          non_passing: nonPassing,
          notices: (c.notices ?? []).map((n) => `${n.severity}:${n.code}`).sort(),
          history_stalled: !Number.isFinite(latestAt) || Date.now() - latestAt > STALL_AFTER_MS,
          latest_run_line: latest?.adcp_version ?? null,
          latest_run_headline: latest?.headline ?? null,
          latest_run_at: latest?.tested_at ?? null,
          last_checked_at: c.last_checked_at ?? null,
        };
      } catch (e) {
        newState.compliance = { error: String(e?.message ?? e) };
      }
    }
  }

  return newState;
}

// ─── 4. Substantive diff (ignore timestamps that move without meaning) ──────
// `updated_at` on tracked issues drifts every comment — diff on
// state/labels/milestone/merged instead, the things that actually mean the
// issue moved. Likewise the compliance card's `last_checked_at` (a health
// check that ticks twice a day and has been observed null and future-dated)
// and `latest_run_at` (the grader heartbeat, every ~12h): both stay in the
// snapshot for humans and are excluded here, so a healthy cadence never
// reads as a state change. A stall surfaces through `history_stalled`.
function diffStates(prev, next) {
  const skipKeys = new Set([
    "last_check_utc",
    "published_at",
    "updated_at",
    "last_checked_at",
    "latest_run_at",
  ]);
  const changes = [];

  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function walk(prevVal, nextVal, path) {
    const last = path[path.length - 1];
    if (skipKeys.has(last)) return;
    if (typeof prevVal !== typeof nextVal || prevVal === null || typeof prevVal !== "object") {
      if (!eq(prevVal, nextVal)) {
        changes.push({ path: path.join("."), from: prevVal, to: nextVal });
      }
      return;
    }
    if (Array.isArray(prevVal)) {
      if (!eq(prevVal, nextVal)) {
        changes.push({ path: path.join("."), from: prevVal, to: nextVal });
      }
      return;
    }
    const keys = new Set([...Object.keys(prevVal ?? {}), ...Object.keys(nextVal ?? {})]);
    for (const k of keys) walk(prevVal?.[k], nextVal?.[k], [...path, k]);
  }
  walk(prev, next, []);
  return changes;
}

// ─── 5. Format diff as a comment ──────────────────────────────────────────────
function formatComment(changes, newState) {
  const lines = [`## State change · ${newState.last_check_utc}`, ""];
  for (const c of changes) {
    const from = c.from === undefined ? "_(new)_" : `\`${JSON.stringify(c.from)}\``;
    const to = c.to === undefined ? "_(removed)_" : `\`${JSON.stringify(c.to)}\``;
    lines.push(`- **\`${c.path}\`**: ${from} → ${to}`);
  }
  lines.push("");
  lines.push("<details><summary>Full state snapshot</summary>", "");
  lines.push("```json");
  lines.push(JSON.stringify(newState, null, 2));
  lines.push("```");
  lines.push("</details>");
  return lines.join("\n");
}

// ─── 6. Persist new state in the issue body ──────────────────────────────────
function updateIssueBody(issue, newState) {
  const block = `${STATE_OPEN}\n\`\`\`json\n${JSON.stringify(newState, null, 2)}\n\`\`\`\n${STATE_CLOSE}`;
  let body = issue.body ?? "";
  if (body.includes(STATE_OPEN) && body.includes(STATE_CLOSE)) {
    const re = new RegExp(
      `${STATE_OPEN.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}[\\s\\S]*?${STATE_CLOSE.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}`
    );
    body = body.replace(re, block);
  } else {
    body = `${body}\n\n${block}`;
  }
  if (DRY_RUN) {
    console.log("[dry-run] would update issue body to:");
    console.log(body);
    return;
  }
  ghBodyFile(`issue edit ${issue.number} --repo ${repo}`, body);
}

function postComment(issue, body) {
  if (DRY_RUN) {
    console.log("[dry-run] would post comment:");
    console.log(body);
    return;
  }
  ghBodyFile(`issue comment ${issue.number} --repo ${repo}`, body);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const issue = findOrCreateTrackingIssue();
const prevState = extractState(issue.body ?? "");
const newState = await buildNewState();
const changes = diffStates(prevState, newState);

console.log(`tracking issue: #${issue.number}`);
console.log(`changes detected: ${changes.length}`);

if (changes.length > 0) {
  postComment(issue, formatComment(changes, newState));
}
updateIssueBody(issue, newState);

console.log("done");
