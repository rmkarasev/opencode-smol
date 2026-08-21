import { tool } from '@opencode-ai/plugin/tool'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'

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

function datetimeLocal(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}-${hh}${min}`
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
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
  const name = `${datetimeLocal()}-${slug}.md`
  await mkdir(join(ctx.directory, '.smol/plans'), { recursive: true })
  await writeFile(join(ctx.directory, '.smol/plans', name), args.content)
  return `plan saved: .smol/plans/${name}`
}

export const __test__ = { runWiki, runPlan }

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
  description: 'Save a markdown plan under .smol/plans/YYYY-MM-DD-HHmm-<slug>.md.',
  args: {
    topic: z.string().min(1).max(80),
    content: z.string().min(1),
  },
  async execute(args, ctx) {
    return runPlan(args, { directory: ctx.directory })
  },
})
