import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { __test__ } from '../plugin.ts'

const { runSystemTransform } = __test__

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'smol-plugin-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('session-start system transform', () => {
  it('appends the smol pointer line to system prompt', async () => {
    const output = { system: [] as string[] }
    await runSystemTransform({ projectRoot: dir }, output)
    expect(output.system.length).toBe(1)
    expect(output.system[0]).toMatch(/<smol>/)
    expect(output.system[0]).toMatch(/\.smol\/codemap\.md/)
    expect(output.system[0]).toMatch(/\.smol\/wiki/)
  })

  it('does not create wiki files (handled by event hook)', async () => {
    const output = { system: [] as string[] }
    await runSystemTransform({ projectRoot: dir }, output)
    expect(existsSync(join(dir, '.smol/wiki'))).toBe(false)
  })
})
