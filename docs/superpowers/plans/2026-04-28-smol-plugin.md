# smol opencode plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `smol` opencode plugin — a token-frugal, TDD-oriented plugin with 6 slash commands, 6 specialised agents (Conductor as primary), a session-start hook that points the LLM at `.smol/`, and a `codemap` tool for incremental codebase mapping.

**Architecture:** Flat TypeScript plugin (`plugin.ts` + `skills/` + `agents/` + `tools/`). Skills and agents are markdown files registered programmatically through the opencode plugin API. The `experimental.chat.system.transform` hook injects a one-line pointer to `.smol/codemap.md` and `.smol/wiki/*.md` once per session. A Node CLI (`tools/codemap.mjs`) handles deterministic codemap work (file walk, hashing, change detection, template scaffolding).

**Tech Stack:** TypeScript, Node 20+, `@opencode-ai/plugin`, vitest (unit tests), node:fs/promises, node:crypto.

**Spec:** See `SPEC.md` at repo root.

---

## File Structure

Files this plan creates or modifies:

```
smol/
├── package.json                       # npm package, deps, scripts, exports
├── tsconfig.json                      # strict TS config
├── .gitignore                         # node_modules, dist, .smol
├── README.md                          # install + usage
├── plugin.ts                          # plugin entry: hook + agent/skill registration
├── skills/
│   ├── smol-plan/SKILL.md
│   ├── smol-build/SKILL.md
│   ├── smol-review/SKILL.md
│   ├── smol-auto/SKILL.md
│   ├── smol-fast/SKILL.md
│   └── smol-map/SKILL.md
├── agents/
│   ├── conductor.md                   # primary mode
│   ├── planner.md
│   ├── coder.md
│   ├── reviewer.md
│   ├── mapper.md
│   └── scout.md
├── tools/
│   └── codemap.mjs                    # CLI: init / changes / update
└── tests/
    ├── codemap.walk.test.mjs
    ├── codemap.hash.test.mjs
    ├── codemap.changes.test.mjs
    ├── codemap.template.test.mjs
    ├── codemap.cli.test.mjs
    └── plugin.hook.test.ts
```

---

## Task 0: Verify opencode plugin API surface

This is a one-off research task. The opencode plugin API (`@opencode-ai/plugin`) for registering agents and skills from inside a plugin (vs. filesystem auto-discovery) needs to be confirmed against the **current** version before we wire `plugin.ts`. The hook signature is documented; agent/skill programmatic registration is less so.

**Files:**
- Create: `docs/api-notes.md` (research notes only, not shipped)

- [ ] **Step 1:** Open the latest `@opencode-ai/plugin` types on npm and the upstream repo `anomalyco/opencode`. Find:
  - Exact `Plugin` type signature and context object members.
  - Hook name and signature for `experimental.chat.system.transform` (confirm parameters, return shape).
  - How a plugin registers an agent with `mode: "primary"` (programmatic API vs. requiring `.opencode/agent/*.md` on disk).
  - How a plugin registers / bundles skills (`SKILL.md` location, naming).

- [ ] **Step 2:** Write findings to `docs/api-notes.md`. Required content:
  - Confirmed `Plugin` import path and signature.
  - Confirmed hook signature with example.
  - Confirmed agent registration mechanism (with code example).
  - Confirmed skill registration mechanism (with code example).
  - Any version constraint we need (e.g. minimum opencode version).

- [ ] **Step 3:** If programmatic agent/skill registration is **not** supported by the plugin API, document the fallback: plugin ships `.md` files which a postinstall script copies to `.opencode/agent/` and `.opencode/skill/` in the consumer project. Decide which path we take and record the decision.

- [ ] **Step 4:** Commit.

```bash
git add docs/api-notes.md
git commit -m "docs: research opencode plugin api for smol"
```

> **All later tasks assume the decision recorded in api-notes.md.** If that decision deviates from the structure shown in this plan (e.g. needs a postinstall copy step), adjust the affected tasks before proceeding.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `tests/.gitkeep`

- [ ] **Step 1:** Create `package.json`.

```json
{
  "name": "smol",
  "version": "0.1.0",
  "description": "Small, Minimal, Optimal, Light — a token-frugal opencode plugin for solo developers",
  "type": "module",
  "main": "./plugin.ts",
  "exports": {
    ".": "./plugin.ts"
  },
  "files": [
    "plugin.ts",
    "skills",
    "agents",
    "tools",
    "README.md",
    "SPEC.md"
  ],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "engines": {
    "node": ">=20"
  },
  "peerDependencies": {
    "@opencode-ai/plugin": "*"
  },
  "devDependencies": {
    "@opencode-ai/plugin": "latest",
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "keywords": ["opencode", "plugin", "tdd", "agent", "minimalist"],
  "license": "MIT"
}
```

