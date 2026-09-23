import { describe, expect, it } from 'vitest'
import { validateSpecs } from './validate'

/**
 * Validation exists so a model gets a sentence it can act on instead of a
 * broken canvas. Every failure message here is read by an agent, so the tests
 * assert on the message content, not just that something failed.
 */

function errorsFor(input: unknown): string[] {
  const result = validateSpecs(input)
  return result.ok ? [] : result.errors
}

describe('validateSpecs', () => {
  it('accepts a minimal valid spec', () => {
    const result = validateSpecs([{ kind: 'box', x: 0, y: 0, w: 10, h: 10 }])
    expect(result.ok).toBe(true)
  })

  it('applies schema defaults', () => {
    const result = validateSpecs([{ kind: 'box', x: 0, y: 0, w: 10, h: 10 }])
    if (!result.ok) throw new Error('expected success')
    expect(result.specs[0]).toMatchObject({ shape: 'rectangle' })
  })

  it('rejects an arrow pointing at an id that does not exist', () => {
    const errors = errorsFor([
      { kind: 'box', id: 'a', x: 0, y: 0, w: 10, h: 10 },
      { kind: 'arrow', from: { ref: 'a' }, to: { ref: 'ghost' } },
    ])

    expect(errors.some((e) => e.includes("unknown id 'ghost'"))).toBe(true)
  })

  it('rejects an arrow bound to text, which would detach on first drag', () => {
    const errors = errorsFor([
      { kind: 'text', id: 't', x: 0, y: 0, text: 'hi' },
      { kind: 'box', id: 'b', x: 0, y: 0, w: 10, h: 10 },
      { kind: 'arrow', from: { ref: 'b' }, to: { ref: 't' } },
    ])

    expect(errors.some((e) => e.includes('not a bindable shape'))).toBe(true)
  })

  it('rejects duplicate ids, which would silently overwrite', () => {
    const errors = errorsFor([
      { kind: 'box', id: 'same', x: 0, y: 0, w: 10, h: 10 },
      { kind: 'box', id: 'same', x: 50, y: 0, w: 10, h: 10 },
    ])

    expect(errors.some((e) => e.includes("duplicate id 'same'"))).toBe(true)
  })

  it('rejects a zero-area box', () => {
    expect(errorsFor([{ kind: 'box', x: 0, y: 0, w: 0, h: 10 }]).length).toBeGreaterThan(0)
  })

  it('rejects a malformed colour', () => {
    const errors = errorsFor([{ kind: 'box', x: 0, y: 0, w: 10, h: 10, stroke: 'reddish' }])
    expect(errors.some((e) => e.includes('hex'))).toBe(true)
  })

  it('rejects non-finite coordinates', () => {
    expect(errorsFor([{ kind: 'box', x: Infinity, y: 0, w: 10, h: 10 }]).length).toBeGreaterThan(0)
    expect(errorsFor([{ kind: 'box', x: NaN, y: 0, w: 10, h: 10 }]).length).toBeGreaterThan(0)
  })

  it('rejects an unknown kind', () => {
    expect(errorsFor([{ kind: 'hologram', x: 0, y: 0 }]).length).toBeGreaterThan(0)
  })

  it('rejects an empty batch', () => {
    expect(errorsFor([]).length).toBeGreaterThan(0)
  })

  it('names the offending field so an agent can fix it', () => {
    const errors = errorsFor([{ kind: 'box', x: 0, y: 0, w: 10 }])
    expect(errors.join(' ')).toMatch(/h/)
  })

  it('accepts arrows between bare coordinates with no references at all', () => {
    const result = validateSpecs([{ kind: 'arrow', from: { x: 0, y: 0 }, to: { x: 100, y: 100 } }])
    expect(result.ok).toBe(true)
  })
})
