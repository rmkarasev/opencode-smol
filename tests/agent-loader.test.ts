import { describe, it, expect } from 'vitest'
import { parseAgentMd } from '../tools/agent-loader'

describe('parseAgentMd', () => {
  it('parses frontmatter scalars', () => {
    const src = `---\nname: foo\nmode: primary\ndescription: bar\n---\n\nbody text`
    const { meta, prompt } = parseAgentMd(src)
    expect(meta.name).toBe('foo')
    expect(meta.mode).toBe('primary')
    expect(meta.description).toBe('bar')
    expect(prompt).toBe('body text')
  })

  it('parses nested tools map', () => {
    const src = `---\nname: foo\ntools:\n  bash: true\n  edit: false\n---\nbody`
    const { meta } = parseAgentMd(src)
    expect(meta.tools).toEqual({ bash: true, edit: false })
  })

  it('returns empty meta when no frontmatter', () => {
    const { meta, prompt } = parseAgentMd('just body')
    expect(meta).toEqual({})
    expect(prompt).toBe('just body')
  })
})