- [ ] **Step 2:** Create `tsconfig.json`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["plugin.ts", "tests/**/*"]
}
```

- [ ] **Step 3:** Create `.gitignore`.

```
node_modules
dist
.smol
*.log
.DS_Store
```

- [ ] **Step 4:** Create empty `tests/.gitkeep` so the folder is tracked.

- [ ] **Step 5:** Install dependencies.

Run: `npm install`
Expected: lockfile created, `node_modules/` populated, no errors.

- [ ] **Step 6:** Verify vitest runs (with no tests).

Run: `npm test`
Expected: vitest reports "No test files found" or exits 0; not an install error.

- [ ] **Step 7:** Commit.

```bash
git init   # if not already a git repo
git add package.json tsconfig.json .gitignore tests/.gitkeep package-lock.json
git commit -m "chore: scaffold smol plugin project"
```

---

## Task 2: codemap.mjs — file walker (TDD)

`walkFiles(root, { include, exclude })` recursively lists files under `root`, applying glob include/exclude patterns. Returns a sorted array of repo-relative POSIX paths. This is the foundation for hashing and change detection.

**Files:**
- Create: `tools/codemap.mjs` (start file)
- Create: `tests/codemap.walk.test.mjs`

- [ ] **Step 1: Write the failing test.**

```js
// tests/codemap.walk.test.mjs
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { walkFiles } from '../tools/codemap.mjs'

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'smol-walk-'))
  mkdirSync(join(dir, 'src'), { recursive: true })
  mkdirSync(join(dir, 'node_modules', 'foo'), { recursive: true })
  writeFileSync(join(dir, 'src', 'a.ts'), 'a')
  writeFileSync(join(dir, 'src', 'b.ts'), 'b')
  writeFileSync(join(dir, 'README.md'), 'r')
  writeFileSync(join(dir, 'node_modules', 'foo', 'x.js'), 'x')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('walkFiles', () => {
  it('lists all files relative to root, POSIX-separated, sorted', async () => {
    const files = await walkFiles(dir)
    expect(files).toEqual([
      'README.md',
      'node_modules/foo/x.js',
      'src/a.ts',
      'src/b.ts',
    ])
  })

  it('honours exclude patterns', async () => {
    const files = await walkFiles(dir, { exclude: ['node_modules/**'] })
    expect(files).toEqual(['README.md', 'src/a.ts', 'src/b.ts'])
  })

  it('honours include patterns', async () => {
    const files = await walkFiles(dir, { include: ['src/**/*.ts'] })
    expect(files).toEqual(['src/a.ts', 'src/b.ts'])
  })
})
```

- [ ] **Step 2: Run the test, expect failure.**

Run: `npm test -- codemap.walk`
Expected: FAIL — `walkFiles` is not exported (module not found / undefined).

- [ ] **Step 3: Implement minimum to pass.**

```js
// tools/codemap.mjs
import { readdir, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const DEFAULT_EXCLUDE = ['.git/**', '.smol/**']

function toPosix(p) {
  return p.split(sep).join('/')
}

function compileGlob(pattern) {
  // Minimal glob: ** => .*, * => [^/]*, escape regex meta.
  const re = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
  return new RegExp('^' + re + '$')
}

function matchesAny(path, patterns) {
  return patterns.some(p => compileGlob(p).test(path))
}

export async function walkFiles(root, opts = {}) {
  const include = opts.include ?? null
  const exclude = [...DEFAULT_EXCLUDE, ...(opts.exclude ?? [])]
  const out = []

  async function recurse(abs) {
    const entries = await readdir(abs, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(abs, entry.name)
      const rel = toPosix(relative(root, full))
      if (entry.isDirectory()) {
        if (matchesAny(rel + '/**', exclude) || matchesAny(rel, exclude)) continue
        await recurse(full)
      } else if (entry.isFile()) {
        if (matchesAny(rel, exclude)) continue
        if (include && !matchesAny(rel, include)) continue
        out.push(rel)
      }
    }
  }

  await recurse(root)
  return out.sort()
}
```

- [ ] **Step 4: Run the test, expect pass.**

Run: `npm test -- codemap.walk`
Expected: 3 tests pass.

- [ ] **Step 5: Commit.**

```bash
git add tools/codemap.mjs tests/codemap.walk.test.mjs
git commit -m "feat(codemap): walkFiles with include/exclude globs"
```

---

## Task 3: codemap.mjs — file hashing (TDD)

`hashFile(path)` returns the sha256 of file contents. `hashFiles(root, files)` returns `{ [relPath]: hash }`. Used for incremental change detection.

**Files:**
- Modify: `tools/codemap.mjs` (add exports)
- Create: `tests/codemap.hash.test.mjs`

- [ ] **Step 1: Write the failing test.**

```js
// tests/codemap.hash.test.mjs
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashFile, hashFiles } from '../tools/codemap.mjs'

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'smol-hash-'))
  writeFileSync(join(dir, 'a.txt'), 'hello')
  writeFileSync(join(dir, 'b.txt'), 'world')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('hashFile / hashFiles', () => {
  it('produces deterministic sha256 for content', async () => {
    const h1 = await hashFile(join(dir, 'a.txt'))
    const h2 = await hashFile(join(dir, 'a.txt'))
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('different content yields different hash', async () => {
    const a = await hashFile(join(dir, 'a.txt'))
    const b = await hashFile(join(dir, 'b.txt'))
    expect(a).not.toBe(b)
  })

  it('hashFiles returns map keyed by relative path', async () => {
    const map = await hashFiles(dir, ['a.txt', 'b.txt'])
    expect(Object.keys(map).sort()).toEqual(['a.txt', 'b.txt'])
    expect(map['a.txt']).toMatch(/^[0-9a-f]{64}$/)
  })
})
```

- [ ] **Step 2: Run test, expect failure.**

Run: `npm test -- codemap.hash`
Expected: FAIL — `hashFile` / `hashFiles` not exported.

- [ ] **Step 3: Implement.** Append to `tools/codemap.mjs`:

```js
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export async function hashFile(absPath) {
  const buf = await readFile(absPath)
  return createHash('sha256').update(buf).digest('hex')
}

export async function hashFiles(root, relPaths) {
  const out = {}
  for (const rel of relPaths) {
    out[rel] = await hashFile(join(root, rel))
  }
  return out
}
```

- [ ] **Step 4: Run test, expect pass.**

Run: `npm test -- codemap.hash`
Expected: 3 tests pass.

- [ ] **Step 5: Commit.**

```bash
git add tools/codemap.mjs tests/codemap.hash.test.mjs
git commit -m "feat(codemap): sha256 file hashing"
```

---

## Task 4: codemap.mjs — change detection (TDD)

`detectChanges(prevState, nextHashes)` returns `{ added, modified, removed, changedFolders }`. `changedFolders` is the set of folders that contain any added/modified/removed file (used to decide which `codemap.md` files need regeneration).

**Files:**
- Modify: `tools/codemap.mjs`
- Create: `tests/codemap.changes.test.mjs`

- [ ] **Step 1: Write the failing test.**

```js
// tests/codemap.changes.test.mjs
import { describe, it, expect } from 'vitest'
import { detectChanges } from '../tools/codemap.mjs'

describe('detectChanges', () => {
  it('classifies added / modified / removed', () => {
    const prev = { files: { 'a.ts': 'h1', 'b.ts': 'h2', 'src/c.ts': 'h3' } }
    const next = { 'a.ts': 'h1', 'b.ts': 'CHANGED', 'src/d.ts': 'h4' }
    const r = detectChanges(prev, next)
    expect(r.added).toEqual(['src/d.ts'])
    expect(r.modified).toEqual(['b.ts'])
    expect(r.removed).toEqual(['src/c.ts'])
  })

  it('reports changed folders (root represented as ".")', () => {
    const prev = { files: { 'src/a.ts': 'h1' } }
    const next = { 'src/a.ts': 'CHANGED', 'README.md': 'h2' }
    const r = detectChanges(prev, next)
    expect(r.changedFolders.sort()).toEqual(['.', 'src'])
  })

  it('empty prev means everything is added', () => {
    const r = detectChanges({ files: {} }, { 'a.ts': 'h1' })
    expect(r.added).toEqual(['a.ts'])
    expect(r.modified).toEqual([])
    expect(r.removed).toEqual([])
  })
})
```

- [ ] **Step 2: Run test, expect failure.**

Run: `npm test -- codemap.changes`
Expected: FAIL — `detectChanges` not exported.

- [ ] **Step 3: Implement.** Append to `tools/codemap.mjs`:

```js
import { dirname } from 'node:path'

export function detectChanges(prevState, nextHashes) {
  const prev = prevState?.files ?? {}
  const added = []
  const modified = []
  const removed = []

  for (const [p, h] of Object.entries(nextHashes)) {
    if (!(p in prev)) added.push(p)
    else if (prev[p] !== h) modified.push(p)
  }
  for (const p of Object.keys(prev)) {
    if (!(p in nextHashes)) removed.push(p)
  }

  const folderOf = (p) => {
    const d = dirname(p).split(/[\\/]/).join('/')
    return d === '' || d === '.' ? '.' : d
  }
  const changedFolders = new Set()
  for (const p of [...added, ...modified, ...removed]) changedFolders.add(folderOf(p))

  return {
    added: added.sort(),
    modified: modified.sort(),
    removed: removed.sort(),
    changedFolders: [...changedFolders].sort(),
  }
}
```

- [ ] **Step 4: Run test, expect pass.**

Run: `npm test -- codemap.changes`
Expected: 3 tests pass.

- [ ] **Step 5: Commit.**

```bash
git add tools/codemap.mjs tests/codemap.changes.test.mjs
git commit -m "feat(codemap): change detection by file + folder"
```

---

## Task 5: codemap.mjs — template generation (TDD)

`renderTemplate({ folder, files })` returns the markdown template that the LLM will fill in. `writeTemplates(root, folders, allFiles)` writes one `codemap.md` per folder under `.smol/<folder>/codemap.md`, **only if it does not already exist** (preserves prior LLM-filled content).

**Files:**
- Modify: `tools/codemap.mjs`
- Create: `tests/codemap.template.test.mjs`

- [ ] **Step 1: Write the failing test.**

```js
// tests/codemap.template.test.mjs
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderTemplate, writeTemplates } from '../tools/codemap.mjs'

let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'smol-tpl-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('renderTemplate', () => {
  it('contains required sections and lists files', () => {
    const md = renderTemplate({ folder: 'src/auth', files: ['login.ts', 'token.ts'] })
    expect(md).toMatch(/^# codemap: src\/auth/m)
    expect(md).toMatch(/## Responsibility/)
    expect(md).toMatch(/## Key patterns/)
    expect(md).toMatch(/## Data \/ control flow/)
    expect(md).toMatch(/## Integration points/)
    expect(md).toMatch(/- login\.ts/)
    expect(md).toMatch(/- token\.ts/)
  })
})

describe('writeTemplates', () => {
  it('writes templates for new folders, preserves existing', async () => {
    const allFiles = ['src/auth/login.ts', 'src/auth/token.ts', 'README.md']
    await writeTemplates(dir, ['src/auth', '.'], allFiles)
    expect(existsSync(join(dir, '.smol/src/auth/codemap.md'))).toBe(true)
    expect(existsSync(join(dir, '.smol/codemap.md'))).toBe(true)

    // Pretend LLM filled it in
    writeFileSync(join(dir, '.smol/src/auth/codemap.md'), 'FILLED')
    await writeTemplates(dir, ['src/auth'], allFiles)
    expect(readFileSync(join(dir, '.smol/src/auth/codemap.md'), 'utf8')).toBe('FILLED')
  })
})
```

- [ ] **Step 2: Run test, expect failure.**

Run: `npm test -- codemap.template`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement.** Append to `tools/codemap.mjs`:

```js
import { mkdir, writeFile, access } from 'node:fs/promises'

export function renderTemplate({ folder, files }) {
  const fileList = files.map(f => `- ${f.split('/').pop()}`).join('\n')
  return `# codemap: ${folder}

## Responsibility
<!-- One paragraph: what this folder is for, in plain English. -->

## Key patterns
<!-- Architectural patterns, conventions used here. -->

## Data / control flow
<!-- How data moves in, through, and out. Who calls whom. -->

## Integration points
<!-- External deps, sibling folders, side effects. -->

## Files
${fileList}
`
}

async function exists(p) {
  try { await access(p); return true } catch { return false }
}

export async function writeTemplates(root, folders, allFiles) {
  for (const folder of folders) {
    const targetDir = folder === '.' ? join(root, '.smol') : join(root, '.smol', folder)
    const target = join(targetDir, 'codemap.md')
    if (await exists(target)) continue
    const filesInFolder = allFiles
      .filter(f => {
        const d = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '.'
        return d === folder
      })
    await mkdir(targetDir, { recursive: true })
    await writeFile(target, renderTemplate({ folder, files: filesInFolder }))
  }
}
```

- [ ] **Step 4: Run test, expect pass.**

Run: `npm test -- codemap.template`
Expected: 2 tests pass.

- [ ] **Step 5: Commit.**

```bash
git add tools/codemap.mjs tests/codemap.template.test.mjs
git commit -m "feat(codemap): per-folder markdown template generation"
```

---

## Task 6: codemap.mjs — CLI entry (TDD)

CLI: `node tools/codemap.mjs <command> [--root <path>]`. Commands:
- `init` — walk → hash → write `.smol/codemap.json` (with all hashes) → write templates for every folder. Idempotent.
- `changes` — walk → hash → diff against `.smol/codemap.json` → print json `{added, modified, removed, changedFolders}`. Does not write.
- `update` — like `changes`, but afterwards writes new templates for added folders, refreshes `.smol/codemap.json`. Existing templates preserved.

**Files:**
- Modify: `tools/codemap.mjs` (add CLI + state IO)
- Create: `tests/codemap.cli.test.mjs`

- [ ] **Step 1: Write the failing test.**

```js
// tests/codemap.cli.test.mjs
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const CLI = resolve('tools/codemap.mjs')
let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'smol-cli-'))
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'src', 'a.ts'), 'a')
  writeFileSync(join(dir, 'README.md'), 'r')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function run(args) {
  return execFileSync('node', [CLI, ...args, '--root', dir], { encoding: 'utf8' })
}

