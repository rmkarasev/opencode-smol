# smol — opencode plugin design spec

> **S**mall · **M**inimal · **O**ptimal · **L**ight
>
> A token-frugal, TDD-oriented opencode plugin for solo developers.

---

## 1. Problem & Philosophy

Mainstream agent frameworks (superpowers, gsd, gstack) are powerful but heavy: dense prompts, deep agent hierarchies, and aggressive context loading drain tokens fast. Solo developers rarely touch enterprise-scale codebases, so most of that weight is dead weight.

`smol` is the opposite bet: the smallest possible surface that still delivers five capabilities a serious solo developer actually needs:

1. **Brainstorm-driven planning** — staged questioning, then atomic task decomposition.
2. **TDD by default** — RED → GREEN minimal viable implementation.
3. **Quality & security review** — short, sharp diff review.
4. **Persistent codebase mental model** — so the agent never re-reads the whole repo.
5. **Persistent project memory** — pitfalls, conventions, and user preferences captured automatically as a wiki the agent keeps growing.

Hard constraints throughout: no over-engineering, no premature abstraction, no speculative features, English-only code comments, flat structure.

---

## 2. Target Platform

- **Runtime**: [`anomalyco/opencode`](https://github.com/anomalyco/opencode) (formerly `sst/opencode`).
- **Form**: TypeScript plugin package, distributed as `smol` on npm.
- **Activation**: Skills are auto-exposed as slash commands by opencode. No separate command registration needed.

---

## 3. Repository Layout

Flat by design. One folder per concept, no nesting beyond what opencode requires.

```
smol/
├── plugin.ts                 # opencode plugin entry; registers wiki hook & wires agents/skills
├── package.json
├── tsconfig.json
├── README.md
├── skills/
│   ├── smol-plan/SKILL.md
│   ├── smol-build/SKILL.md
│   ├── smol-review/SKILL.md
│   ├── smol-auto/SKILL.md
│   ├── smol-fast/SKILL.md
│   └── smol-map/SKILL.md
├── commands/
│   ├── smol-plan.md
│   ├── smol-build.md
│   ├── smol-review.md
│   ├── smol-auto.md
│   ├── smol-fast.md
│   └── smol-map.md
├── agents/
│   ├── scout.md
│   ├── planner.md
│   ├── conductor.md
│   ├── mapper.md
│   ├── reviewer.md
│   └── coder.md
└── tools/
    └── codemap.mjs           # Codemap CLI invoked by mapper agent
```

Output artifacts live under `<project>/.smol/` in the user's repository:

```
.smol/
├── codemap.json              # File/folder hashes for incremental mapping
├── codemap.md                # Root architectural summary
├── <subdir>/codemap.md       # Per-folder summary (mirrors source tree)
├── plans/
│   └── YYYY-MM-DD-<topic>.md # Plan documents
└── wiki/
    ├── pitfalls.md           # Gotchas, dead-ends, things that bit us
    ├── preferences.md        # User coding style and explicit preferences
    └── memory.md             # Project conventions, naming, recurring patterns
```

---

## 4. Skills (slash commands)

Each skill is a single `SKILL.md` with frontmatter (`name`, `description`) followed by the system-prompt instructions opencode injects when the skill is invoked.

| Skill           | Purpose                                                                               | Primary agent        |
| --------------- | ------------------------------------------------------------------------------------- | -------------------- |
| `/smol-plan`    | Two-phase brainstorm (form + follow-up), produce atomic task plan markdown            | `planner`            |
| `/smol-build`   | Execute one atomic task with strict TDD (RED → GREEN)                                 | `coder`              |
| `/smol-review`  | Review current git diff (staged + unstaged) for quality, minimalism, security         | `reviewer`           |
| `/smol-auto`    | Full pipeline non-stop: plan → build each task → review. Summary at end                | `conductor`          |
| `/smol-fast`    | Skip planning; coder applies TDD directly to a small described change                 | `coder`              |
| `/smol-map`     | Build or incrementally update the codemap                                             | `mapper`             |

`/smol-build` and `/smol-fast` differ only in whether a plan is consulted: `build` reads `.smol/plans/<latest>.md` and picks the next pending atomic task; `fast` takes a free-text description and goes straight to TDD.

---

## 5. Agents

Six agents, each with a tightly scoped responsibility. All agents read `.smol/codemap.md` first if it exists, to anchor context cheaply before any code reads.

### 5.1 Scout — external research
- Integrates `exa` MCP and `context7` MCP.
- Invoked **automatically** (via description matching) by `planner` and `coder` when external information is needed (latest API docs, library best practices, unfamiliar tech).
- Never invoked directly by the user. No dedicated slash command.

### 5.2 Planner — staged brainstorming & task atomization
- **Phase 1 — structured form**: a single `ask_user` form covering goal, constraints, success criteria, technical hints, scope boundaries.
- **Phase 2 — targeted follow-ups**: 1–3 single-question follow-ups for any ambiguities found in phase 1.
- Output: `.smol/plans/YYYY-MM-DD-<topic>.md` containing:
  - Problem statement (1–3 sentences)
  - Approach (recommended path + alternatives considered, terse)
  - **Atomic task list** — each task small enough to be a single TDD cycle
  - Risks / open questions

### 5.3 Conductor — primary agent & orchestrator
Inspired by [`oh-my-opencode`](https://github.com/code-yeongyu/oh-my-opencode)'s **Sisyphus**. Conductor is the **default `primary` agent** in opencode — it handles every conversation, not just `/smol-auto`.

**Operating principles:**
- Conductor **never writes code itself**. Its job is: understand the real intent → choose the right specialist → delegate → verify.
- For trivial single-file edits, Conductor may act directly to avoid overhead.
- For everything non-trivial, Conductor delegates to `planner`, `coder`, `reviewer`, `mapper`, or `scout`.
- Always reads `.smol/codemap.md` and `.smol/wiki/*.md` first to anchor context cheaply.

**Two operating modes:**
1. **Interactive (default)**: normal turn-by-turn conversation. Conductor delegates per turn, waits for user feedback between meaningful checkpoints.
2. **Auto (`/smol-auto`)**: full pipeline non-stop — `planner` → `coder` × N atomic tasks → `reviewer` → final summary. No mid-pipeline pauses.

The `mode: "primary"` registration ensures Conductor replaces opencode's default build agent.

### 5.4 Mapper — codebase relationship index
Adopts the [oh-my-opencode-slim codemap](https://github.com/alvinunreal/oh-my-opencode-slim/blob/master/docs/codemap.md) approach:
- LLM judgment selects relevant files per folder.
- Hashes tracked in `.smol/codemap.json`; only changed folders are re-summarized.
- Each folder gets a `codemap.md` describing: responsibility, key patterns, data/control flow, integration points.
- Multi-language by design — LLM reads source directly; no language-specific grammar required.
- Backed by `tools/codemap.mjs` (Node CLI) for the deterministic parts (file walk, hashing, change detection, template scaffolding).

### 5.5 Reviewer — quality & security gate
- Operates on `git diff` (staged + unstaged by default; can take a ref range).
- Checks: correctness, **minimalism violations** (unused abstractions, premature generalization, dead code), security (input validation, secret leakage, dependency risk), and English-only comment policy.
- Output: terse list of issues, each with file:line and a one-line fix suggestion. Will not modify code.

### 5.6 Coder — TDD implementation
- Strict cycle per atomic task:
  1. **RED** — write the failing test(s); run them; confirm failure with the right reason.
  2. **GREEN** — write the minimum implementation to pass; run tests; confirm pass.
  3. Stop. No refactor unless the task explicitly requests it.
- Auto-detects test framework from project files (vitest / jest / pytest / go test / etc.). If none detected, asks once.
- Honours minimalism: prefer native APIs, avoid new dependencies, keep code flat.

---

## 6. Session-Start Hook — minimal memory pointer

A single hook injects **one line** into the system prompt at session start, pointing the LLM at `.smol/`. Nothing more. The agent decides when (or whether) to read the actual files.

**Hook used**: `experimental.chat.system.transform` — fires once when the chat session is initialized. The injected text becomes part of the system prompt and persists for the session at zero per-turn cost.

**Injected line (verbatim):**

```
<smol>Check .smol/codemap.md and .smol/wiki/{memory,preferences,pitfalls}.md when relevant. Append new insights to wiki (append-only, dated, English, ≤200 chars per entry).</smol>
```

That's it. ~50 tokens. No verbose instructions, no rules list, no examples. The LLM is smart enough — we just point at the resources.

**Behaviour:**
- On first project use, hook auto-creates `.smol/wiki/{memory,preferences,pitfalls}.md` with a one-line header so the files exist when the agent looks.
- Wiki and codemap files are loaded into context **only** when the LLM explicitly reads them. Per-turn cost stays flat regardless of how large `.smol/` grows.
- Files are plain markdown — users edit by hand whenever they want.

---

## 7. Data Flow

```
/smol-plan ──► planner ──► .smol/plans/*.md
                  │
                  └─(needs research)──► scout ──► exa / context7

/smol-map  ──► mapper ──► tools/codemap.mjs ──► .smol/codemap.json
                                              └► .smol/**/codemap.md

/smol-build / /smol-fast ──► coder ──► RED ──► GREEN ──► (tests pass)
                              │
                              └─(needs research)──► scout

/smol-review ──► reviewer ──► git diff ──► issue list

/smol-auto ──► conductor ──► planner → coder × N → reviewer ──► summary
```

Every agent reads `.smol/codemap.md` and `.smol/wiki/*.md` first when they exist; this is the cheap context anchor that replaces re-scanning the repo and re-learning user preferences.

---

## 8. Error Handling

- **No `.smol/codemap.md`**: agents proceed without it; planner/coder will suggest running `/smol-map` once.
- **Test framework not detected**: coder asks once, persists the choice in `.smol/config.json`.
- **MCP missing (exa / context7)**: scout reports "research unavailable, proceeding from local context"; never blocks the pipeline.
- **Git not initialized**: reviewer reports clearly and exits; does not error the conductor.

---

## 9. Testing Strategy

- The plugin itself is tested with vitest.
- Unit tests for `tools/codemap.mjs`: file walk, hashing, change detection, template generation.
- Snapshot tests for skill markdown frontmatter (ensures opencode picks them up correctly).
- Smoke test: load the plugin in a sandbox opencode instance, verify all six slash commands appear.

---

## 10. Out of Scope (explicit YAGNI)

- No web UI, no HTML reports.
- No tree-sitter / AST graphs (codemap LLM summaries are sufficient).
- No multi-agent parallelism beyond what conductor sequences.
- No telemetry, no analytics.
- No cloud sync of `.smol/` artifacts — they are local, gitignorable per user preference.
- No custom MCP server bundling; users install `exa` / `context7` MCPs themselves.

---

## 11. Open Items (to revisit during planning)

- Exact frontmatter schema for opencode skills/agents on `anomalyco/opencode` — verify against current docs before implementation.
- Whether `.smol/` should be added to `.gitignore` automatically by `/smol-map`, or left to the user.
