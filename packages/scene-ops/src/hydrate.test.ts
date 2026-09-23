import { describe, expect, it } from 'vitest'
import { validateSpecs } from './validate'
import { hydrate } from './hydrate'

/**
 * The contract that matters: a spec an agent could plausibly write must hydrate
 * into something structurally sound. Labels bound to their shape, arrows bound
 * to their endpoints. A diagram that looks right but detaches on first drag is
 * the exact failure this package exists to prevent.
 */

function hydrateOrThrow(input: unknown) {
  const result = validateSpecs(input)
  if (!result.ok) throw new Error(`validation failed: ${result.errors.join('; ')}`)
  return hydrate(result.specs)
}

describe('hydrate', () => {
  it('binds a label to its shape rather than emitting a floating text element', () => {
    const [box] = hydrateOrThrow([
      { kind: 'box', x: 0, y: 0, w: 200, h: 60, label: 'Email address' },
    ])

    expect(box.type).toBe('rectangle')
    // The `label` key is what makes upstream wire containerId and boundElements.
    // A separate text element in the output would be the bug.
    expect(box.label).toEqual({ text: 'Email address' })
  })

  it('binds arrows to referenced shapes by id', () => {
    const out = hydrateOrThrow([
      { kind: 'box', id: 'a', x: 0, y: 0, w: 100, h: 50 },
      { kind: 'box', id: 'b', x: 300, y: 0, w: 100, h: 50 },
      { kind: 'arrow', from: { ref: 'a' }, to: { ref: 'b' }, label: 'submits' },
    ])

    const arrow = out[2]
    expect(arrow.type).toBe('arrow')
    expect(arrow.start).toEqual({ id: 'a' })
    expect(arrow.end).toEqual({ id: 'b' })
    expect(arrow.label).toEqual({ text: 'submits' })
    // Points and bindings together make upstream fight itself over placement.
    expect(arrow.points).toBeUndefined()
  })

  it('resolves references declared after the arrow', () => {
    const out = hydrateOrThrow([
      { kind: 'arrow', from: { ref: 'a' }, to: { ref: 'b' } },
      { kind: 'box', id: 'a', x: 0, y: 0, w: 100, h: 50 },
      { kind: 'box', id: 'b', x: 300, y: 0, w: 100, h: 50 },
    ])

    expect(out[0].start).toEqual({ id: 'a' })
    expect(out[0].end).toEqual({ id: 'b' })
  })

  it('uses relative points for an arrow between bare coordinates', () => {
    const [arrow] = hydrateOrThrow([
      { kind: 'arrow', from: { x: 100, y: 100 }, to: { x: 260, y: 180 } },
    ])

    expect(arrow.x).toBe(100)
    expect(arrow.y).toBe(100)
    // Excalidraw stores a linear path as offsets from the element origin, not
    // as absolute scene coordinates.
    expect(arrow.points).toEqual([
      [0, 0],
      [160, 80],
    ])
  })

  it('omits style fields entirely when unset so canvas defaults win', () => {
    const [box] = hydrateOrThrow([{ kind: 'box', x: 0, y: 0, w: 10, h: 10 }])

    expect(box).not.toHaveProperty('strokeColor')
    expect(box).not.toHaveProperty('backgroundColor')
    expect(box).not.toHaveProperty('opacity')
  })

  it('passes through style fields that are set', () => {
    const [box] = hydrateOrThrow([
      { kind: 'box', x: 0, y: 0, w: 10, h: 10, stroke: '#ff0000', strokeWidth: 4, opacity: 50 },
    ])

    expect(box.strokeColor).toBe('#ff0000')
    expect(box.strokeWidth).toBe(4)
    expect(box.opacity).toBe(50)
  })

  it('honours the shape field', () => {
    const out = hydrateOrThrow([
      { kind: 'box', shape: 'ellipse', x: 0, y: 0, w: 10, h: 10 },
      { kind: 'box', shape: 'diamond', x: 0, y: 0, w: 10, h: 10 },
    ])

    expect(out.map((s) => s.type)).toEqual(['ellipse', 'diamond'])
  })

  it('generates ids when the agent omits them, and keeps them unique', () => {
    const out = hydrateOrThrow([
      { kind: 'box', x: 0, y: 0, w: 10, h: 10 },
      { kind: 'box', x: 20, y: 0, w: 10, h: 10 },
      { kind: 'text', x: 0, y: 40, text: 'hello' },
    ])

    const ids = out.map((s) => s.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids.every((id) => typeof id === 'string' && (id as string).length > 0)).toBe(true)
  })

  it('locks placed images by default', () => {
    const [image] = hydrateOrThrow([{ kind: 'image', fileId: 'f1', x: 0, y: 0, w: 100, h: 100 }])

    expect(image.locked).toBe(true)
  })

  it('hydrates a full login wireframe without losing anything', () => {
    const out = hydrateOrThrow([
      { kind: 'box', id: 'card', x: 0, y: 0, w: 320, h: 260 },
      { kind: 'box', id: 'email', x: 24, y: 60, w: 272, h: 44, label: 'Email' },
      { kind: 'box', id: 'pass', x: 24, y: 120, w: 272, h: 44, label: 'Password' },
      { kind: 'box', id: 'submit', x: 24, y: 190, w: 272, h: 44, label: 'Sign in' },
      { kind: 'text', x: 24, y: 20, text: 'Welcome back' },
      { kind: 'arrow', from: { ref: 'pass' }, to: { ref: 'submit' } },
    ])

    expect(out).toHaveLength(6)
    expect(out.filter((s) => s.label).length).toBe(3)
    expect(out[5].start).toEqual({ id: 'pass' })
  })
})
