# opencode-smol

> **S**mall · **M**inimal · **O**ptimal · **L**ight
>
> A token-frugal [opencode](https://github.com/sst/opencode) plugin for solo developers.

[![npm](https://img.shields.io/npm/v/opencode-smol.svg)](https://www.npmjs.com/package/opencode-smol)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

`smol` is a complete agent workflow in **one tiny package**: planning,
TDD-enforced coding, multi-lens review, and persistent
project memory. No bloat, no over-engineering, no monthly token bill
shock.

---

## Why smol

Mainstream agent frameworks (superpowers, gsd, gstack) are built for
teams. As a solo developer you do not need 23 specialist roles, a
spec-first pipeline, or thousands of lines of methodology prose.

You need:

1. A short brainstorm before you code.
2. Real TDD enforcement (RED → GREEN, no skipping).
3. A code review pass that catches the things you would rationalize away.
4. A persistent memory of *this* project so the AI does not re-learn it every session.

That is what smol is. Each agent prompt is **under 2.5 KB**. The whole
plugin is roughly the size of a single superpowers SKILL.

---

## What you get

### 5 slash commands

| Command | What it does |
| --- | --- |
| `/smol-plan` | Brainstorm → plan markdown saved under `.smol/plans/` |
| `/smol-build` | Run the next atomic task in TDD style |
| `/smol-fast` | One-shot: small change, no plan needed |
| `/smol-review` | Multi-lens review (correctness + security + minimalism in parallel) |
| `/smol-auto` | Conductor drives the full plan → code → review pipeline non-stop |

### 5 agents

| Agent | Role | Mode |
| --- | --- | --- |
| **Conductor** | Default primary. Understands intent, delegates, verifies. | `primary` (replaces `build` as default) |
| **Planner** | Stage-based brainstorming → atomic plan. | `primary` (replaces `plan`) |
| **Coder** | TDD-only. Iron law: no production code without a failing test. | `subagent` |
| **Reviewer** | Severity-tagged `[C]/[I]/[M]` review. Accepts a `Lens:` for parallel multi-angle review. | `subagent` |
| **Scout** | External research via context7 + exa MCP, parallel sources. | `subagent` |

The built-in `build` agent is kept (so you can still use it explicitly);
the built-in `plan` is hidden because Planner replaces it.

### 2 native tools

Agents prefer these over shell commands — schema-validated, no parsing.

| Tool | Args | Purpose |
| --- | --- | --- |
| `smol_wiki` | `kind: memory \| preferences \| pitfalls`, `entry: string ≤200` | Append a dated entry, dedups |
| `smol_plan` | `topic: string`, `content: string` | Write `.smol/plans/YYYY-MM-DD-<slug>.md` |

### 3 hooks

- **`session.start`** — injects a one-line prompt so the LLM checks `.smol/wiki/` when relevant.
- **`session.compacting`** — re-injects latest plan so project memory survives long sessions.
- **`session.created`** — bootstraps `.smol/wiki/` skeleton on first run.

---

## Install

Add to your `opencode.json` (project root or `~/.config/opencode/`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-smol"]
}
```

Restart opencode. The 5 commands, 5 agents, skills, tools and hooks are all live. No CLI, no file copying, no config edits beyond the line above.

---

## Quick start

```
/smol-plan       # describe what you want to build
/smol-auto       # let conductor drive plan → code → review
```

Or step through manually:

```
/smol-plan
/smol-build      # runs the next atomic task
/smol-build
/smol-review     # before committing
```

For tiny changes, skip planning:

```
/smol-fast "rename foo to bar in handlers/"
```

---

## Per-agent model config

Every smol agent ships with a free default: **`opencode/big-pickle`**, so
the plugin works out of the box even without a paid subscription. To
override per agent, create `.smol/smol.json`:

```json
{
  "agents": {
    "conductor": { "model": "anthropic/claude-sonnet-4-5", "variant": "high" },
    "planner": "openai/gpt-5-mini",
    "coder": { "model": "anthropic/claude-haiku-4-5" },
    "reviewer": { "model": "openai/gpt-5" }
  }
}
```

A bare string is shorthand for `{ "model": "..." }`. Unknown fields
(such as `variant`) are passed through to opencode's agent config.

---

## Layout it creates

```
.smol/
├── plans/YYYY-MM-DD-<topic>.md
└── wiki/
    ├── memory.md       # patterns and conventions of this project
    ├── preferences.md  # explicit user preferences
    └── pitfalls.md     # bugs / gotchas / workarounds
```

Add `.smol/` to `.gitignore` if you do not want to commit project
memory; commit it if you do (recommended for shared codebases).

---

## Parallelism

smol uses opencode's built-in `task` tool for parallel subagent
dispatch — no extra runtime, no background daemon.

- **Parallel review**: `/smol-review` fires three reviewer subagents
  in one message (`Lens: correctness`, `Lens: security`,
  `Lens: minimalism`), then the Conductor synthesizes one report.
- **Parallel research**: when a question has independent sub-parts,
  Conductor dispatches multiple Scouts at once.
- **Coder is never parallelized** — TDD requires one RED → GREEN cycle
  at a time.

---

## Worktree usage

smol intentionally does **not** ship a worktree implementation. If you
want isolated parallel branches, install
[`opencode-worktree`](https://github.com/kdcokenny/opencode-worktree)
alongside it and add a hint in your project's `AGENTS.md` describing
when the Conductor should reach for it. Two small, focused plugins,
zero overlap.

---

## Comparison

| | smol | superpowers | gsd | gstack |
| --- | --- | --- | --- | --- |
| Total methodology size | ~15 KB | ~150 KB | ~80 KB | ~120 KB |
| Agents | 5 | 1 (skill-based) | 11+ | 23 |
| TDD enforced | yes (iron law) | yes (skill) | partial | partial |
| Persistent project memory | yes (`.smol/wiki`) | no | partial | no |
| Per-agent model + variant | yes | n/a | yes (stage) | n/a |
| Solo-developer fit | ★★★ | ★★ | ★ | ★ |

---

## Philosophy

See [`SPEC.md`](./SPEC.md). Short version:

- Most agent frameworks are built for teams; solo work needs less.
- Methodology embedded in agent prompts, not floating skill files.
- Only the rules that get rationalized away under pressure are
  enforced as "iron laws".
- Wiki gives the project a memory so the AI does not
  re-discover it every session.
- Stay out of the way otherwise.

---

## Development

```bash
npm install
npm test
```

27 tests across plugin hooks, config, and tools.

---

## License

[MIT](./LICENSE)
