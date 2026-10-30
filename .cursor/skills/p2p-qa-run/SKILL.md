---
name: p2p-qa-run
description: Runs the P2P QA agent — the explorer, then the adversary, then the judge — and shows the report. Use when the user asks to run the QA agent, test the P2P API on its own, run the challenge, or check the business rules end to end against a running API.
---

# P2P QA run

Orchestrates the three challenge subagents in order. Default base URL: `http://localhost:8000` (override if the user gives another).

## Steps

GET `<base URL>`/health, and if it's down tell the user to run npm start and stop → empty qa-run/ (it holds run output only) → POST /admin/reset → run the p2p-explorer subagent with the base URL and wait → run the p2p-adversary subagent and wait → run the p2p-judge subagent → show the happy path status, the rule table, and the path to qa-run/report.json. Fix nothing, write no tests, file no bugs: those are separate steps a human starts.

## How to run each step

**Health** — curl `GET /health`. Expect 200 and `{"status":"ok"}`. If not, tell the user to start the API (`npm start` in the repo root) and **stop**; do not run subagents.

**Empty `qa-run/`** — Delete all files under `qa-run/` (create the folder if missing). Do not touch `src/`, `tests/`, or docs.

**Reset** — curl `POST /admin/reset` on the base URL before the explorer (explorer may reset again; that is fine).

**Subagents** — Launch in order via the Task tool, one at a time, wait for each to finish:

1. `p2p-explorer` — pass the base URL in the task prompt.
2. `p2p-adversary`
3. `p2p-judge`

Do not read `src/`. Do not fix the API, add tests, or open issues during this skill.

## After the judge

1. Read `qa-run/report.json` if present.
2. Show **`happy_path.status`** (`PASS` / `FAIL`).
3. Show the judge’s **rule table** (rule | status | one line of evidence).
4. Give the full path to **`qa-run/report.json`**.

If a subagent failed or logs are missing, say which step failed and what is in `qa-run/` — still do not fix or test.