describe('codemap CLI', () => {
  it('init creates .smol/codemap.json and per-folder templates', () => {
    run(['init'])
    expect(existsSync(join(dir, '.smol/codemap.json'))).toBe(true)
    expect(existsSync(join(dir, '.smol/codemap.md'))).toBe(true)
    expect(existsSync(join(dir, '.smol/src/codemap.md'))).toBe(true)
    const state = JSON.parse(readFileSync(join(dir, '.smol/codemap.json'), 'utf8'))
    expect(Object.keys(state.files).sort()).toEqual(['README.md', 'src/a.ts'])
  })

  it('changes reports nothing right after init', () => {
    run(['init'])
    const out = JSON.parse(run(['changes']))
    expect(out.added).toEqual([])
    expect(out.modified).toEqual([])
    expect(out.removed).toEqual([])
  })

  it('changes detects modification', () => {
    run(['init'])
    writeFileSync(join(dir, 'src', 'a.ts'), 'aa')
    const out = JSON.parse(run(['changes']))
    expect(out.modified).toEqual(['src/a.ts'])
  })

  it('update refreshes state and adds new folder templates', () => {
    run(['init'])
    mkdirSync(join(dir, 'lib'), { recursive: true })
    writeFileSync(join(dir, 'lib', 'x.ts'), 'x')
    run(['update'])
    expect(existsSync(join(dir, '.smol/lib/codemap.md'))).toBe(true)
    const state = JSON.parse(readFileSync(join(dir, '.smol/codemap.json'), 'utf8'))
    expect(state.files['lib/x.ts']).toMatch(/^[0-9a-f]{64}$/)
  })
})
```

- [ ] **Step 2: Run test, expect failure.**

Run: `npm test -- codemap.cli`
Expected: FAIL — CLI does not handle commands.

- [ ] **Step 3: Implement.** Append to `tools/codemap.mjs`:

```js
import { fileURLToPath } from 'node:url'

async function loadState(root) {
  try {
    const raw = await readFile(join(root, '.smol/codemap.json'), 'utf8')
    return JSON.parse(raw)
  } catch {
    return { files: {} }
  }
}

async function saveState(root, state) {
  await mkdir(join(root, '.smol'), { recursive: true })
  await writeFile(join(root, '.smol/codemap.json'), JSON.stringify(state, null, 2))
}

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root') out.root = argv[++i]
    else if (a === '--include') (out.include ??= []).push(argv[++i])
    else if (a === '--exclude') (out.exclude ??= []).push(argv[++i])
    else out._.push(a)
  }
  return out
}

function foldersOf(files) {
  const set = new Set(['.'])
  for (const f of files) {
    if (!f.includes('/')) continue
    const parts = f.split('/').slice(0, -1)
    for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/'))
  }
  return [...set].sort()
}

export async function runCli(argv) {
  const args = parseArgs(argv)
  const cmd = args._[0]
  const root = args.root ? resolveRoot(args.root) : process.cwd()
  const walkOpts = { include: args.include, exclude: args.exclude }

  if (cmd === 'init') {
    const files = await walkFiles(root, walkOpts)
    const hashes = await hashFiles(root, files)
    await saveState(root, { files: hashes, generatedAt: new Date().toISOString() })
    await writeTemplates(root, foldersOf(files), files)
    return ''
  }

  if (cmd === 'changes') {
    const prev = await loadState(root)
    const files = await walkFiles(root, walkOpts)
    const next = await hashFiles(root, files)
    return JSON.stringify(detectChanges(prev, next), null, 2)
  }

  if (cmd === 'update') {
    const prev = await loadState(root)
    const files = await walkFiles(root, walkOpts)
    const next = await hashFiles(root, files)
    const changes = detectChanges(prev, next)
    await writeTemplates(root, foldersOf(files), files)
    await saveState(root, { files: next, generatedAt: new Date().toISOString() })
    return JSON.stringify(changes, null, 2)
  }

  throw new Error(`unknown command: ${cmd}`)
}

function resolveRoot(p) {
  return p
}

