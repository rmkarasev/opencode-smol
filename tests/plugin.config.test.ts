import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { __test__ } from '../plugin'

const { runConfig } = __test__

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'smol-config-'))
}

describe('runConfig hook', () => {
  it('replaces build with conductor (primary) and plan with planner (primary)', async () => {
    const root = tmp()
    try {
      const config: any = {}
      await runConfig({ projectRoot: root }, config)
      expect(config.agent.build.mode).toBe('primary')
      expect(config.agent.build.prompt).toContain('Conductor')
      expect(config.agent.plan.mode).toBe('primary')
      expect(config.agent.plan.prompt).toContain('Planner')
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('registers coder/reviewer/mapper/scout as subagents', async () => {
    const root = tmp()
    try {
      const config: any = {}
      await runConfig({ projectRoot: root }, config)
      for (const k of ['coder', 'reviewer', 'mapper', 'scout']) {
        expect(config.agent[k].mode).toBe('subagent')
        expect(config.agent[k].prompt).toBeTruthy()
      }
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('applies model override from .smol/smol.json (object form)', async () => {
    const root = tmp()
    try {
      mkdirSync(join(root, '.smol'), { recursive: true })
      writeFileSync(join(root, '.smol', 'smol.json'), JSON.stringify({
        agents: {
          conductor: { model: 'anthropic/claude-sonnet-4-5', variant: 'high' },
          coder: { model: 'openai/gpt-5-codex' },
        },
      }))
      const config: any = {}
      await runConfig({ projectRoot: root }, config)
      expect(config.agent.build.model).toBe('anthropic/claude-sonnet-4-5')
      expect(config.agent.build.variant).toBe('high')
      expect(config.agent.coder.model).toBe('openai/gpt-5-codex')
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('applies model override from string shorthand', async () => {
    const root = tmp()
    try {
      mkdirSync(join(root, '.smol'), { recursive: true })
      writeFileSync(join(root, '.smol', 'smol.json'), JSON.stringify({
        agents: { planner: 'openai/gpt-5-mini' },
      }))
      const config: any = {}
      await runConfig({ projectRoot: root }, config)
      expect(config.agent.plan.model).toBe('openai/gpt-5-mini')
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('preserves existing agent entries from base config', async () => {
    const root = tmp()
    try {
      const config: any = { agent: { custom: { mode: 'subagent', prompt: 'x' } } }
      await runConfig({ projectRoot: root }, config)
      expect(config.agent.custom).toBeTruthy()
      expect(config.agent.build).toBeTruthy()
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('handles malformed smol.json gracefully', async () => {
    const root = tmp()
    try {
      mkdirSync(join(root, '.smol'), { recursive: true })
      writeFileSync(join(root, '.smol', 'smol.json'), '{ not json')
      const config: any = {}
      await expect(runConfig({ projectRoot: root }, config)).resolves.toBeUndefined()
      expect(config.agent.build).toBeTruthy()
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
