import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { __test__ } from '../tools/plugin-tools.ts'

const { runCodemap, runWiki, runPlan } = __test__

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'smol-pt-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('smol_codemap tool', () => {
  it('init creates .smol/codemap.json', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src/a.ts'), 'export const a = 1')
    const result = await runCodemap({ action: 'init' }, { directory: dir })
    expect(existsSync(join(dir, '.smol/codemap.json'))).toBe(true)
    expect(typeof result).toBe('string')
  })
})

describe('smol_wiki tool', () => {
  it('appends a dated entry', async () => {
    await runWiki(
      { kind: 'memory', entry: 'uses pnpm not npm' },
      { directory: dir },
    )
    const txt = readFileSync(join(dir, '.smol/wiki/memory.md'), 'utf8')
    expect(txt).toMatch(/uses pnpm not npm/)
    expect(txt).toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('dedups identical entries', async () => {
    await runWiki(
      { kind: 'memory', entry: 'uses pnpm not npm' },
      { directory: dir },
    )
    await runWiki(
      { kind: 'memory', entry: 'uses pnpm not npm' },
      { directory: dir },
    )
    const txt = readFileSync(join(dir, '.smol/wiki/memory.md'), 'utf8')
    const matches = txt.match(/uses pnpm not npm/g) ?? []
    expect(matches.length).toBe(1)
  })

  it('rejects entries longer than 200 chars', async () => {
    await expect(
      runWiki({ kind: 'memory', entry: 'x'.repeat(201) }, { directory: dir }),
    ).rejects.toThrow(/200/)
  })
})

describe('smol_plan tool', () => {
  it('writes a dated plan file under .smol/plans/', async () => {
    const result = await runPlan(
      { topic: 'auth refactor', content: '# plan\n- step 1' },
      { directory: dir },
    )
    const files = readdirSync(join(dir, '.smol/plans'))
    expect(files.length).toBe(1)
    expect(files[0]).toMatch(/\d{4}-\d{2}-\d{2}-\d{4}-auth-refactor\.md$/)
    expect(result).toMatch(/auth-refactor/)
    expect(readFileSync(join(dir, '.smol/plans', files[0]!), 'utf8')).toBe(
      '# plan\n- step 1',
    )
  })
})