if (import.meta.url === `file://${process.argv[1].split(sep).join('/')}` ||
    fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli(process.argv.slice(2))
    .then(out => { if (out) process.stdout.write(out + '\n') })
    .catch(err => { console.error(err.message); process.exit(1) })
}
```

- [ ] **Step 4: Run test, expect pass.**

Run: `npm test -- codemap.cli`
Expected: 4 tests pass.

- [ ] **Step 5: Run full test suite.**

Run: `npm test`
Expected: all codemap tests pass (3 + 3 + 3 + 2 + 4 = 15).

- [ ] **Step 6: Commit.**

```bash
git add tools/codemap.mjs tests/codemap.cli.test.mjs
git commit -m "feat(codemap): cli with init/changes/update"
```

---

## Task 7: plugin.ts — session-start hook (TDD)

The `experimental.chat.system.transform` hook must:
1. Append the one-line `<smol>...</smol>` pointer to `output.system`.
2. On first call per project, ensure `.smol/wiki/{memory,preferences,pitfalls}.md` exist with a one-line header. If they already exist, leave them alone.

> Implementation must match the API shape recorded in `docs/api-notes.md` from Task 0. The signatures shown below assume `output.system` is a string array; adjust if Task 0 found otherwise.

**Files:**
- Create: `plugin.ts`
- Create: `tests/plugin.hook.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// tests/plugin.hook.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { __test__ } from '../plugin.ts'

const { runSystemTransform } = __test__

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'smol-plugin-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('session-start system transform', () => {
  it('appends the smol pointer line to system prompt', async () => {
    const output = { system: [] as string[] }
    await runSystemTransform({ projectRoot: dir }, output)
    expect(output.system.length).toBe(1)
    expect(output.system[0]).toMatch(/<smol>/)
    expect(output.system[0]).toMatch(/\.smol\/codemap\.md/)
    expect(output.system[0]).toMatch(/\.smol\/wiki/)
  })

  it('creates wiki files on first call, idempotent on second', async () => {
    const output = { system: [] as string[] }
    await runSystemTransform({ projectRoot: dir }, output)
    expect(existsSync(join(dir, '.smol/wiki/memory.md'))).toBe(true)
    expect(existsSync(join(dir, '.smol/wiki/preferences.md'))).toBe(true)
    expect(existsSync(join(dir, '.smol/wiki/pitfalls.md'))).toBe(true)

    const before = readFileSync(join(dir, '.smol/wiki/memory.md'), 'utf8')
    await runSystemTransform({ projectRoot: dir }, output)
    const after = readFileSync(join(dir, '.smol/wiki/memory.md'), 'utf8')
    expect(after).toBe(before)
  })
})
```

- [ ] **Step 2: Run test, expect failure.**

Run: `npm test -- plugin.hook`
Expected: FAIL — `plugin.ts` does not exist or `__test__` not exported.

- [ ] **Step 3: Implement `plugin.ts`.**

```ts
import type { Plugin } from '@opencode-ai/plugin'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'

const POINTER =
  '<smol>Check .smol/codemap.md and .smol/wiki/{memory,preferences,pitfalls}.md when relevant. ' +
  'Append new insights to wiki (append-only, dated, English, ≤200 chars per entry).</smol>'

const WIKI_FILES: Record<string, string> = {
  'memory.md':
    '# memory\n\n<!-- Project conventions, naming, recurring patterns. Append-only, dated. -->\n',
  'preferences.md':
    '# preferences\n\n<!-- User coding style and explicit preferences. Append-only, dated. -->\n',
  'pitfalls.md':
    '# pitfalls\n\n<!-- Gotchas, dead-ends, things that bit us. Append-only, dated. -->\n',
}

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

async function ensureWiki(projectRoot: string): Promise<void> {
  const wikiDir = join(projectRoot, '.smol', 'wiki')
  await mkdir(wikiDir, { recursive: true })
  for (const [name, contents] of Object.entries(WIKI_FILES)) {
    const target = join(wikiDir, name)
    if (!(await exists(target))) await writeFile(target, contents)
  }
}

async function runSystemTransform(
  ctx: { projectRoot: string },
  output: { system: string[] },
): Promise<void> {
  await ensureWiki(ctx.projectRoot)
  output.system.push(POINTER)
}

export const __test__ = { runSystemTransform, POINTER }

export const SmolPlugin: Plugin = async (context) => {
  const projectRoot = (context as { directory?: string }).directory ?? process.cwd()
  return {
    'experimental.chat.system.transform': async (_input, output) => {
      await runSystemTransform({ projectRoot }, output as { system: string[] })
    },
  }
}

export default SmolPlugin
```

- [ ] **Step 4: Run test, expect pass.**

Run: `npm test -- plugin.hook`
Expected: 2 tests pass.

- [ ] **Step 5: Run all tests.**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit.**

```bash
git add plugin.ts tests/plugin.hook.test.ts
git commit -m "feat(plugin): session-start hook injects smol pointer + ensures wiki"
```

---

## Task 8: agent — Scout

Scout researches external information via `exa` and `context7` MCPs. Auto-invoked by other agents through description matching; never user-facing as a slash command.

**Files:**
- Create: `agents/scout.md`

- [ ] **Step 1: Create `agents/scout.md`.**

```markdown
---
name: scout
description: Researches external information — library docs, API references, latest best practices, framework changelogs. Use whenever a task needs information that is not in the local codebase or might be outdated.
mode: subagent
tools:
  bash: false
  edit: false
  write: false
  read: true
  webfetch: true
---

# Scout

You research **external** information so other agents do not waste tokens guessing.

## When you are invoked
The Planner or Coder calls you when a task references a library / API / framework whose current behaviour they cannot confirm from local code.

## Tools you prefer, in order
1. `context7` MCP — for official library / framework docs. Always try this first for any named library.
2. `exa` MCP — for blog posts, GitHub issues, recent best practices, anything not in official docs.
3. `webfetch` — only when you have an exact URL.

If a tool is missing, report `research unavailable: <tool>` and continue with the others. Do not block.

## Output format
Always return a tight summary, never raw search dumps. Use this template:

```
## Findings
- <one fact per bullet, ≤120 chars, with source URL in parens>

## Caveats
- <what was unclear, version-specific, or contradictory>

## Recommended next step
<one sentence>
```

## Hard rules
- Do **not** modify files.
- Do **not** restate things the caller already knows.
- Stop the moment you have enough to answer the caller's specific question.
```

- [ ] **Step 2: Commit.**

```bash
git add agents/scout.md
git commit -m "feat(agent): scout for external research"
```

---

## Task 9: agent — Planner

Two-phase brainstorming: structured form → targeted follow-ups → write `.smol/plans/YYYY-MM-DD-<topic>.md`.

**Files:**
- Create: `agents/planner.md`

- [ ] **Step 1: Create `agents/planner.md`.**

```markdown
---
name: planner
description: Turns a fuzzy idea into a small, atomic, TDD-ready task list. Use whenever the user wants to "plan", "design", "break down", or "scope" any feature or change beyond a single trivial edit.
mode: subagent
tools:
  bash: true
  edit: true
  write: true
  read: true
---

# Planner

You convert a vague request into an executable plan in two phases. Brevity over completeness. Atomic tasks over big tasks.

