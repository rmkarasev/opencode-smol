import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { walkFiles } from '../tools/codemap.mjs'

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'smol-walk-'))
  mkdirSync(join(dir, 'src'), { recursive: true })
  mkdirSync(join(dir, 'node_modules', 'foo'), { recursive: true })
  writeFileSync(join(dir, 'src', 'a.ts'), 'a')
  writeFileSync(join(dir, 'src', 'b.ts'), 'b')
  writeFileSync(join(dir, 'README.md'), 'r')
  writeFileSync(join(dir, 'node_modules', 'foo', 'x.js'), 'x')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('walkFiles', () => {
  it('lists all files relative to root, POSIX-separated, sorted', async () => {
    const files = await walkFiles(dir)
    expect(files).toEqual([
      'README.md',
      'node_modules/foo/x.js',
      'src/a.ts',
      'src/b.ts',
    ])
  })

  it('honours exclude patterns', async () => {
    const files = await walkFiles(dir, { exclude: ['node_modules/**'] })
    expect(files).toEqual(['README.md', 'src/a.ts', 'src/b.ts'])
  })

  it('honours include patterns', async () => {
    const files = await walkFiles(dir, { include: ['src/**/*.ts'] })
    expect(files).toEqual(['src/a.ts', 'src/b.ts'])
  })
})
