/** The gene-structure variant marker: a band for CNV/SV intervals, a lollipop for points (#539). */
import { describe, expect, it } from 'vitest'
import * as d3 from 'd3'

import {
  drawVariantMarker,
  positionVariantMarker,
  type GenomicVariant
} from '../../../src/renderer/src/composables/gene-structure-variant-layer'

const xScale = d3.scaleLinear().domain([0, 1000]).range([0, 1000])

function draw(v: GenomicVariant): SVGGElement {
  const svg = d3.select(document.body).append('svg')
  const g = svg.append('g')
  drawVariantMarker(g, xScale, 100, 28, v, () => undefined)
  return g.node()!
}

const base = { chr: '1', ref: 'N', alt: '<DEL>', color: '#D32F2F' }

describe('drawVariantMarker', () => {
  it('draws a deletion as a start/end band', () => {
    const g = draw({ ...base, pos: 150, end: 450, label: 'DEL 1:150-450' })
    const band = g.querySelector('.variant-interval')!
    expect(band.getAttribute('x')).toBe('150')
    expect(band.getAttribute('width')).toBe('300')
    expect(g.querySelector('circle')).toBeNull()
    expect(g.querySelector('text')!.getAttribute('x')).toBe('300')
  })

  it('draws an SNV or breakend as a lollipop at POS', () => {
    for (const end of [undefined, null]) {
      const g = draw({ ...base, pos: 600, end, label: 'BND' })
      expect(g.querySelector('.variant-interval')).toBeNull()
      expect(g.querySelector('line')!.getAttribute('x1')).toBe('600')
      expect(g.querySelectorAll('circle')).toHaveLength(2)
    }
  })

  it('repositions the band on zoom', () => {
    const v = { ...base, pos: 100, end: 200, label: 'DUP' }
    const g = draw(v)
    positionVariantMarker(d3.select(g), xScale.copy().range([0, 2000]), v)
    const band = g.querySelector('.variant-interval')!
    expect(band.getAttribute('x')).toBe('200')
    expect(band.getAttribute('width')).toBe('200')
  })
})
