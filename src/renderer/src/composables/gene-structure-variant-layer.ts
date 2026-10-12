/**
 * The user's variant on the gene-structure plot: a lollipop at a point
 * (SNV/indel/breakend) or a start/end band for a CNV/SV interval (#539).
 */
import * as d3 from 'd3'

const STEM_HEIGHT = 60
const HEAD_RADIUS = 8
const BAND_PAD = 8
export const VARIANT_COLOR = '#D32F2F'

/** Variant position on the gene structure; `end` makes it an interval. */
export interface GenomicVariant {
  chr: string
  pos: number
  /** Interval end for CNV/SV calls; absent or null renders a point. */
  end?: number | null
  ref: string
  alt: string
  label: string
  color: string
}

type Group = d3.Selection<SVGGElement, unknown, null, undefined>
type Scale = d3.ScaleLinear<number, number>

export function isInterval(v: GenomicVariant): v is GenomicVariant & { end: number } {
  return v.end !== null && v.end !== undefined && v.end > v.pos
}

export function drawVariantMarker(
  parent: Group,
  xScale: Scale,
  backboneY: number,
  exonHeight: number,
  v: GenomicVariant,
  onHover: (event: MouseEvent | null) => void
): void {
  const group = parent.append('g').attr('class', 'variant-marker')
  const exonTop = backboneY - exonHeight / 2
  const labelY = isInterval(v) ? exonTop - BAND_PAD - 8 : exonTop - STEM_HEIGHT - HEAD_RADIUS - 8
  const hoverable = (sel: d3.Selection<SVGElement, unknown, null, undefined>): void => {
    sel
      .attr('cursor', 'pointer')
      .on('mouseenter', (e: MouseEvent) => onHover(e))
      .on('mousemove', (e: MouseEvent) => onHover(e))
      .on('mouseleave', () => onHover(null))
  }

  if (isInterval(v)) {
    const band = group
      .append('rect')
      .attr('class', 'variant-interval')
      .attr('y', exonTop - BAND_PAD)
      .attr('height', exonHeight + BAND_PAD * 2)
      .attr('fill', VARIANT_COLOR)
      .attr('fill-opacity', 0.18)
      .attr('stroke', VARIANT_COLOR)
      .attr('stroke-width', 1.5)
    hoverable(band as unknown as d3.Selection<SVGElement, unknown, null, undefined>)
  } else {
    const stemTop = exonTop - STEM_HEIGHT
    group
      .append('line')
      .attr('y1', exonTop)
      .attr('y2', stemTop)
      .attr('stroke', VARIANT_COLOR)
      .attr('stroke-width', 2.5)
    group
      .append('circle')
      .attr('cy', stemTop)
      .attr('r', HEAD_RADIUS + 3)
      .attr('fill', 'none')
      .attr('stroke', '#FFD700')
      .attr('stroke-width', 2)
      .attr('opacity', 0.4)
    const head = group
      .append('circle')
      .attr('cy', stemTop)
      .attr('r', HEAD_RADIUS)
      .attr('fill', VARIANT_COLOR)
      .attr('stroke', '#FFD700')
      .attr('stroke-width', 2.5)
    hoverable(head as unknown as d3.Selection<SVGElement, unknown, null, undefined>)
  }

  group
    .append('text')
    .attr('y', labelY)
    .attr('text-anchor', 'middle')
    .attr('fill', '#333')
    .attr('font-size', '12px')
    .attr('font-weight', '700')
    .text(v.label)

  positionVariantMarker(parent, xScale, v)
}

/** Place (or re-place after zoom) the marker drawn by `drawVariantMarker`. */
export function positionVariantMarker(
  parent: d3.Selection<d3.BaseType, unknown, null, undefined> | Group,
  xScale: Scale,
  v: GenomicVariant
): void {
  const group = parent.select('.variant-marker')
  if (isInterval(v)) {
    const x1 = xScale(v.pos)
    const x2 = xScale(v.end)
    group
      .select('rect')
      .attr('x', x1)
      .attr('width', Math.max(2, x2 - x1))
    group.select('text').attr('x', (x1 + x2) / 2)
    return
  }
  const vx = xScale(v.pos)
  group.selectAll('line').attr('x1', vx).attr('x2', vx)
  group.selectAll('circle').attr('cx', vx)
  group.select('text').attr('x', vx)
}