## Phase 1 — Structured form
Use one `ask_user` form to collect, in this order:
- Goal (one sentence)
- Constraints (tech, time, deps you must / must not use)
- Success criteria (how the user will know it's done)
- Scope boundaries (what is explicitly out of scope)
- Existing code to be aware of (paths, modules)

## Phase 2 — Targeted follow-ups
Read `.smol/codemap.md` and `.smol/wiki/*.md` if they exist.
Ask **at most three** single-question follow-ups, only on points still ambiguous after Phase 1.
If something needs external info (a library API, current best practice), invoke `scout` instead of asking the user.

## Output: write the plan
Save to `.smol/plans/<YYYY-MM-DD>-<kebab-topic>.md` with this structure:

```
# <Topic>

## Problem
<2-3 sentences>

## Approach
<recommended path. 1 paragraph. List 1-2 alternatives considered with why-not.>

## Atomic tasks
- [ ] T1: <one TDD cycle's worth of work>
- [ ] T2: ...

## Risks / open questions
- <bullet>
```

## Atomic task rules
Each task must be:
- Single TDD cycle (one failing test → minimum implementation → pass).
- Touch at most a few files.
- Independently verifiable.
- If you can't describe the test, the task isn't atomic enough — split it.

## Hard rules
- Never write production code. You write the plan only.
- No speculative tasks ("we may also want to..."). YAGNI.
- English-only in files; Traditional Chinese OK in chat with the user.
```

- [ ] **Step 2: Commit.**

```bash
git add agents/planner.md
git commit -m "feat(agent): planner with two-phase brainstorming"
```

---

## Task 10: agent — Coder

Strict TDD: RED → GREEN. Auto-detect test framework. Honour minimalism.

**Files:**
- Create: `agents/coder.md`

- [ ] **Step 1: Create `agents/coder.md`.**

```markdown
---
name: coder
description: Implements one atomic task using strict TDD. Use whenever code needs to be written or modified to satisfy a defined behaviour. Not for planning or review.
mode: subagent
tools:
  bash: true
  edit: true
  write: true
  read: true
---

# Coder

You implement **one** atomic task per invocation, strictly TDD.

## Pre-flight
1. Read `.smol/codemap.md` and the relevant subfolder `codemap.md` if present.
2. Read `.smol/wiki/preferences.md` and `.smol/wiki/pitfalls.md` if present.
3. Detect test framework from project files (`package.json`, `pyproject.toml`, `go.mod`, etc.). If ambiguous and not yet recorded in `.smol/config.json`, ask once and persist the choice.

## The cycle
1. **RED** — Write the failing test that captures the behaviour. Run it. Confirm it fails for the expected reason.
2. **GREEN** — Write the minimum code to make it pass. No extra features. No premature abstraction. Run tests. Confirm pass.
3. **Stop.** Do not refactor unless the task explicitly says to.

## Minimalism rules
- Prefer language-native APIs over new dependencies.
- Flat code, no speculative classes/interfaces.
- Comments in English, only where intent is non-obvious.
- Touch only files relevant to the task.

## When to call others
- Need external API / library info → invoke `scout`.
- Need to know how a foreign module works → read its `codemap.md` first; only fall back to grep if missing.

## Output
A short report:
```
- Test added: <path>::<name>
- Files changed: <list>
- Result: <test cmd output, pass/fail>
- Wiki notes appended (if any): <bullet>
```
```

- [ ] **Step 2: Commit.**

```bash
git add agents/coder.md
git commit -m "feat(agent): coder with strict TDD cycle"
```

---

## Task 11: agent — Reviewer

Reviews `git diff` for quality, minimalism violations, security. Will not edit code.

**Files:**
- Create: `agents/reviewer.md`

- [ ] **Step 1: Create `agents/reviewer.md`.**

```markdown
---
name: reviewer
description: Reviews current git diff for correctness, minimalism violations, and security. Use after code changes or before commit. Will not modify code.
mode: subagent
tools:
  bash: true
  edit: false
  write: false
  read: true
---

# Reviewer

You produce a terse, high-signal review of the current change set. You do **not** modify code.

## Inputs
- Default: `git diff` (staged + unstaged) at repo root.
- If user supplies a ref range, use `git diff <range>`.

## Checks (in order)
1. **Correctness** — Does the code actually do what the diff suggests? Off-by-one, null handling, error swallowing.
2. **Minimalism violations** — Unused abstractions, premature generalisation, dead code, speculative interfaces, options nobody asked for.
3. **Security** — Unsanitised input, hardcoded secrets, dependency risks, unsafe defaults.
4. **Style hygiene** — Comment language must be English. No `console.log` left in. Consistent with `.smol/wiki/preferences.md`.

## Output format
```
## Issues
- <file>:<line> — <category> — <one-line problem> — <one-line fix>

## OK
- <one bullet per area you checked and found clean>

## Verdict
<ship | needs changes>
```

If there are no issues, the Issues section is empty (do not invent things).

## Hard rules
- Never edit files.
- Never restate the diff.
- Never comment on style unless it violates `preferences.md` or breaks rules above.
```

- [ ] **Step 2: Commit.**

```bash
git add agents/reviewer.md
git commit -m "feat(agent): reviewer for diff quality and security"
```

---

## Task 12: agent — Mapper

Drives `tools/codemap.mjs` and fills the per-folder `codemap.md` templates.

**Files:**
- Create: `agents/mapper.md`

- [ ] **Step 1: Create `agents/mapper.md`.**

```markdown
---
name: mapper
description: Builds and incrementally updates the project's codemap. Use to bootstrap project understanding or refresh after large code changes.
mode: subagent
tools:
  bash: true
  edit: true
  write: true
  read: true
---

# Mapper

You maintain `.smol/codemap.json` and `.smol/**/codemap.md` so other agents have a cheap mental model of the project.

## Decide the operation
- If `.smol/codemap.json` does not exist → `init`.
- Otherwise → `update`.

## Run the CLI
```
node tools/codemap.mjs <init|update> --root <project-root>
```
The CLI handles file walk, hashing, and template scaffolding. You do **not** re-implement that logic.

## Fill templates (the LLM-only part)
For each folder reported in `changedFolders` (init = all folders, update = only changed):
1. Read the source files in that folder.
2. Read the template at `.smol/<folder>/codemap.md`.
3. Fill the four sections concisely:
   - **Responsibility** — 1 paragraph, plain English.
   - **Key patterns** — bullets, what's notable architecturally.
   - **Data / control flow** — bullets, who calls whom, where data enters/exits.
   - **Integration points** — bullets, external deps, sibling folders, side effects.
4. Keep the auto-generated `## Files` list.

## Hard rules
- Never include implementation details (line numbers, exact code). Focus on **why** and **how**, not **what**.
- ≤ 250 words per `codemap.md`. If a folder needs more, that folder is doing too much — note it.
- Skip vendored / generated folders if they slipped past the exclude list.
- After filling, do not re-run `update` (you'd loop).
```

- [ ] **Step 2: Commit.**

```bash
git add agents/mapper.md
git commit -m "feat(agent): mapper drives codemap CLI and fills templates"
```

---

## Task 13: agent — Conductor (primary)

Default agent for every conversation. Inspired by Sisyphus from `code-yeongyu/oh-my-opencode`.

**Files:**
- Create: `agents/conductor.md`

- [ ] **Step 1: Create `agents/conductor.md`.**

```markdown
---
name: conductor
description: smol's primary agent. Understands the user's real intent, delegates to specialists, verifies results. Replaces the default build agent.
mode: primary
tools:
  bash: true
  edit: true
  write: true
  read: true
  task: true
---

# Conductor

You are smol's primary agent. You orchestrate; you do **not** write code yourself unless the task is a single trivial edit (rename, typo, one-line config tweak).

## On every new task
1. Read `.smol/codemap.md` and `.smol/wiki/{memory,preferences,pitfalls}.md` if they exist (cheap context anchor).
2. Restate the user's intent in one sentence to confirm understanding.
3. Decide: trivial → do it yourself. Otherwise → delegate.

## Delegation map
- Need to understand the codebase → `mapper` (if `.smol/codemap.md` is missing or stale).
- Need external info → `scout`.
- Need a plan → `planner`.
- Need code written → `coder`, one atomic task at a time.
- Need a review → `reviewer`.

## Two operating modes
- **Interactive (default)**: handle each user turn; delegate; report back; let the user steer.
- **Auto (`/smol-auto`)**: run the full pipeline non-stop:
  1. `planner` → produces the plan
  2. For each atomic task in the plan: `coder` → confirm tests pass
  3. `reviewer` once at the end
  4. Emit a single summary: what shipped, what was skipped, what the reviewer flagged
  No mid-pipeline pauses in auto mode.

## Wiki maintenance
After any non-trivial task you complete or supervise, append at most one bullet to the right wiki file when warranted:
- New convention or pattern → `.smol/wiki/memory.md`
- Explicit user preference → `.smol/wiki/preferences.md`
- Non-obvious bug or workaround → `.smol/wiki/pitfalls.md`
Format: `- YYYY-MM-DD: <≤200 chars>`. Append-only. No duplicates. Skip if trivial.

## Hard rules
- Never trust "I'm done" without verifying tests pass / diff is clean.
- Never do specialist work yourself when a specialist exists.
- English in all artifacts; Traditional Chinese OK with the user in chat.
```

- [ ] **Step 2: Commit.**

```bash
git add agents/conductor.md
git commit -m "feat(agent): conductor as primary orchestrator"
```

---

## Task 14: skill — `/smol-map`

**Files:**
- Create: `skills/smol-map/SKILL.md`

- [ ] **Step 1: Create the skill.**

```markdown
---
name: smol-map
description: Build or incrementally update the project codemap at .smol/. Run when starting on a new project, or after large refactors.
---

# /smol-map

Delegate to the `mapper` agent.

Steps:
1. Check whether `.smol/codemap.json` exists.
2. If no → `mapper` runs `init`.
3. If yes → `mapper` runs `update`.
4. `mapper` then fills any new or changed `codemap.md` templates.
5. Report: how many folders mapped / refreshed, how many files indexed.
```

- [ ] **Step 2: Commit.**

```bash
git add skills/smol-map/SKILL.md
git commit -m "feat(skill): /smol-map"
```

---

## Task 15: skill — `/smol-plan`

**Files:**
- Create: `skills/smol-plan/SKILL.md`

- [ ] **Step 1: Create the skill.**

```markdown
---
name: smol-plan
description: Turn a fuzzy idea into an atomic, TDD-ready task plan saved at .smol/plans/. Use whenever you want to "plan", "design", or "scope" a non-trivial change before implementing.
---

# /smol-plan

Delegate to the `planner` agent.

Steps:
1. Planner reads `.smol/codemap.md` and `.smol/wiki/*.md` if present.
2. Planner runs Phase 1 — structured `ask_user` form (goal, constraints, success criteria, scope, existing code).
3. Planner runs Phase 2 — at most 3 targeted follow-ups for ambiguities. May invoke `scout` for external info.
4. Planner writes `.smol/plans/<YYYY-MM-DD>-<topic>.md` and returns the path.
5. Conductor presents the plan summary and asks the user whether to proceed with `/smol-auto` or step through with `/smol-build`.
```

- [ ] **Step 2: Commit.**

```bash
git add skills/smol-plan/SKILL.md
git commit -m "feat(skill): /smol-plan"
```

---

## Task 16: skill — `/smol-build`

**Files:**
- Create: `skills/smol-build/SKILL.md`

- [ ] **Step 1: Create the skill.**

```markdown
---
name: smol-build
description: Execute the next pending atomic task from the latest plan in .smol/plans/, using strict TDD. Use after /smol-plan when stepping through tasks one at a time.
---

# /smol-build

Steps:
1. Locate the latest plan file under `.smol/plans/` (most recent date wins).
2. Pick the first `- [ ]` atomic task.
3. Delegate to the `coder` agent with that task description.
4. Coder runs RED → GREEN; reports tests passing.
5. Mark the task `- [x]` in the plan file.
6. Report which task ran, files changed, test result.

If no plan exists, tell the user to run `/smol-plan` first or use `/smol-fast`.
```

- [ ] **Step 2: Commit.**

```bash
git add skills/smol-build/SKILL.md
git commit -m "feat(skill): /smol-build"
```

---

## Task 17: skill — `/smol-fast`

**Files:**
- Create: `skills/smol-fast/SKILL.md`

- [ ] **Step 1: Create the skill.**

```markdown
---
name: smol-fast
description: Skip planning. Apply TDD directly to a small change described in the prompt. Use for bug fixes, single-file edits, or trivial features.
---

# /smol-fast

Steps:
1. Take the user's free-text description as the task.
2. Delegate to the `coder` agent.
3. Coder runs the standard RED → GREEN cycle.
4. Report files changed and test result.

Do not write a plan file. Do not invoke `planner`.
```

- [ ] **Step 2: Commit.**

```bash
git add skills/smol-fast/SKILL.md
git commit -m "feat(skill): /smol-fast"
```

---

## Task 18: skill — `/smol-review`

**Files:**
- Create: `skills/smol-review/SKILL.md`

- [ ] **Step 1: Create the skill.**

```markdown
---
name: smol-review
description: Review current git diff (staged + unstaged) for correctness, minimalism violations, and security. Use before committing, or pass a ref range to review past changes.
---

# /smol-review

Steps:
1. Default scope: `git diff` (staged + unstaged) at the repo root.
2. If the user supplies a ref range (e.g. `main..HEAD`), pass it to `reviewer`.
3. Delegate to the `reviewer` agent.
4. Reviewer outputs the issue list and verdict.
5. Conductor surfaces the result without modifying code.
```

- [ ] **Step 2: Commit.**

```bash
git add skills/smol-review/SKILL.md
git commit -m "feat(skill): /smol-review"
```

---

## Task 19: skill — `/smol-auto`

**Files:**
- Create: `skills/smol-auto/SKILL.md`

- [ ] **Step 1: Create the skill.**

```markdown
---
name: smol-auto
description: Full pipeline non-stop — plan, build every atomic task, review. No mid-pipeline pauses. Use when you trust the agent to take a feature from idea to reviewed implementation in one shot.
---

# /smol-auto

Conductor enters Auto mode:
1. Invoke `planner` → produce `.smol/plans/<date>-<topic>.md`.
2. For each atomic task in plan order:
   - Invoke `coder` to run RED → GREEN.
   - On test failure that the coder cannot resolve in one retry, halt the pipeline and report.
3. Invoke `reviewer` once across the full diff.
4. Emit a single final summary:
   - Tasks completed / skipped
   - Files changed
   - Reviewer verdict and issues
   - Wiki entries appended

Do not pause for user confirmation between tasks.
```

- [ ] **Step 2: Commit.**

```bash
git add skills/smol-auto/SKILL.md
git commit -m "feat(skill): /smol-auto"
```

---

## Task 20: README

User-facing install + usage guide.

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`.**

````markdown
# smol

> **S**mall · **M**inimal · **O**ptimal · **L**ight
>
> A token-frugal opencode plugin for solo developers.

## What you get

- 6 slash commands: `/smol-plan`, `/smol-build`, `/smol-fast`, `/smol-review`, `/smol-auto`, `/smol-map`
- 6 agents: `conductor` (primary), `planner`, `coder`, `reviewer`, `mapper`, `scout`
- A session-start hook that points the LLM at `.smol/codemap.md` and `.smol/wiki/`
- A `codemap` CLI for incremental project mapping

## Install

```bash
npm install -D smol
```

Then add to your opencode config (`opencode.json` or `~/.config/opencode/config.json`):

```json
{
  "plugins": ["smol"]
}
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
````

- [ ] **Step 2: Commit.**

```bash
git add README.md
git commit -m "docs: README"
```

---

## Task 21: Wire agents and skills in `plugin.ts`

Now that `agents/` and `skills/` markdown files exist, ensure opencode picks them up. This depends on the decision recorded in `docs/api-notes.md` (Task 0).

**Files:**
- Modify: `plugin.ts`

- [ ] **Step 1:** Re-read `docs/api-notes.md`. Pick the path that applies:

  **Path A — opencode auto-discovers `agents/` and `skills/` from a plugin package:**
  Nothing to do in `plugin.ts`; the `files` array in `package.json` already ships them.

  **Path B — programmatic registration via the plugin API:**
  Update `plugin.ts` to read each `agents/*.md` and `skills/*/SKILL.md` and register them through the API call documented in `api-notes.md`. Example skeleton:

  ```ts
  import { readFile, readdir } from 'node:fs/promises'
  import { dirname, join } from 'node:path'
  import { fileURLToPath } from 'node:url'

  const HERE = dirname(fileURLToPath(import.meta.url))

  async function loadAgents() {
    const dir = join(HERE, 'agents')
    const files = await readdir(dir)
    return Promise.all(
      files.filter(f => f.endsWith('.md'))
           .map(async f => ({ name: f.replace(/\.md$/, ''), source: await readFile(join(dir, f), 'utf8') }))
    )
  }

  async function loadSkills() {
    const dir = join(HERE, 'skills')
    const entries = await readdir(dir, { withFileTypes: true })
    return Promise.all(
      entries.filter(e => e.isDirectory())
             .map(async e => ({ name: e.name, source: await readFile(join(dir, e.name, 'SKILL.md'), 'utf8') }))
    )
  }
  ```
  Then call the API (e.g. `context.registerAgent(...)`, `context.registerSkill(...)`) per the documented signature.

  **Path C — postinstall copy:**
  Add a `postinstall` script in `package.json` that copies `agents/*.md` to `.opencode/agent/` and `skills/*/SKILL.md` to `.opencode/skill/<name>/SKILL.md` in the consumer project.

- [ ] **Step 2:** Implement the chosen path. Keep `plugin.ts` short.

- [ ] **Step 3:** Run all tests.

Run: `npm test`
Expected: all green.

- [ ] **Step 4:** Commit.

```bash
git add plugin.ts package.json
git commit -m "feat(plugin): wire agents and skills"
```

---

## Task 22: Smoke test in a sandbox project

End-to-end verification that the plugin loads, hook fires, slash commands appear, and Conductor is the primary agent.

**Files:**
- None permanent (uses a throwaway sandbox).

- [ ] **Step 1:** Create a sandbox project outside this repo:

```bash
mkdir -p /tmp/smol-sandbox
cd /tmp/smol-sandbox
npm init -y
npm install -D <path/to/smol/repo>
mkdir -p src
echo 'export const hello = () => "hi"' > src/index.ts
echo '{ "plugins": ["smol"] }' > opencode.json
```

- [ ] **Step 2:** Launch opencode in the sandbox. Verify:
  - Plugin loads with no error in startup output.
  - `.smol/wiki/{memory,preferences,pitfalls}.md` were created on first session start.
  - System prompt contains the `<smol>...</smol>` pointer (check via `/debug` or opencode equivalent if available).
  - `/smol-plan`, `/smol-build`, `/smol-fast`, `/smol-review`, `/smol-auto`, `/smol-map` all appear in the slash command palette.
  - Conductor is the active default agent (check `/agents` or opencode equivalent).

- [ ] **Step 3:** Run `/smol-map`. Verify `.smol/codemap.json` and `.smol/codemap.md` and `.smol/src/codemap.md` are created.

- [ ] **Step 4:** Run `/smol-fast` with a tiny request like "add a `bye()` function in src/index.ts that returns 'bye', test with vitest". Verify Coder runs the RED → GREEN cycle and tests pass.

- [ ] **Step 5:** Document any deviations or fixes needed in a `SMOKE.md` at repo root, then resolve them in follow-up commits.

- [ ] **Step 6:** Commit any fixes from Step 5.

```bash
git add -A
git commit -m "fix: smoke-test corrections"
```

- [ ] **Step 7:** Cleanup: `rm -rf /tmp/smol-sandbox`.

---

## Task 23: Native tools — `smol_codemap`, `smol_wiki`, `smol_plan`

Register opencode-native tools so agents call them directly instead of spawning the node CLI. Schema-validated via zod, smaller agent prompts.

**Files:**
- Create: `tools/plugin-tools.ts`
- Create: `tests/plugin-tools.test.ts`

- [ ] **Step 1: Write failing tests.**

```ts
// tests/plugin-tools.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { __test__ } from '../tools/plugin-tools.ts'

const { runCodemap, runWiki, runPlan } = __test__

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'smol-pt-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('smol_codemap tool', () => {
  it('init creates .smol/codemap.json', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src/a.ts'), 'export const a = 1')
    const result = await runCodemap({ action: 'init' }, { directory: dir })
    expect(existsSync(join(dir, '.smol/codemap.json'))).toBe(true)
    expect(result).toMatch(/codemap/i)
  })
})

