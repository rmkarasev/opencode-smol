import { tool } from '@opencode-ai/plugin/tool'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
// @ts-expect-error - .mjs without types
import { runCli as runCodemapCli } from './codemap.mjs'

const z = tool.schema

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

async function runCodemap(
  args: { action: 'init' | 'update' | 'changes' },
  ctx: { directory: string },
): Promise<string> {
  const out: string = await runCodemapCli([args.action, '--root', ctx.directory])
  return out || `codemap ${args.action} done`
}

async function runWiki(
  args: { kind: 'memory' | 'preferences' | 'pitfalls'; entry: string },
  ctx: { directory: string },
): Promise<string> {
  if (args.entry.length > 200) throw new Error('wiki entry must be ≤200 chars')
  const wikiDir = join(ctx.directory, '.smol/wiki')
  await mkdir(wikiDir, { recursive: true })
  const file = join(wikiDir, `${args.kind}.md`)
  const current = (await exists(file))
    ? await readFile(file, 'utf8')
    : `# ${args.kind}\n`
  if (current.includes(args.entry)) return `wiki ${args.kind}: duplicate, skipped`
  const next = current.trimEnd() + `\n- ${today()}: ${args.entry}\n`
  await writeFile(file, next)
  return `wiki ${args.kind}: appended`
}

async function runPlan(
  args: { topic: string; content: string },
  ctx: { directory: string },
): Promise<string> {
  const slug = slugify(args.topic)
  const name = `${today()}-${slug}.md`
  await mkdir(join(ctx.directory, '.smol/plans'), { recursive: true })
  await writeFile(join(ctx.directory, '.smol/plans', name), args.content)
  return `plan saved: .smol/plans/${name}`
}

export const __test__ = { runCodemap, runWiki, runPlan }

export const smolCodemapTool = tool({
  description:
    'Maintain the smol codemap. action=init creates baseline, update writes changed templates, changes lists modified files.',
  args: { action: z.enum(['init', 'update', 'changes']) },
  async execute(args, ctx) {
    return runCodemap(args, { directory: ctx.directory })
  },
})

export const smolWikiTool = tool({
  description:
    'Append a dated entry to .smol/wiki/{memory|preferences|pitfalls}.md. Dedups identical entries. Max 200 chars.',
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
