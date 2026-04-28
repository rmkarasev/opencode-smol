#!/usr/bin/env node
/* smol install — copies bundled agents and skills into the consumer project's
   .opencode/{agent,skills} so opencode auto-discovers them. Idempotent. */
import { readdir, mkdir, copyFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(HERE, '..')

async function exists(p) {
  try { await stat(p); return true } catch { return false }
}

async function copyAgents(target) {
  const src = join(PKG_ROOT, 'agents')
  if (!(await exists(src))) return 0
  const dest = join(target, '.opencode', 'agent')
  await mkdir(dest, { recursive: true })
  const files = (await readdir(src)).filter((f) => f.endsWith('.md'))
  for (const f of files) await copyFile(join(src, f), join(dest, f))
  return files.length
}

async function copySkills(target) {
  const src = join(PKG_ROOT, 'skills')
  if (!(await exists(src))) return 0
  const entries = await readdir(src, { withFileTypes: true })
  let count = 0
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const skillSrc = join(src, e.name, 'SKILL.md')
    if (!(await exists(skillSrc))) continue
    const skillDest = join(target, '.opencode', 'skills', e.name)
    await mkdir(skillDest, { recursive: true })
    await copyFile(skillSrc, join(skillDest, 'SKILL.md'))
    count++
  }
  return count
}

async function main() {
  const target = process.argv[2] ? resolve(process.argv[2]) : process.cwd()
  const agents = await copyAgents(target)
  const skills = await copySkills(target)
  console.log(`smol installed: ${agents} agent(s), ${skills} skill(s) → ${target}/.opencode/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