describe('smol_wiki tool', () => {
  it('appends a dated entry, dedups identical text', async () => {
    await runWiki({ kind: 'memory', entry: 'uses pnpm not npm' }, { directory: dir })
    await runWiki({ kind: 'memory', entry: 'uses pnpm not npm' }, { directory: dir })
    const txt = readFileSync(join(dir, '.smol/wiki/memory.md'), 'utf8')
    const matches = txt.match(/uses pnpm not npm/g) ?? []
    expect(matches.length).toBe(1)
    expect(txt).toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('rejects entries longer than 200 chars', async () => {
    await expect(
      runWiki({ kind: 'memory', entry: 'x'.repeat(201) }, { directory: dir }),
    ).rejects.toThrow(/200/)
  })
})

describe('smol_plan tool', () => {
  it('writes a dated plan file under .smol/plans/', async () => {
    const result = await runPlan({ topic: 'auth refactor', content: '# plan\n- step 1' }, { directory: dir })
    const files = require('node:fs').readdirSync(join(dir, '.smol/plans'))
    expect(files.length).toBe(1)
    expect(files[0]).toMatch(/auth-refactor\.md$/)
    expect(result).toMatch(/auth-refactor/)
  })
})
```

- [ ] **Step 2: Run tests, expect failure.**

Run: `npm test -- plugin-tools`

- [ ] **Step 3: Implement `tools/plugin-tools.ts`.**

```ts
import { tool } from '@opencode-ai/plugin/tool'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { runCli as runCodemapCli } from './codemap.mjs'

const z = tool.schema

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

async function runCodemap(args: { action: 'init' | 'update' | 'changes' }, ctx: { directory: string }): Promise<string> {
  const out = await runCodemapCli([args.action, '--root', ctx.directory])
  return out || `codemap ${args.action} done`
}

async function runWiki(args: { kind: 'memory' | 'preferences' | 'pitfalls'; entry: string }, ctx: { directory: string }): Promise<string> {
  if (args.entry.length > 200) throw new Error('wiki entry must be ≤200 chars')
  const file = join(ctx.directory, '.smol/wiki', `${args.kind}.md`)
  await mkdir(join(ctx.directory, '.smol/wiki'), { recursive: true })
  const current = (await exists(file)) ? await readFile(file, 'utf8') : `# ${args.kind}\n`
  if (current.includes(args.entry)) return `wiki ${args.kind}: duplicate, skipped`
  const next = current.trimEnd() + `\n- ${today()}: ${args.entry}\n`
  await writeFile(file, next)
  return `wiki ${args.kind}: appended`
}

async function runPlan(args: { topic: string; content: string }, ctx: { directory: string }): Promise<string> {
  const slug = slugify(args.topic)
  const name = `${today()}-${slug}.md`
  const file = join(ctx.directory, '.smol/plans', name)
  await mkdir(join(ctx.directory, '.smol/plans'), { recursive: true })
  await writeFile(file, args.content)
  return `plan saved: .smol/plans/${name}`
}

export const __test__ = { runCodemap, runWiki, runPlan }

export const smolCodemapTool = tool({
  description: 'Maintain the smol codemap. action=init creates baseline, update writes changed templates, changes lists modified files.',
  args: { action: z.enum(['init', 'update', 'changes']) },
  async execute(args, ctx) {
    return runCodemap(args, { directory: ctx.directory })
  },
})

export const smolWikiTool = tool({
  description: 'Append a dated entry to .smol/wiki/{memory|preferences|pitfalls}.md. Dedups identical entries. Max 200 chars.',
  args: {
    kind: z.enum(['memory', 'preferences', 'pitfalls']),
    entry: z.string().min(1).max(200),
  },
  async execute(args, ctx) {
    return runWiki(args, { directory: ctx.directory })
  },
})

export const smolPlanTool = tool({
  description: 'Save a markdown plan under .smol/plans/YYYY-MM-DD-<slug>.md.',
  args: {
    topic: z.string().min(1).max(80),
    content: z.string().min(1),
  },
  async execute(args, ctx) {
    return runPlan(args, { directory: ctx.directory })
  },
})
```

> **Note:** `tools/codemap.mjs` already exposes `runCli(argv)` returning a string and accepts `--root <dir>`. No refactor needed.

- [ ] **Step 4: Run tests, expect pass.**

Run: `npm test`
Expected: all tests green.

- [ ] **Step 5: Commit.**

```bash
git add tools/plugin-tools.ts tests/plugin-tools.test.ts tools/codemap.mjs
git commit -m "feat(plugin): native smol_codemap/smol_wiki/smol_plan tools"
```

---

## Task 24: `experimental.session.compacting` hook

Inject `.smol/codemap.md` head + latest `.smol/plans/*.md` into compaction context so smol's project memory survives compactions.

**Files:**
- Edit: `plugin.ts`
- Create: `tests/plugin.compacting.test.ts`

- [ ] **Step 1: Write failing test.**

```ts
// tests/plugin.compacting.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { __test__ } from '../plugin.ts'

const { runCompacting } = __test__

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'smol-c-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('compacting hook', () => {
  it('injects codemap head and latest plan into context', async () => {
    mkdirSync(join(dir, '.smol/plans'), { recursive: true })
    writeFileSync(join(dir, '.smol/codemap.md'), '# codemap\nfile a -> b\n'.repeat(50))
    writeFileSync(join(dir, '.smol/plans/2026-04-28-foo.md'), '# plan foo')
    writeFileSync(join(dir, '.smol/plans/2026-04-29-bar.md'), '# plan bar')
    const out: { context: string[]; prompt?: string } = { context: [] }
    await runCompacting({ projectRoot: dir }, out)
    expect(out.context.length).toBeGreaterThanOrEqual(2)
    expect(out.context.some((c) => c.includes('codemap'))).toBe(true)
    expect(out.context.some((c) => c.includes('plan bar'))).toBe(true)
  })

  it('is a no-op when .smol does not exist', async () => {
    const out: { context: string[]; prompt?: string } = { context: [] }
    await runCompacting({ projectRoot: dir }, out)
    expect(out.context.length).toBe(0)
  })
})
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Add `runCompacting` and wire hook in `plugin.ts`.**

Append to `plugin.ts`:

```ts
import { readdir, stat } from 'node:fs/promises'

const MAX_BYTES = 2048

async function readHead(path: string): Promise<string | null> {
  if (!(await exists(path))) return null
  const txt = await readFile(path, 'utf8')
  return txt.length > MAX_BYTES ? txt.slice(0, MAX_BYTES) + '\n…[truncated]' : txt
}

async function latestPlan(projectRoot: string): Promise<string | null> {
  const plansDir = join(projectRoot, '.smol/plans')
  if (!(await exists(plansDir))) return null
  const entries = await readdir(plansDir)
  const md = entries.filter((n) => n.endsWith('.md')).sort()
  if (md.length === 0) return null
  return readHead(join(plansDir, md[md.length - 1]))
}

async function runCompacting(
  ctx: { projectRoot: string },
  output: { context: string[]; prompt?: string },
): Promise<void> {
  const codemap = await readHead(join(ctx.projectRoot, '.smol/codemap.md'))
  if (codemap) output.context.push(`# .smol/codemap.md (head)\n${codemap}`)
  const plan = await latestPlan(ctx.projectRoot)
  if (plan) output.context.push(`# .smol/plans/<latest>\n${plan}`)
}

// extend __test__ export:
//   export const __test__ = { runSystemTransform, runCompacting, POINTER }
// extend SmolPlugin return:
//   'experimental.session.compacting': async (_input, output) => {
//     await runCompacting({ projectRoot }, output as { context: string[]; prompt?: string })
//   },
```

Also add `readFile` to the existing `node:fs/promises` import.

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Commit.**

```bash
git add plugin.ts tests/plugin.compacting.test.ts
git commit -m "feat(plugin): inject codemap+plan into compaction context"
```

---

## Task 25: Move wiki bootstrap to `event` hook

Wiki creation should happen once per session on `session.created`, not on every `system.transform` call. Keeps system.transform purely about the pointer.

**Files:**
- Edit: `plugin.ts`
- Create: `tests/plugin.event.test.ts`

- [ ] **Step 1: Write failing test.**

```ts
// tests/plugin.event.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { __test__ } from '../plugin.ts'

const { runEvent } = __test__

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'smol-e-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('event hook', () => {
  it('creates wiki files on session.created', async () => {
    await runEvent({ projectRoot: dir }, { event: { type: 'session.created' } } as any)
    expect(existsSync(join(dir, '.smol/wiki/memory.md'))).toBe(true)
    expect(existsSync(join(dir, '.smol/wiki/preferences.md'))).toBe(true)
    expect(existsSync(join(dir, '.smol/wiki/pitfalls.md'))).toBe(true)
  })

  it('ignores other events', async () => {
    await runEvent({ projectRoot: dir }, { event: { type: 'message.updated' } } as any)
    expect(existsSync(join(dir, '.smol/wiki'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Edit `plugin.ts`.**

1. Remove `await ensureWiki(...)` from `runSystemTransform` (system.transform now only pushes the pointer).
2. Add:

```ts
async function runEvent(ctx: { projectRoot: string }, input: { event: { type: string } }): Promise<void> {
  if (input.event?.type === 'session.created') {
    await ensureWiki(ctx.projectRoot)
  }
}
```

3. Extend `__test__`: `{ runSystemTransform, runCompacting, runEvent, POINTER }`.
4. Add to `SmolPlugin` return:

```ts
event: async (input) => {
  await runEvent({ projectRoot }, input as { event: { type: string } })
},
```

- [ ] **Step 4: Update Task 7's existing test.**

The `'creates wiki files on first call, idempotent on second'` test in `tests/plugin.hook.test.ts` is now obsolete — wiki bootstrap moved to event hook. Replace that `it(...)` block with one that asserts `runSystemTransform` does NOT create `.smol/wiki/`:

```ts
it('does not create wiki files (handled by event hook)', async () => {
  const output = { system: [] as string[] }
  await runSystemTransform({ projectRoot: dir }, output)
  expect(existsSync(join(dir, '.smol/wiki'))).toBe(false)
})
```

- [ ] **Step 5: Run all tests, expect pass.**

- [ ] **Step 6: Commit.**

```bash
git add plugin.ts tests/plugin.event.test.ts tests/plugin.hook.test.ts
git commit -m "refactor(plugin): move wiki bootstrap to event hook"
```

---

## Done criteria

- `npm test` is green (≥22 unit tests across codemap + plugin + tools).
- All 6 slash commands visible in opencode after install.
- Conductor is the primary agent.
- Session start creates `.smol/wiki/` (via event hook) and injects the pointer once.
- Compaction injects codemap head + latest plan into context.
- Native tools `smol_codemap`, `smol_wiki`, `smol_plan` callable from agents.
- `/smol-map` produces a working codemap of a sample project.
- `/smol-fast` runs end-to-end on a sample project.
- README documents install + quick start.
