import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderTemplate, writeTemplates } from '../tools/codemap.mjs'

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'smol-tpl-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('renderTemplate', () => {
  it('contains required sections and lists files', () => {
    const md = renderTemplate({ folder: 'src/auth', files: ['login.ts', 'token.ts'] })
    expect(md).toMatch(/^# codemap: src\/auth/m)
    expect(md).toMatch(/## Responsibility/)
    expect(md).toMatch(/## Key patterns/)
    expect(md).toMatch(/## Data \/ control flow/)
    expect(md).toMatch(/## Integration points/)
    expect(md).toMatch(/- login\.ts/)
    expect(md).toMatch(/- token\.ts/)
  })
})

describe('writeTemplates', () => {
  it('writes templates for new folders, preserves existing', async () => {
    const allFiles = ['src/auth/login.ts', 'src/auth/token.ts', 'README.md']
    await writeTemplates(dir, ['src/auth', '.'], allFiles)
    expect(existsSync(join(dir, '.smol/src/auth/codemap.md'))).toBe(true)
    expect(existsSync(join(dir, '.smol/codemap.md'))).toBe(true)

    // Pretend LLM filled it in
    writeFileSync(join(dir, '.smol/src/auth/codemap.md'), 'FILLED')
    await writeTemplates(dir, ['src/auth'], allFiles)
    expect(readFileSync(join(dir, '.smol/src/auth/codemap.md'), 'utf8')).toBe('FILLED')
  })
})
