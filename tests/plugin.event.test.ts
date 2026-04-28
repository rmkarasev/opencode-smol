import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { __test__ } from '../plugin.ts'

const { runEvent } = __test__

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'smol-e-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('event hook', () => {
  it('creates wiki files on session.created', async () => {
    await runEvent({ projectRoot: dir }, { event: { type: 'session.created' } })
    expect(existsSync(join(dir, '.smol/wiki/memory.md'))).toBe(true)
    expect(existsSync(join(dir, '.smol/wiki/preferences.md'))).toBe(true)
    expect(existsSync(join(dir, '.smol/wiki/pitfalls.md'))).toBe(true)
  })

  it('is idempotent', async () => {
    await runEvent({ projectRoot: dir }, { event: { type: 'session.created' } })
    await runEvent({ projectRoot: dir }, { event: { type: 'session.created' } })
    expect(existsSync(join(dir, '.smol/wiki/memory.md'))).toBe(true)
  })

  it('ignores other events', async () => {
    await runEvent({ projectRoot: dir }, { event: { type: 'message.updated' } })
    expect(existsSync(join(dir, '.smol/wiki'))).toBe(false)
  })
})
