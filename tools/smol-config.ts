/* .smol/smol.json reader and agent-config merger. Maps smol agent names
   (conductor/planner/...) to opencode agent keys (build/plan/...). */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export type AgentOverride = string | { model?: string; variant?: string; [k: string]: unknown }

export type SmolJson = {
  agents?: Record<string, AgentOverride>
}

export const SMOL_TO_OC: Record<string, string> = {
  conductor: 'build',
  planner: 'plan',
  coder: 'coder',
  reviewer: 'reviewer',
  mapper: 'mapper',
  scout: 'scout',
}

export async function loadSmolJson(projectRoot: string): Promise<SmolJson> {
  try {
    const txt = await readFile(join(projectRoot, '.smol', 'smol.json'), 'utf8')
    const parsed = JSON.parse(txt)
    return (parsed && typeof parsed === 'object') ? parsed as SmolJson : {}
  } catch {
    return {}
  }
}

export function normalizeOverride(o: AgentOverride): Record<string, unknown> {
  if (typeof o === 'string') return { model: o }
  return { ...o }
}

export function applyOverride(
  base: Record<string, unknown>,
  override: AgentOverride | undefined,
): Record<string, unknown> {
  if (!override) return base
  return { ...base, ...normalizeOverride(override) }
}
