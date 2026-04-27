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
// Local dry-run: `gh auth login` + `API_KEY=... node scripts/adcp-watch.mjs`.
// Local --dry: prints what would change without editing the issue or posting.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import pkg from "@adcp/client/testing";
const { testAllScenarios, setAgentTesterLogger } = pkg;

// Silence the runner's per-step `[INFO] Starting agent test {…}` chatter —
// it's useful when running compliance interactively but pure noise in the
// watcher's daily log. Replace the logger with a no-op.
const noopLogger = {
  info: () => {},
  warn: () => {},
  error: (...args) => console.error(...args),
  debug: () => {},
};
if (typeof setAgentTesterLogger === "function") {
  setAgentTesterLogger(noopLogger);
}

const CONFIG_PATH = ".github/adcp-watch-config.json";
const STATE_OPEN = "<!-- adcp-watcher:state:start -->";
const STATE_CLOSE = "<!-- adcp-watcher:state:end -->";
const DRY_RUN = process.argv.includes("--dry");

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const repo =
  process.env.GITHUB_REPOSITORY ??
  execSync("gh repo view --json nameWithOwner -q .nameWithOwner").toString().trim();
const agentUrl =
  process.env.AGENT_URL ?? "https://adcp-signals-adaptor.evgeny-193.workers.dev/mcp";

function gh(args) {
  return execSync(`gh ${args}`, { encoding: "utf8" });
}
function ghJson(args) {
  return JSON.parse(gh(args));
}
function ghBodyFile(cmdPrefix, body) {
  // gh accepts large bodies via --body-file but not via --body on Windows
  // because of arg-length limits — write to tmp and clean up.
  const tmp = join(tmpdir(), `adcp-watcher-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  writeFileSync(tmp, body);
  try {
    gh(`${cmdPrefix} --body-file ${JSON.stringify(tmp)}`);
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

  // Create the label first if it doesn't exist (idempotent).
  try {
    gh(`label create ${label} --repo ${repo} --color BFD4F2 --description "Auto-created by adcp-watch"`);
  } catch {
    /* already exists */
  }

  const seedBody = [
    "# AdCP Ecosystem Watcher",
    "",
    "Automated daily monitor for the `@adcp/client` SDK, the AdCP spec, our tracked",
    "upstream issues, and live compliance against the deployed adapter. Comments below",
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

  ghBodyFile(
    `issue create --repo ${repo} --title "AdCP Ecosystem Watcher" --label ${label}`,
    seedBody
  );
  // Re-fetch to get the issue number + body the API stamped on it.
  const created = ghJson(
    `issue list --repo ${repo} --label ${label} --state open --limit 1 --json number,body,title`
  );
  return created[0];
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

  // 3a. SDK pin vs latest published
  const pkgJson = JSON.parse(readFileSync(config.client_sdk.package_json_path, "utf8"));
  const pin =
    pkgJson.devDependencies?.[config.client_sdk.package_name] ??
    pkgJson.dependencies?.[config.client_sdk.package_name] ??
    null;
  let latest = null;
  try {
    latest = JSON.parse(execSync(`npm view ${config.client_sdk.package_name} version --json`, { encoding: "utf8" }));
  } catch (e) {
    latest = { error: String(e.message ?? e) };
  }
  newState.client_sdk = { current_pin: pin, latest_published: latest };

  // 3b. AdCP spec latest release
  try {
    const release = ghJson(`api repos/${config.spec_repo}/releases/latest`);
    newState.spec_release = {
      latest_tag: release.tag_name,
      published_at: release.published_at,
    };
  } catch (e) {
    newState.spec_release = { error: String(e.message ?? e) };
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

  // 3d. Live compliance run
  if (process.env.API_KEY) {
    try {
      const result = await testAllScenarios(agentUrl, {
        protocol: "mcp",
        auth: { type: "bearer", token: process.env.API_KEY },
        test_kit: { auth: { probe_task: "get_signals", api_key: process.env.API_KEY } },
      });
      newState.compliance = {
        applicable: result.scenarios_run.length,
        passed: result.passed_count,
        failed: result.failed_count,
        scenarios_run: result.scenarios_run.slice().sort(),
        skipped_count: result.scenarios_skipped.length,
      };
    } catch (e) {
      newState.compliance = { error: String(e.message ?? e) };
    }
  } else {
    newState.compliance = { skipped: "no API_KEY in env" };
  }

  return newState;
}

// ─── 4. Substantive diff (ignore last_check_utc and absolute updated_at) ─────
// `updated_at` on tracked issues drifts every comment — diff on
// state/labels/milestone/merged instead, the things that actually mean the
// issue moved.
function diffStates(prev, next) {
  const skipKeys = new Set(["last_check_utc", "published_at", "updated_at"]);
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
