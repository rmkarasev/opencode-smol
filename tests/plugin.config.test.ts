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
  it('keeps build visible, demotes plan, makes conductor default', async () => {
    const root = tmp()
    try {
      const config: any = { agent: { build: { prompt: 'orig-build' }, plan: { prompt: 'orig-plan' } } }
      await runConfig({ projectRoot: root }, config)
      expect(config.agent.conductor.mode).toBe('primary')
      expect(config.agent.conductor.prompt).toContain('Conductor')
      expect(config.agent.planner.mode).toBe('primary')
      expect(config.agent.planner.prompt).toContain('Planner')
      // build stays as-is (untouched)
      expect(config.agent.build.mode).toBeUndefined()
      expect(config.agent.build.hidden).toBeUndefined()
      expect(config.agent.build.prompt).toBe('orig-build')
      // plan is demoted
      expect(config.agent.plan.mode).toBe('subagent')
      expect(config.agent.plan.hidden).toBe(true)
      expect(config.default_agent).toBe('conductor')
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
      expect(config.agent.conductor.model).toBe('anthropic/claude-sonnet-4-5')
      expect(config.agent.conductor.variant).toBe('high')
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
      expect(config.agent.planner.model).toBe('openai/gpt-5-mini')
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('preserves existing custom agent entries', async () => {
    const root = tmp()
    try {
      const config: any = { agent: { custom: { mode: 'subagent', prompt: 'x' } } }
      await runConfig({ projectRoot: root }, config)
      expect(config.agent.custom).toBeTruthy()
      expect(config.agent.conductor).toBeTruthy()
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('respects user-set default_agent', async () => {
    const root = tmp()
    try {
      const config: any = { default_agent: 'mycustom' }
      await runConfig({ projectRoot: root }, config)
      expect(config.default_agent).toBe('mycustom')
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('defaults every smol agent to opencode/big-pickle (free model)', async () => {
    const root = tmp()
    try {
      const config: any = {}
      await runConfig({ projectRoot: root }, config)
      for (const k of ['conductor', 'planner', 'coder', 'reviewer', 'mapper', 'scout']) {
        expect(config.agent[k].model).toBe('opencode/big-pickle')
      }
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('registers all 6 slash commands programmatically with template + agent', async () => {
    const root = tmp()
    try {
      const config: any = {}
      await runConfig({ projectRoot: root }, config)
      for (const name of ['smol-plan', 'smol-build', 'smol-review', 'smol-auto', 'smol-fast', 'smol-map']) {
        const cmd = config.command[name]
        expect(cmd, `command ${name} should exist`).toBeTruthy()
        expect(cmd.template).toBeTruthy()
        expect(cmd.agent).toBeTruthy()
        expect(cmd.description).toBeTruthy()
      }
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('appends bundled skills directory to config.skills.paths', async () => {
    const root = tmp()
    try {
      const config: any = {}
      await runConfig({ projectRoot: root }, config)
      expect(Array.isArray(config.skills.paths)).toBe(true)
      const hasSmolSkills = config.skills.paths.some((p: string) => p.endsWith('skills'))
      expect(hasSmolSkills).toBe(true)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('does not duplicate skills path on repeated runs', async () => {
    const root = tmp()
    try {
      const config: any = {}
      await runConfig({ projectRoot: root }, config)
      await runConfig({ projectRoot: root }, config)
      const occurrences = config.skills.paths.filter((p: string) => p.endsWith('skills')).length
      expect(occurrences).toBe(1)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('handles malformed smol.json gracefully', async () => {
    const root = tmp()
    try {
      mkdirSync(join(root, '.smol'), { recursive: true })
      writeFileSync(join(root, '.smol', 'smol.json'), '{ not json')
      const config: any = {}
      await expect(runConfig({ projectRoot: root }, config)).resolves.toBeUndefined()
      expect(config.agent.conductor).toBeTruthy()
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
