// @vitest-environment node
/**
 * Cohort column filters must constrain the rows or fail, on both backends
 * (#528). The DSL sends CADD as `cadd` while the cohort column is
 * `cadd_phred`; SQLite used to drop the unknown key silently (so
 * `cadd >= 1000` returned every row) and PostgreSQL had no cDNA / protein
 * change mapping. Each request runs against real rows: SQLite always,
 * PostgreSQL when VARLENS_RUN_POSTGRES_E2E=1 (`make pg-up`).
 */
import { randomBytes } from 'node:crypto'

import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DatabaseService } from '../../../src/main/database'
import { POSTGRES_MIGRATIONS } from '../../../src/main/storage/postgres/migrations/definitions'
import { PostgresMigrationRunner } from '../../../src/main/storage/postgres/migrations/PostgresMigrationRunner'
import { PostgresCohortRepository } from '../../../src/main/storage/postgres/PostgresCohortRepository'
import { PostgresCohortSummaryRepository } from '../../../src/main/storage/postgres/PostgresCohortSummaryRepository'
import type { CohortSearchParams } from '../../../src/shared/types/cohort'
import type { ColumnFiltersParam } from '../../../src/shared/types/column-filters'

const RUN_PG = process.env.VARLENS_RUN_POSTGRES_E2E === '1'
const PG_URL =
  process.env.VARLENS_PG_URL ??
  'postgres://varlens:varlens_dev_password@127.0.0.1:55432/varlens_dev'

interface Row {
  chr: string
  pos: number
  ref: string
  alt: string
  variant_type: string
  end_pos: number | null
  gene_symbol: string
  cadd: number | null
  cdna: string | null
  aa_change: string | null
}

/** variant_cnv.copy_number of the CNV row (pos 1000). */
const CNV_COPY_NUMBER = 4

const ROWS: Row[] = [
  {
    chr: '1',
    pos: 100,
    ref: 'A',
    alt: 'T',
    variant_type: 'snv',
    end_pos: null,
    gene_symbol: 'BRCA1',
    cadd: 32.5,
    cdna: 'c.100A>T',
    aa_change: 'p.Lys34Ter'
  },
  {
    chr: '2',
    pos: 200,
    ref: 'C',
    alt: 'G',
    variant_type: 'snv',
    end_pos: null,
    gene_symbol: 'TP53',
    cadd: null,
    cdna: 'c.200C>G',
    aa_change: 'p.Arg67Gly'
  },
  {
    chr: '3',
    pos: 300,
    ref: 'G',
    alt: 'A',
    variant_type: 'snv',
    end_pos: null,
    gene_symbol: 'MYH7',
    cadd: 12,
    cdna: 'c.300G>A',
    aa_change: null
  },
  {
    chr: '7',
    pos: 1000,
    ref: 'N',
    alt: '<DUP>',
    variant_type: 'cnv',
    end_pos: 5000,
    gene_symbol: 'SPAN',
    cadd: null,
    cdna: null,
    aa_change: null
  }
]

/**
 * Request → expected positions, identical on both backends. Base-column range
 * filters keep rows without a value unless `includeEmpty: false` (see
 * ColumnFilter.includeEmpty), so CADD-less 200 and 1000 pass `cadd >= x`.
 */
const EXPECTED: Array<[string, ColumnFiltersParam, number[]]> = [
  ['DSL cadd >= 1000', { cadd: { operator: '>=', value: 1000 } }, [200, 1000]],
  [
    'DSL cadd >= 1000 without empty values',
    { cadd: { operator: '>=', value: 1000, includeEmpty: false } },
    []
  ],
  ['DSL cadd >= 20', { cadd: { operator: '>=', value: 20 } }, [100, 200, 1000]],
  [
    'DSL cadd >= 20 without empty values',
    { cadd: { operator: '>=', value: 20, includeEmpty: false } },
    [100]
  ],
  [
    'legacy cadd_phred >= 20 without empty values',
    { cadd_phred: { operator: '>=', value: 20, includeEmpty: false } },
    [100]
  ],
  ['cadd has no value', { cadd: { operator: 'is_null' } }, [200, 1000]],
  ['cadd has a value', { cadd: { operator: 'not_null' } }, [100, 300]],
  ['cDNA contains', { cdna: { operator: 'like', value: 'c.2' } }, [200]],
  ['cDNA equals', { cdna: { operator: '=', value: 'c.100A>T' } }, [100]],
  ['protein change contains', { aa_change: { operator: 'like', value: 'Arg67' } }, [200]],
  ['protein change has no value', { aa_change: { operator: 'is_null' } }, [300, 1000]],
  ['extension filter', { 'cnv.copy_number': { operator: '>', value: 3 } }, [1000]],
  [
    'extension filter with a base filter',
    {
      'cnv.copy_number': { operator: '>', value: 3 },
      cadd: { operator: 'not_null' }
    },
    []
  ]
]

