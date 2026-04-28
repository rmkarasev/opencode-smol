#!/usr/bin/env node
/* smol — copies bundled agents, skills, and commands into the consumer's
   .opencode/ (or root with --profile). Subcommands: install | update.
   Idempotent. update overwrites; install skips plugin shim if it exists. */
import { readdir, mkdir, copyFile, stat, writeFile, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(HERE, '..')

async function exists(p) {
  try { await stat(p); return true } catch { return false }
}

async function copyAgents(srcDir, destDir) {
  if (!(await exists(srcDir))) return 0
  await mkdir(destDir, { recursive: true })
  // conductor and planner are injected via the plugin's config hook,
  // so they don't need to live as standalone agent files
  const skip = new Set(['conductor.md', 'planner.md'])
  // remove stale files left by older versions
  for (const name of skip) {
    const stale = join(destDir, name)
    if (await exists(stale)) await unlink(stale)
  }
  const files = (await readdir(srcDir)).filter((f) => f.endsWith('.md') && !skip.has(f))
  for (const f of files) await copyFile(join(srcDir, f), join(destDir, f))
  return files.length
}

async function copySkills(root) {
  const src = join(PKG_ROOT, 'skills')
  if (!(await exists(src))) return 0
  const entries = await readdir(src, { withFileTypes: true })
  let count = 0
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const skillSrc = join(src, e.name, 'SKILL.md')
    if (!(await exists(skillSrc))) continue
    const skillDest = join(root, 'skills', e.name)
    await mkdir(skillDest, { recursive: true })
    await copyFile(skillSrc, join(skillDest, 'SKILL.md'))
    count++
  }
  return count
}

async function copyCommands(srcDir, destDir) {
  if (!(await exists(srcDir))) return 0
  await mkdir(destDir, { recursive: true })
  const files = (await readdir(srcDir)).filter((f) => f.endsWith('.md'))
  for (const f of files) await copyFile(join(srcDir, f), join(destDir, f))
  return files.length
}

async function writePluginShim(root, force) {
  const dir = join(root, 'plugin')
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'smol.ts')
  if (!force && (await exists(file))) return false
  await writeFile(file, `export { SmolPlugin as default } from 'smol/plugin'\n`)
  return true
}

function parseArgs(argv) {
  const rest = argv.slice(2)
  const cmd = rest[0] === 'update' ? 'update' : 'install'
  const args = rest.filter((a, i) => !(i === 0 && (a === 'install' || a === 'update')))
  const profile = args.includes('--profile')
  const target = args.find((a) => !a.startsWith('--'))
  return { cmd, target, profile }
}

async function main() {
  const { cmd, target, profile } = parseArgs(process.argv)
  const base = target ? resolve(target) : process.cwd()
  const root = profile ? base : join(base, '.opencode')
  const agents = await copyAgents(join(PKG_ROOT, 'agents'), join(root, 'agent'))
  const skills = await copySkills(root)
  const commands = await copyCommands(join(PKG_ROOT, 'commands'), join(root, 'command'))
  const shim = await writePluginShim(root, cmd === 'update')
  const verb = cmd === 'update' ? 'updated' : 'installed'
  console.log(
    `smol ${verb}: ${agents} agent(s), ${skills} skill(s), ${commands} command(s)${shim ? ', plugin shim' : ''} → ${root}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
