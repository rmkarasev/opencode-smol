import { readdir, readFile, mkdir, writeFile, access } from 'node:fs/promises'
import { join, relative, sep, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const DEFAULT_EXCLUDE = ['.git/**', '.smol/**']

function toPosix(p) {
  return p.split(sep).join('/')
}

function compileGlob(pattern) {
  // Minimal glob: `**/` matches zero-or-more dirs, `**` matches anything,
  // `*` matches within one segment.
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const re = escaped
    .replace(/\*\*\//g, '\u0001')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
    .replace(/\u0001/g, '(?:.*/)?')
  return new RegExp('^' + re + '$')
}

function matchesAny(path, patterns) {
  return patterns.some((p) => compileGlob(p).test(path))
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

export function renderTemplate({ folder, files }) {
  const fileList = files.map((f) => `- ${f.split('/').pop()}`).join('\n')
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
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

export async function writeTemplates(root, folders, allFiles) {
  for (const folder of folders) {
    const targetDir = folder === '.' ? join(root, '.smol') : join(root, '.smol', folder)
    const target = join(targetDir, 'codemap.md')
    if (await exists(target)) continue
    const filesInFolder = allFiles.filter((f) => {
      const d = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '.'
      return d === folder
    })
    await mkdir(targetDir, { recursive: true })
    await writeFile(target, renderTemplate({ folder, files: filesInFolder }))
  }
}

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
  const root = args.root ?? process.cwd()
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

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMainModule) {
  runCli(process.argv.slice(2))
    .then((out) => {
      if (out) process.stdout.write(out + '\n')
    })
    .catch((err) => {
      console.error(err.message)
      process.exit(1)
    })
}