const CASE_ONLY: ColumnFiltersParam[] = [
  { qual: { operator: '>', value: 30 } },
  { gt_num: { operator: '=', value: '1/1' } },
  { hpo_sim_score: { operator: '>', value: 0.5 } }
]

const positions = (rows: Array<{ pos: number }>): number[] =>
  rows.map((r) => r.pos).sort((a, b) => a - b)

describe('cohort column filter keys — SQLite (#528)', () => {
  let sqlite: DatabaseService

  beforeAll(() => {
    sqlite = new DatabaseService(':memory:')
    const caseId = sqlite.cases.createCase('keys', '/tmp/keys.vcf', 0, 'GRCh38')
    sqlite.variants.insertVariantsBatch(
      caseId,
      ROWS.map((row) => ({ ...row, gt_num: '0/1' }) as never)
    )
    const cnv = sqlite.database
      .prepare("SELECT id FROM variants WHERE variant_type = 'cnv'")
      .get() as { id: number }
    sqlite.database
      .prepare('INSERT INTO variant_cnv (variant_id, copy_number) VALUES (?, ?)')
      .run(cnv.id, CNV_COPY_NUMBER)
    sqlite.cohortSummary.rebuild()
  })

  afterAll(() => sqlite.close())

  it.each(EXPECTED)('%s', (_name, column_filters, expected) => {
    const result = sqlite.cohort.getCohortVariants({ column_filters, limit: 100 })
    expect(positions(result.data)).toEqual(expected)
    expect(result.total_count).toBe(expected.length)
  })

  it.each(CASE_ONLY)('rejects the case-only filter %o', (column_filters) => {
    expect(() => sqlite.cohort.getCohortVariants({ column_filters })).toThrow(
      'Unsupported cohort column filter(s)'
    )
  })
})

describe.skipIf(!RUN_PG)('cohort column filter keys — PostgreSQL (#528)', () => {
  let schema: string
  let pool: Pool

  beforeAll(async () => {
    schema = `vt_keys_${randomBytes(4).toString('hex')}`
    pool = new Pool({ connectionString: PG_URL, max: 2 })
    await pool.query(`CREATE SCHEMA "${schema}"`)
    await new PostgresMigrationRunner(pool, schema, POSTGRES_MIGRATIONS).migrate()

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const caseRow = await client.query<{ id: number }>(
        `INSERT INTO "${schema}".cases (name, file_path, file_size, created_at, genome_build)
           VALUES ('keys', '/tmp/keys.vcf', 0, $1, 'GRCh38') RETURNING id`,
        [Date.now()]
      )
      const caseId = caseRow.rows[0].id
      for (const r of ROWS) {
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO "${schema}".variants
             (case_id, chr, pos, ref, alt, variant_type, end_pos, gene_symbol, cadd, cdna,
              aa_change, gt_num)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '0/1') RETURNING id`,
          [
            caseId,
            r.chr,
            r.pos,
            r.ref,
            r.alt,
            r.variant_type,
            r.end_pos,
            r.gene_symbol,
            r.cadd,
            r.cdna,
            r.aa_change
          ]
        )
        if (r.variant_type === 'cnv') {
          await client.query(
            `INSERT INTO "${schema}".variant_cnv (variant_id, copy_number) VALUES ($1, $2)`,
            [inserted.rows[0].id, CNV_COPY_NUMBER]
          )
        }
      }
      await new PostgresCohortSummaryRepository().incrementalAdd({
        schema,
        client: client as never,
        caseId
      })
      await client.query('COMMIT')
    } finally {
      client.release()
    }
  }, 120_000)

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await pool.end()
  }, 120_000)

  const repo = (): PostgresCohortRepository => new PostgresCohortRepository(pool, schema)

  async function exported(params: CohortSearchParams): Promise<number[]> {
    const rows: Array<{ pos: number }> = []
    for await (const row of repo().streamCohortRows(params)) rows.push({ pos: Number(row.pos) })
    return positions(rows)
  }

  it.each(EXPECTED)(
    '%s',
    async (_name, column_filters, expected) => {
      const page = await repo().queryVariants({ column_filters, limit: 100 })
      expect(positions(page.data)).toEqual(expected)
      expect(page.total_count).toBe(expected.length)
      expect(await exported({ column_filters })).toEqual(expected)
    },
    60_000
  )

  it.each(CASE_ONLY)(
    'rejects the case-only filter %o',
    async (column_filters) => {
      await expect(repo().queryVariants({ column_filters })).rejects.toThrow(
        'Unsupported cohort column filter(s)'
      )
    },
    60_000
  )
})
