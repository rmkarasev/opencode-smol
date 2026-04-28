/* Reads agents/*.md from package directory at runtime. Returns the
   markdown body (system prompt) and frontmatter as a plain object. */
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(HERE, '..')

export type AgentMeta = {
  name?: string
  description?: string
  mode?: 'primary' | 'subagent' | 'all'
  tools?: Record<string, boolean>
}

export type AgentDoc = { meta: AgentMeta; prompt: string }

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function parseAgentMd(src: string): AgentDoc {
  const m = src.match(FM)
  if (!m) return { meta: {}, prompt: src.trim() }
  const meta: Record<string, unknown> = {}
  let tools: Record<string, boolean> | undefined
  let inTools = false
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim()) continue
    if (/^tools:\s*$/.test(raw)) { inTools = true; tools = {}; continue }
    if (inTools && /^\s+\w+:\s*(true|false)/.test(raw)) {
      const [, k, v] = raw.match(/^\s+(\w+):\s*(true|false)/) ?? []
      if (k && tools) tools[k] = v === 'true'
      continue
    }
    inTools = false
    const [, k, v] = raw.match(/^(\w+):\s*(.*)$/) ?? []
    if (k) meta[k] = v.trim()
  }
  if (tools) meta.tools = tools
  return { meta: meta as AgentMeta, prompt: src.slice(m[0].length).trim() }
}

export async function loadAgent(name: string, root = PKG_ROOT): Promise<AgentDoc> {
  const txt = await readFile(join(root, 'agents', `${name}.md`), 'utf8')
  return parseAgentMd(txt)
}
