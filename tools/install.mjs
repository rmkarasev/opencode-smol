#!/usr/bin/env node
/* smol install — copies bundled agents and skills into the consumer project's
   .opencode/{agent,skills} so opencode auto-discovers them. Idempotent. */
import { readdir, mkdir, copyFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(HERE, '..')

async function exists(p) {
  try { await stat(p); return true } catch { return false }
}

async function copyAgents(root) {
  const src = join(PKG_ROOT, 'agents')
  if (!(await exists(src))) return 0
  const dest = join(root, 'agent')
  await mkdir(dest, { recursive: true })
  const files = (await readdir(src)).filter((f) => f.endsWith('.md'))
  for (const f of files) await copyFile(join(src, f), join(dest, f))
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

function parseArgs(argv) {
  const args = argv.slice(2).filter((a) => a !== 'install')
  const profile = args.includes('--profile')
  const target = args.find((a) => !a.startsWith('--'))
  return { target, profile }
}

async function writePluginShim(root) {
  const dir = join(root, 'plugin')
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'smol.ts')
  if (await exists(file)) return false
  await writeFile(file, `export { SmolPlugin as default } from 'smol/plugin'\n`)
  return true
}

async function main() {
  const { target, profile } = parseArgs(process.argv)
  const base = target ? resolve(target) : process.cwd()
  const root = profile ? base : join(base, '.opencode')
  const agents = await copyAgents(root)
  const skills = await copySkills(root)
  const shim = await writePluginShim(root)
  console.log(
    `smol installed: ${agents} agent(s), ${skills} skill(s)${shim ? ', plugin shim' : ''} → ${root}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
