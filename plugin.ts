import type { Plugin } from '@opencode-ai/plugin'
import { mkdir, writeFile, readFile, access, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { smolCodemapTool, smolWikiTool, smolPlanTool } from './tools/plugin-tools'
import { loadAgent, parseAgentMd } from './tools/agent-loader'
import { applyOverride, loadSmolJson, type AgentOverride } from './tools/smol-config'

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)))
const SKILLS_DIR = join(PKG_ROOT, 'skills')
const COMMANDS_DIR = join(PKG_ROOT, 'commands')

const COMMANDS = ['smol-plan', 'smol-build', 'smol-review', 'smol-auto', 'smol-fast', 'smol-map'] as const

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
type CommandEntry = { template: string; description?: string; agent?: string; model?: string; subtask?: boolean }
type CommandMap = Record<string, CommandEntry | undefined>

async function loadCommand(name: string): Promise<CommandEntry> {
  const txt = await readFile(join(COMMANDS_DIR, `${name}.md`), 'utf8')
  const doc = parseAgentMd(txt)
  const meta = doc.meta as Record<string, unknown>
  const out: CommandEntry = { template: doc.prompt }
  if (typeof meta.description === 'string') out.description = meta.description
  if (typeof meta.agent === 'string') out.agent = meta.agent
  if (typeof meta.model === 'string') out.model = meta.model
  if (typeof meta.subtask === 'boolean') out.subtask = meta.subtask
  return out
}

async function buildAgentConfig(
  smolName: string,
  defaultMode: 'primary' | 'subagent',
  override: AgentOverride | undefined,
  agentRoot?: string,
): Promise<Record<string, unknown>> {
  const doc = agentRoot
    ? await loadAgent(smolName, agentRoot)
    : await loadAgent(smolName)
  const base: Record<string, unknown> = {
    description: doc.meta.description ?? `smol ${smolName}`,
    mode: doc.meta.mode ?? defaultMode,
    prompt: doc.prompt,
    // Free default so users without a paid subscription can run smol
    // out of the box. Overridden by .smol/smol.json when present.
    model: 'opencode/big-pickle',
  }
  if (doc.meta.tools) base.tools = doc.meta.tools
  return applyOverride(base, override)
}

// Demote a built-in agent (build/plan) to a hidden subagent so the smol
// equivalent (conductor/planner) takes over the slot in the UI. Preserves
// the original model/prompt fields so it can still be invoked manually.
function demote(existing: Record<string, unknown> | undefined): Record<string, unknown> {
  return { ...(existing ?? {}), mode: 'subagent', hidden: true }
}

async function runConfig(
  ctx: { projectRoot: string; agentRoot?: string },
  config: {
    agent?: AgentMap
    command?: CommandMap
    default_agent?: string
    skills?: { paths?: string[] }
  } & Record<string, unknown>,
): Promise<void> {
  const smol = await loadSmolJson(ctx.projectRoot)
  const overrides = smol.agents ?? {}
  config.agent = config.agent ?? {}
  // Register smol agents under their own keys (do not overwrite build/plan).
  config.agent.conductor = await buildAgentConfig('conductor', 'primary', overrides.conductor, ctx.agentRoot)
  config.agent.planner = await buildAgentConfig('planner', 'primary', overrides.planner, ctx.agentRoot)
  for (const name of ['coder', 'reviewer', 'mapper', 'scout'] as const) {
    config.agent[name] = await buildAgentConfig(name, 'subagent', overrides[name], ctx.agentRoot)
  }
  // Demote built-in plan so Planner owns the plan slot. Keep build visible
  // so users can still switch to opencode's default build agent if desired.
  config.agent.plan = demote(config.agent.plan)
  // Make Conductor the default unless the user explicitly set one.
  if (!config.default_agent) config.default_agent = 'conductor'

  // Register slash commands programmatically (no .opencode/command file copy).
  config.command = config.command ?? {}
  for (const name of COMMANDS) {
    config.command[name] = await loadCommand(name)
  }

  // Expose bundled skills directory so opencode discovers them lazily.
  config.skills = config.skills ?? {}
  config.skills.paths = config.skills.paths ?? []
  if (!config.skills.paths.includes(SKILLS_DIR)) {
    config.skills.paths.push(SKILLS_DIR)
  }
}

export const __test__ = {
  runSystemTransform,
  runCompacting,
  runEvent,
  runConfig,
  ensureWiki,
  buildAgentConfig,
  loadCommand,
  POINTER,
  SKILLS_DIR,
  COMMANDS,
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
        input as {
          agent?: AgentMap
          command?: CommandMap
          default_agent?: string
          skills?: { paths?: string[] }
        } & Record<string, unknown>,
      )
    },
    tool: {
      smol_codemap: smolCodemapTool,
      smol_wiki: smolWikiTool,
      smol_plan: smolPlanTool,
    },
  }
}

export default {
  id: 'opencode-smol',
  server: SmolPlugin,
}
