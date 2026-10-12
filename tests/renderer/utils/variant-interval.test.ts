/** CNV/SV interval and genome-build context (#539). */
import { describe, expect, it } from 'vitest'

import {
  buildStatus,
  exonsInInterval,
  geneAxisLabel,
  variantBuildNote,
  variantInterval
} from '../../../src/renderer/src/utils/variant-interval'

const exons = [
  { start: 100, end: 200, rank: 1 },
  { start: 400, end: 500, rank: 2 },
  { start: 800, end: 900, rank: 3 }
]

describe('variantInterval', () => {
  it('spans a deletion from POS to END', () => {
    const del = { pos: 150, end_pos: 450, variant_type: 'cnv', sv_type: 'DEL' }
    expect(variantInterval(del)).toEqual({ start: 150, end: 450 })
    expect(exonsInInterval(exons, { start: 150, end: 450 }).map((e) => e.rank)).toEqual([1, 2])
  })

  it('spans a duplication from POS to END', () => {
    const dup = { pos: 300, end_pos: 950, variant_type: 'sv', sv_type: 'DUP' }
    const interval = variantInterval(dup)
    expect(interval).toEqual({ start: 300, end: 950 })
    expect(exonsInInterval(exons, interval!).map((e) => e.rank)).toEqual([2, 3])
  })

  it('keeps breakends, insertions, calls without END and SNVs as points', () => {
    expect(variantInterval({ pos: 150, end_pos: 900, variant_type: 'sv', sv_type: 'BND' })).toBe(
      null
    )
    expect(variantInterval({ pos: 150, end_pos: 150, variant_type: 'sv', sv_type: 'INS' })).toBe(
      null
    )
    expect(variantInterval({ pos: 150, end_pos: null, variant_type: 'cnv', sv_type: 'DEL' })).toBe(
      null
    )
    expect(variantInterval({ pos: 150, end_pos: 151, variant_type: 'snv' })).toBe(null)
  })
})

describe('genome build context', () => {
  it('matches GRCh38 and its alias, flags other builds and unknown', () => {
    expect(buildStatus('GRCh38')).toBe('match')
    expect(buildStatus('hg38')).toBe('match')
    expect(buildStatus('GRCh37')).toBe('mismatch')
    expect(buildStatus(null)).toBe('unknown')
    expect(buildStatus('  ')).toBe('unknown')
  })

  it('labels the axis with the gene model assembly and any build warning', () => {
    expect(geneAxisLabel('17', variantBuildNote('GRCh38'))).toBe(
      'Chromosome 17 (gene model GRCh38)'
    )
    expect(geneAxisLabel('17', variantBuildNote(null))).toBe(
      'Chromosome 17 (gene model GRCh38) · Variant genome build unknown'
    )
    expect(variantBuildNote('hg19')).toBe('Variant is GRCh37: not drawn on the GRCh38 gene model')
  })
})
