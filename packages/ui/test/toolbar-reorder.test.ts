import { describe, expect, it } from 'vitest'
import { type Box, dropTargetAt } from '../src/toolbar-reorder'

// Two rows of three groups: 100px wide with a 4px gap, 30px tall, 10px apart.
const box = (left: number, top: number): Box => ({ left, right: left + 100, top, bottom: top + 30 })
const boxes = [box(0, 0), box(104, 0), box(208, 0), box(0, 40), box(104, 40), box(208, 40)]

describe('dropTargetAt', () => {
  it('drops before the first group whose centre the pointer has not passed', () => {
    expect(dropTargetAt(boxes, 0, 120, 15)?.before).toBe(1)
    expect(dropTargetAt(boxes, 0, 170, 15)?.before).toBe(2)
  })

  it('drops at the end of a row by landing before the next row', () => {
    expect(dropTargetAt(boxes, 0, 290, 15)?.before).toBe(3)
  })

  it('judges the slot by the other groups, never by the one being dragged', () => {
    expect(dropTargetAt(boxes, 1, 150, 15)?.before).toBe(2)
  })

  it('appends past the last group of the last row', () => {
    expect(dropTargetAt(boxes, 0, 300, 55)?.before).toBeNull()
  })

  it('snaps to the nearest row when the pointer is between rows', () => {
    // Six pixels below the first row, four above the second.
    expect(dropTargetAt(boxes, 0, 40, 36)?.before).toBe(3)
  })

  it('places the insertion bar in the gap beside the slot', () => {
    expect(dropTargetAt(boxes, 0, 120, 15)?.x).toBe(102)
    expect(dropTargetAt(boxes, 0, 290, 15)?.x).toBe(310)
  })

  it('has nowhere to go with a single group', () => {
    expect(dropTargetAt([box(0, 0)], 0, 10, 10)).toBeNull()
  })
})
