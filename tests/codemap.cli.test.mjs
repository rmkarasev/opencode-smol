import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const CLI = resolve('tools/codemap.mjs')
let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'smol-cli-'))
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'src', 'a.ts'), 'a')
  writeFileSync(join(dir, 'README.md'), 'r')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function run(args) {
  return execFileSync('node', [CLI, ...args, '--root', dir], { encoding: 'utf8' })
}

describe('codemap CLI', () => {
  it('init creates .smol/codemap.json and per-folder templates', () => {
    run(['init'])
    expect(existsSync(join(dir, '.smol/codemap.json'))).toBe(true)
    expect(existsSync(join(dir, '.smol/codemap.md'))).toBe(true)
    expect(existsSync(join(dir, '.smol/src/codemap.md'))).toBe(true)
    const state = JSON.parse(readFileSync(join(dir, '.smol/codemap.json'), 'utf8'))
    expect(Object.keys(state.files).sort()).toEqual(['README.md', 'src/a.ts'])
  })

  it('changes reports nothing right after init', () => {
    run(['init'])
    const out = JSON.parse(run(['changes']))
    expect(out.added).toEqual([])
    expect(out.modified).toEqual([])
    expect(out.removed).toEqual([])
  })

  it('changes detects modification', () => {
    run(['init'])
    writeFileSync(join(dir, 'src', 'a.ts'), 'aa')
    const out = JSON.parse(run(['changes']))
    expect(out.modified).toEqual(['src/a.ts'])
  })

  it('update refreshes state and adds new folder templates', () => {
    run(['init'])
    mkdirSync(join(dir, 'lib'), { recursive: true })
    writeFileSync(join(dir, 'lib', 'x.ts'), 'x')
    run(['update'])
    expect(existsSync(join(dir, '.smol/lib/codemap.md'))).toBe(true)
    const state = JSON.parse(readFileSync(join(dir, '.smol/codemap.json'), 'utf8'))
    expect(state.files['lib/x.ts']).toMatch(/^[0-9a-f]{64}$/)
  })
})
