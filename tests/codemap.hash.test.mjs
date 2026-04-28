import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashFile, hashFiles } from '../tools/codemap.mjs'

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'smol-hash-'))
  writeFileSync(join(dir, 'a.txt'), 'hello')
  writeFileSync(join(dir, 'b.txt'), 'world')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('hashFile / hashFiles', () => {
  it('produces deterministic sha256 for content', async () => {
    const h1 = await hashFile(join(dir, 'a.txt'))
    const h2 = await hashFile(join(dir, 'a.txt'))
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('different content yields different hash', async () => {
    const a = await hashFile(join(dir, 'a.txt'))
    const b = await hashFile(join(dir, 'b.txt'))
    expect(a).not.toBe(b)
  })

  it('hashFiles returns map keyed by relative path', async () => {
    const map = await hashFiles(dir, ['a.txt', 'b.txt'])
    expect(Object.keys(map).sort()).toEqual(['a.txt', 'b.txt'])
    expect(map['a.txt']).toMatch(/^[0-9a-f]{64}$/)
  })
})
