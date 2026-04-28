import { describe, it, expect } from 'vitest'
import { detectChanges } from '../tools/codemap.mjs'

describe('detectChanges', () => {
  it('classifies added / modified / removed', () => {
    const prev = { files: { 'a.ts': 'h1', 'b.ts': 'h2', 'src/c.ts': 'h3' } }
    const next = { 'a.ts': 'h1', 'b.ts': 'CHANGED', 'src/d.ts': 'h4' }
    const r = detectChanges(prev, next)
    expect(r.added).toEqual(['src/d.ts'])
    expect(r.modified).toEqual(['b.ts'])
    expect(r.removed).toEqual(['src/c.ts'])
  })

  it('reports changed folders (root represented as ".")', () => {
    const prev = { files: { 'src/a.ts': 'h1' } }
    const next = { 'src/a.ts': 'CHANGED', 'README.md': 'h2' }
    const r = detectChanges(prev, next)
    expect(r.changedFolders.sort()).toEqual(['.', 'src'])
  })

  it('empty prev means everything is added', () => {
    const r = detectChanges({ files: {} }, { 'a.ts': 'h1' })
    expect(r.added).toEqual(['a.ts'])
    expect(r.modified).toEqual([])
    expect(r.removed).toEqual([])
  })
})
