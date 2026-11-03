import { describe, expect, it } from 'vitest'
import { toRelativePath } from './tauriFileStore'

describe('toRelativePath', () => {
  it('maps absolute to relative and drops ignorable paths', () => {
    expect(toRelativePath('/h/Flow', '/h/Flow/projects/a.md')).toBe('projects/a.md')
    expect(toRelativePath('/h/Flow/', '/h/Flow/inbox.md')).toBe('inbox.md')
    expect(toRelativePath('C:\\h\\Flow', 'C:\\h\\Flow\\days\\x.md')).toBe('days/x.md')
    expect(toRelativePath('/h/Flow', '/h/Flow/inbox.md.tmp')).toBeNull()
    expect(toRelativePath('/h/Flow', '/h/Flow/flow-issues.log')).toBeNull()
    expect(toRelativePath('/h/Flow', '/other/inbox.md')).toBeNull()
  })
})
