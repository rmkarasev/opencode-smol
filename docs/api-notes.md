# opencode plugin API — research notes for smol

Source: `anomalyco/opencode` `packages/plugin/src/index.ts` (HEAD on default branch, fetched 2026-04-28).

## Plugin signature

```ts
import type { Plugin } from "@opencode-ai/plugin"

export const SmolPlugin: Plugin = async ({ project, client, $, directory, worktree, serverUrl }) => {
  return { /* hooks */ }
}
```

`PluginInput`:
- `client` — opencode SDK client
- `project` — project metadata
- `directory` — current working directory (project root for our purposes)
- `worktree` — git worktree root
- `serverUrl` — opencode server URL
- `$` — Bun shell

A plugin module returns a `Hooks` object. All hook fields are optional.

## System prompt injection

Hook used by smol:

```ts
"experimental.chat.system.transform"?: (
  input: { sessionID?: string; model: Model },
  output: { system: string[] },
) => Promise<void>
```

Behaviour: opencode calls this once when assembling the system prompt for a new model turn. Pushing onto `output.system` appends the string as an additional system block. Per-session, our wiki-bootstrap side effects run on every call but are idempotent (we only create files that don't exist).

## Skill / agent registration — NOT in plugin API

Inspected the `Hooks` interface in `packages/plugin/src/index.ts`. There is **no `skill` or `agent` hook field**. PR #9010 (plugin-bundled skills) was not merged into the public API at the time of writing.

Skills and agents must therefore be discovered from the filesystem:

| Kind  | Project location                  | User location                                |
|-------|-----------------------------------|----------------------------------------------|
| Skill | `.opencode/skills/<name>/SKILL.md`| `~/.config/opencode/skills/<name>/SKILL.md`  |
| Agent | `.opencode/agent/<name>.md`       | `~/.config/opencode/agent/<name>.md`         |

Note the directory inconsistency: skills are plural (`skills/`), agents are singular (`agent/`). Confirmed against `dev.opencode.ai/docs/skills/` and `dev.opencode.ai/docs/agents/`.

## Decision: Path C — `smol install` CLI

Postinstall is fragile (monorepos, global installs, CI). Instead:

1. Plugin package ships `agents/*.md` and `skills/<name>/SKILL.md` inside the npm tarball.
2. Plugin exposes a CLI subcommand: `npx smol install` (or `node node_modules/smol/tools/install.mjs`).
3. The command copies the bundled markdown files into the consumer project's `.opencode/agent/` and `.opencode/skills/`, **never overwriting** existing files (so user customisations survive `smol install` re-runs).
4. README documents this as a one-time step after `npm install -D smol`.
5. The plugin's `experimental.chat.system.transform` hook still takes care of `.smol/wiki/` bootstrap and prompt injection — those run automatically.

This keeps `plugin.ts` short and avoids the "where does the plugin live after npm install" path-resolution mess.

## Caching gotcha (record for the wiki later)

`Skill.state` is initialised once per opencode process and cached. Adding new skill files mid-session is invisible until a full opencode restart (not just `/new`). After `smol install`, instruct users to restart opencode.

## Version constraint

Hook surface confirmed against the current `dev` branch. Compatible with the `Plugin` type as exported from `@opencode-ai/plugin` for `anomalyco/opencode`. No specific minimum version recorded — pin `peerDependencies."@opencode-ai/plugin": "*"` in `package.json` until an explicit version contract is needed.
