import { describe, expect, it } from 'vitest'
import { describeScene, toSceneElements } from './query'
import type { RawElement } from './types'

const raw = (over: Partial<RawElement> & { id: string; type: string }): RawElement => ({
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  ...over,
})

describe('toSceneElements', () => {
  it('strips the fields that cost context and mean nothing to a model', () => {
    const [out] = toSceneElements([
      { ...raw({ id: 'a', type: 'rectangle' }), ...({ seed: 1, versionNonce: 2 } as object) },
    ])

    expect(out).not.toHaveProperty('seed')
    expect(out).not.toHaveProperty('versionNonce')
    expect(Object.keys(out).sort()).toEqual(['h', 'id', 'type', 'w', 'x', 'y'])
  })

  it('folds a bound label into its container instead of emitting two elements', () => {
    const out = toSceneElements([
      raw({ id: 'box', type: 'rectangle' }),
      raw({ id: 'label', type: 'text', text: 'Sign in', containerId: 'box' }),
    ])

    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'box', text: 'Sign in' })
  })

  it('keeps free-standing text as its own element', () => {
    const out = toSceneElements([raw({ id: 't', type: 'text', text: 'Welcome' })])

    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 't', type: 'text', text: 'Welcome' })
  })

  it('exposes arrow bindings as from and to', () => {
    const out = toSceneElements([
      raw({
        id: 'arr',
        type: 'arrow',
        startBinding: { elementId: 'a' },
        endBinding: { elementId: 'b' },
      }),
    ])

    expect(out[0]).toMatchObject({ from: 'a', to: 'b' })
  })

  it('skips deleted elements', () => {
    const out = toSceneElements([raw({ id: 'gone', type: 'rectangle', isDeleted: true })])
    expect(out).toEqual([])
  })

  it('filters by type', () => {
    const out = toSceneElements(
      [raw({ id: 'a', type: 'rectangle' }), raw({ id: 'b', type: 'ellipse' })],
      {},
      { types: ['ellipse'] },
    )

    expect(out.map((e) => e.id)).toEqual(['b'])
  })

  it('filters by intersecting bounds, not containment', () => {
    const out = toSceneElements(
      [
        raw({ id: 'in', type: 'rectangle', x: 90, y: 0 }),
        raw({ id: 'out', type: 'rectangle', x: 900, y: 0 }),
      ],
      {},
      { bounds: { x: 0, y: 0, w: 100, h: 100 } },
    )

    expect(out.map((e) => e.id)).toEqual(['in'])
  })

  it('filters to the current selection', () => {
    const out = toSceneElements(
      [raw({ id: 'a', type: 'rectangle' }), raw({ id: 'b', type: 'rectangle' })],
      { b: true },
      { selectedOnly: true },
    )

    expect(out.map((e) => e.id)).toEqual(['b'])
    expect(out[0].selected).toBe(true)
  })

  it('respects the limit so a huge canvas cannot blow the context window', () => {
    const many = Array.from({ length: 50 }, (_, i) => raw({ id: `e${i}`, type: 'rectangle' }))
    expect(toSceneElements(many, {}, { limit: 10 })).toHaveLength(10)
  })

  it('rounds coordinates, since sub-pixel precision is noise to a model', () => {
    const [out] = toSceneElements([raw({ id: 'a', type: 'rectangle', x: 10.4837, y: 20.91 })])
    expect(out.x).toBe(10)
    expect(out.y).toBe(21)
  })
})

describe('describeScene', () => {
  it('summarises an empty canvas', () => {
    expect(describeScene([])).toBe('empty canvas')
  })

  it('counts by type, most common first', () => {
    const summary = describeScene([
      { id: '1', type: 'rectangle', x: 0, y: 0, w: 1, h: 1 },
      { id: '2', type: 'rectangle', x: 0, y: 0, w: 1, h: 1 },
      { id: '3', type: 'arrow', x: 0, y: 0, w: 1, h: 1 },
    ])

    expect(summary).toBe('2 rectangles, 1 arrow')
  })
})
