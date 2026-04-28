# smol

> **S**mall · **M**inimal · **O**ptimal · **L**ight
>
> A token-frugal opencode plugin for solo developers.

## What you get

- **6 slash commands**: `/smol-plan`, `/smol-build`, `/smol-fast`, `/smol-review`, `/smol-auto`, `/smol-map`
- **6 agents**: `conductor` (primary), `planner`, `coder`, `reviewer`, `mapper`, `scout`
- **3 native tools**: `smol_codemap`, `smol_wiki`, `smol_plan` — schema-validated, no shell needed
- **Session hook** that points the LLM at `.smol/codemap.md` and `.smol/wiki/`
- **Compaction hook** that re-injects codemap + latest plan so project memory survives long sessions
- **Event hook** that bootstraps `.smol/wiki/` on `session.created`
- **`codemap` CLI** for incremental project mapping

## Install

```bash
npm install -D smol
npx smol install      # copies bundled agents/skills/commands into .opencode/
```

To upgrade after `npm update smol`:

```bash
npx smol update       # overwrites previous copies (safe, idempotent)
```

The plugin auto-loads via the generated `.opencode/plugin/smol.ts` shim — no
config edits required. If you prefer manual loading, drop this into
`opencode.json`:

```json
{ "plugins": ["smol"] }
```

## Quick start

```
/smol-map        # one-time: build codemap of your project
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

## Philosophy

See `SPEC.md`. Short version: most agent frameworks are over-engineered for solo work. `smol` does only what a single developer actually needs, and stays out of the way otherwise.

## Layout it creates

```
.smol/
├── codemap.json
├── codemap.md
├── <subdir>/codemap.md
├── plans/YYYY-MM-DD-<topic>.md
└── wiki/{memory,preferences,pitfalls}.md
```

Add `.smol/` to `.gitignore` if you don't want to commit project memory; commit it if you do (recommended for shared codebases).

## Native tools

Agents prefer these over shell commands:

| Tool | Args | Purpose |
| --- | --- | --- |
| `smol_codemap` | `action: init \| update \| changes` | Maintain `.smol/codemap.json` and per-folder `codemap.md` |
| `smol_wiki` | `kind: memory \| preferences \| pitfalls`, `entry: string ≤200` | Append a dated entry, dedups |
| `smol_plan` | `topic: string`, `content: string` | Write `.smol/plans/YYYY-MM-DD-<slug>.md` |

## Development

```bash
npm install
npm test         # 28 tests across codemap + plugin hooks + tools
```
