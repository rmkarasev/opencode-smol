import type { Plugin } from '@opencode-ai/plugin'
import { mkdir, writeFile, readFile, access, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { smolCodemapTool, smolWikiTool, smolPlanTool } from './tools/plugin-tools'
import { loadAgent } from './tools/agent-loader'
import { applyOverride, loadSmolJson, SMOL_TO_OC, type SmolJson } from './tools/smol-config'

const POINTER =
  '<smol>Check .smol/codemap.md and .smol/wiki/{memory,preferences,pitfalls}.md when relevant. ' +
  'Append new insights to wiki via the smol_wiki tool (append-only, dated, English, ≤200 chars per entry).</smol>'

const WIKI_FILES: Record<string, string> = {
  'memory.md':
    '# memory\n\n<!-- Project conventions, naming, recurring patterns. Append-only, dated. -->\n',
  'preferences.md':
    '# preferences\n\n<!-- User coding style and explicit preferences. Append-only, dated. -->\n',
  'pitfalls.md':
    '# pitfalls\n\n<!-- Gotchas, dead-ends, things that bit us. Append-only, dated. -->\n',
}

const MAX_BYTES = 2048

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
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
  _ctx: { projectRoot: string },
  output: { system: string[] },
): Promise<void> {
  output.system.push(POINTER)
}

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

async function runEvent(
  ctx: { projectRoot: string },
  input: { event?: { type?: string } },
): Promise<void> {
  if (input?.event?.type === 'session.created') {
    await ensureWiki(ctx.projectRoot)
  }
}

type AgentMap = Record<string, Record<string, unknown> | undefined>

async function buildAgentConfig(
  smolName: string,
  defaultMode: 'primary' | 'subagent',
  override: SmolJson['agents'] extends infer A ? A extends Record<string, infer V> ? V : undefined : undefined,
): Promise<Record<string, unknown>> {
  const doc = await loadAgent(smolName)
  const base: Record<string, unknown> = {
    description: doc.meta.description ?? `smol ${smolName}`,
    mode: defaultMode,
    prompt: doc.prompt,
  }
  if (doc.meta.tools) base.tools = doc.meta.tools
  return applyOverride(base, override)
}

async function runConfig(
  ctx: { projectRoot: string },
  config: { agent?: AgentMap } & Record<string, unknown>,
): Promise<void> {
  const smol = await loadSmolJson(ctx.projectRoot)
  const overrides = smol.agents ?? {}
  config.agent = config.agent ?? {}
  // conductor → build (default primary), planner → plan (alt primary)
  config.agent.build = await buildAgentConfig('conductor', 'primary', overrides.conductor)
  config.agent.plan = await buildAgentConfig('planner', 'primary', overrides.planner)
  // remaining smol agents as subagents
  for (const name of ['coder', 'reviewer', 'mapper', 'scout']) {
    const ocName = SMOL_TO_OC[name]
    config.agent[ocName] = await buildAgentConfig(name, 'subagent', overrides[name])
  }
}

export const __test__ = {
  runSystemTransform,
  runCompacting,
  runEvent,
  runConfig,
  ensureWiki,
  buildAgentConfig,
  POINTER,
}

export const SmolPlugin: Plugin = async (context) => {
  const projectRoot =
    (context as { directory?: string }).directory ?? process.cwd()
  return {
    'experimental.chat.system.transform': async (_input, output) => {
      await runSystemTransform(
        { projectRoot },
        output as { system: string[] },
      )
    },
    'experimental.session.compacting': async (_input, output) => {
      await runCompacting(
        { projectRoot },
        output as { context: string[]; prompt?: string },
      )
    },
    event: async (input) => {
      await runEvent({ projectRoot }, input as { event?: { type?: string } })
    },
    config: async (input) => {
      await runConfig(
        { projectRoot },
        input as { agent?: AgentMap } & Record<string, unknown>,
      )
    },
    tool: {
      smol_codemap: smolCodemapTool,
      smol_wiki: smolWikiTool,
      smol_plan: smolPlanTool,
    },
  }
}

export default SmolPlugin
