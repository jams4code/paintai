import { describe, expect, it } from 'vitest'
import { arrange } from './layout'
import type { SceneElement } from '@paintai/protocol'

const el = (id: string, x: number, y: number, w = 100, h = 50): SceneElement => ({
  id,
  type: 'rectangle',
  x,
  y,
  w,
  h,
})

describe('arrange', () => {
  it('aligns left edges to the leftmost element', () => {
    const moves = arrange([el('a', 10, 0), el('b', 70, 60), el('c', 40, 120)], {
      op: 'align',
      edge: 'left',
    })

    expect(moves.every((m) => m.x === 10)).toBe(true)
    // 'a' is already at x=10 and should not be emitted as a move.
    expect(moves.map((m) => m.id).sort()).toEqual(['b', 'c'])
  })

  it('aligns right edges accounting for differing widths', () => {
    const moves = arrange([el('a', 0, 0, 100), el('b', 0, 60, 40)], {
      op: 'align',
      edge: 'right',
    })

    const b = moves.find((m) => m.id === 'b')
    expect(b?.x).toBe(60) // right edge 100, minus its own width 40
  })

  it('centres on the x axis', () => {
    const moves = arrange([el('a', 0, 0, 100), el('b', 0, 60, 40)], {
      op: 'align',
      edge: 'centerX',
    })

    expect(moves.find((m) => m.id === 'b')?.x).toBe(30)
  })

  it('distributes by gap, not by centre, so mixed sizes look right', () => {
    const moves = arrange([el('a', 0, 0, 100), el('b', 150, 0, 40), el('c', 400, 0, 60)], {
      op: 'distribute',
      axis: 'horizontal',
    })

    const byId = new Map(moves.map((m) => [m.id, m]))
    const bx = byId.get('b')?.x ?? 150

    // span 0..460 = 460, occupied 100+40+60 = 200, two gaps of 130 each.
    expect(bx).toBeCloseTo(230, 5)
  })

  it('leaves the outermost elements in place when distributing', () => {
    const moves = arrange([el('a', 0, 0, 100), el('b', 150, 0, 40), el('c', 400, 0, 60)], {
      op: 'distribute',
      axis: 'horizontal',
    })

    expect(moves.map((m) => m.id)).not.toContain('a')
    expect(moves.map((m) => m.id)).not.toContain('c')
  })

  it('needs at least three elements to distribute', () => {
    expect(
      arrange([el('a', 0, 0), el('b', 100, 0)], { op: 'distribute', axis: 'horizontal' }),
    ).toEqual([])
  })

  it('snaps to an 8px grid', () => {
    const moves = arrange([el('a', 13, 27), el('b', 4, 4)], { op: 'grid', size: 8 })
    const byId = new Map(moves.map((m) => [m.id, m]))

    expect(byId.get('a')).toMatchObject({ x: 16, y: 24 })
    expect(byId.get('b')).toMatchObject({ x: 8, y: 8 })
  })

  it('packs with a fixed gap in the existing bounds', () => {
    const moves = arrange([el('a', 0, 0, 100), el('b', 500, 0, 60)], {
      op: 'pack',
      axis: 'horizontal',
      gap: 20,
    })

    expect(moves.find((m) => m.id === 'b')?.x).toBe(120)
  })

  it('emits nothing when everything is already in place', () => {
    const moves = arrange([el('a', 0, 0), el('b', 0, 60)], { op: 'align', edge: 'left' })
    expect(moves).toEqual([])
  })

  it('handles an empty selection', () => {
    expect(arrange([], { op: 'grid', size: 8 })).toEqual([])
  })

  it('never emits a move for an element it was not given', () => {
    const moves = arrange([el('a', 13, 13)], { op: 'grid', size: 8 })
    expect(moves.every((m) => m.id === 'a')).toBe(true)
  })
})
