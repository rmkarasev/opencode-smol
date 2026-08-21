import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { __test__ } from '../plugin.ts'

const { runCompacting } = __test__

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'smol-c-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('compacting hook', () => {
  it('injects latest plan into context', async () => {
    mkdirSync(join(dir, '.smol/plans'), { recursive: true })
    writeFileSync(join(dir, '.smol/codemap.md'), '# codemap\nfile a -> b\n'.repeat(50))
    writeFileSync(join(dir, '.smol/plans/2026-04-28-foo.md'), '# plan foo')
    writeFileSync(join(dir, '.smol/plans/2026-04-29-bar.md'), '# plan bar')
    const out: { context: string[]; prompt?: string } = { context: [] }
    await runCompacting({ projectRoot: dir }, out)
    expect(out.context.length).toBeGreaterThanOrEqual(1)
    expect(out.context.some((c) => c.includes('plan bar'))).toBe(true)
    expect(out.context.some((c) => c.includes('codemap'))).toBe(false)
  })

  it('truncates large plan to MAX_BYTES', async () => {
    mkdirSync(join(dir, '.smol/plans'), { recursive: true })
    writeFileSync(join(dir, '.smol/plans/2026-04-29-big.md'), 'x'.repeat(10_000))
    const out: { context: string[]; prompt?: string } = { context: [] }
    await runCompacting({ projectRoot: dir }, out)
    expect(out.context[0]).toMatch(/truncated/)
  })

  it('is a no-op when .smol does not exist', async () => {
    const out: { context: string[]; prompt?: string } = { context: [] }
    await runCompacting({ projectRoot: dir }, out)
    expect(out.context.length).toBe(0)
  })
})
