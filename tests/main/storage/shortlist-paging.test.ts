/**
 * Issue #537 — the shortlist ranks every eligible candidate, not the first
 * `topN × 4` rows by import id.
 *
 * Seeds more SNVs than one Stage-1 page and plants the highest-scoring,
 * the ClinVar-pinned and the starred variant at the end of the import. The
 * SQLite half always runs; the PostgreSQL half (same fixture, same
 * expectation) is gated by VARLENS_RUN_POSTGRES_E2E=1.
 */
import { randomBytes } from 'node:crypto'

import Database from 'better-sqlite3-multiple-ciphers'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createRepositories } from '../../../src/main/database/createRepositories'
import { runMigrations } from '../../../src/main/database/migrations'
import { initializeSchema } from '../../../src/main/database/schema'
import { SHORTLIST_PAGE_SIZE } from '../../../src/main/database/shortlist-query'
import { POSTGRES_MIGRATIONS } from '../../../src/main/storage/postgres/migrations/definitions'
import { PostgresMigrationRunner } from '../../../src/main/storage/postgres/migrations/PostgresMigrationRunner'
import { PostgresExportRepository } from '../../../src/main/storage/postgres/PostgresExportRepository'
import { PostgresShortlistService } from '../../../src/main/storage/postgres/PostgresShortlistService'
import type { ShortlistConfig, ShortlistResult } from '../../../src/shared/types/shortlist'

interface SyntheticSnv {
  pos: number
  consequence: string
  cadd: number
  gnomad_af: number
  clinvar: string | null
  starred: boolean
}

const COUNT = SHORTLIST_PAGE_SIZE + 500
const BEST = COUNT - 200 // highest raw score
const STARRED = COUNT - 100 // LOW impact, pinned by star
const CLINVAR = COUNT - 50 // Pathogenic, pinned by ClinVar

/** Every row scores differently, so ranking never falls back to the id tie-breaker. */
function fixture(): SyntheticSnv[] {
  return Array.from({ length: COUNT }, (_, i) => ({
    pos: 1_000 + i,
    consequence: i === BEST ? 'HIGH' : i === STARRED ? 'LOW' : 'MODERATE',
    cadd: i === BEST ? 40 : 5 + i * 0.01,
    gnomad_af: i === BEST ? 0 : 0.005,
    clinvar: i === CLINVAR ? 'Pathogenic' : null,
    starred: i === STARRED
  }))
}

/** Deterministic Fisher-Yates so a failure reproduces. */
function shuffled<T>(items: T[]): T[] {
  const out = [...items]
  let seed = 537
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
    const j = seed % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const CONFIG: ShortlistConfig = {
  variantTypeScope: ['snv'],
  baseFilters: {},
  topN: 6,
  rankConfig: {
    weights: { impact: 1, pathogenicity: 1, rarity: 1, clinvar: 1, phenotype: 0 },
    clinvarPinTop: true,
    pinStarredTop: true
  }
}

const EXPECTED_POSITIONS = [STARRED, CLINVAR, BEST, COUNT - 1, COUNT - 2, COUNT - 3].map(
  (i) => 1_000 + i
)

const positions = (result: ShortlistResult): number[] => result.rows.map((row) => row.pos)

function sqliteShortlist(rows: SyntheticSnv[]): ShortlistResult {
  const db = new Database(':memory:')
  try {
    initializeSchema(db)
    runMigrations(db)
    db.prepare(
      `INSERT INTO cases (id, name, file_path, file_size, variant_count, created_at)
       VALUES (1, 'paging', '/tmp/paging.vcf', 0, 0, 0)`
    ).run()
    const insert = db.prepare(
      `INSERT INTO variants (case_id, variant_type, chr, pos, ref, alt, consequence, cadd, gnomad_af, clinvar)
       VALUES (1, 'snv', '1', ?, 'A', 'T', ?, ?, ?, ?)`
    )
    const star = db.prepare(
      `INSERT INTO case_variant_annotations (case_id, variant_id, starred, created_at, updated_at)
       VALUES (1, ?, 1, 0, 0)`
    )
    db.transaction(() => {
      for (const v of rows) {
        const { lastInsertRowid } = insert.run(v.pos, v.consequence, v.cadd, v.gnomad_af, v.clinvar)
        if (v.starred) star.run(lastInsertRowid)
      }
    })()
    return createRepositories(db).shortlistService.getShortlist(
      { caseId: 1, adHocConfig: CONFIG },
      () => null
    )
  } finally {
    db.close()
  }
}

describe('shortlist candidate paging (#537) — SQLite', () => {
  it('ranks the best, ClinVar-pinned and starred variants imported after the first page', () => {
    const result = sqliteShortlist(fixture())
    expect(positions(result)).toEqual(EXPECTED_POSITIONS)
    expect(result.rows[0].rank_starred_pinned).toBe(true)
    expect(result.rows[1].rank_clinvar_pinned).toBe(true)
    expect(result.totalCandidates).toBe(COUNT)
  })

  it('ranks the same variants whatever the import order', () => {
    expect(positions(sqliteShortlist(shuffled(fixture())))).toEqual(EXPECTED_POSITIONS)
  })
})

const RUN_PG = process.env.VARLENS_RUN_POSTGRES_E2E === '1'
const PG_URL =
  process.env.VARLENS_PG_URL ??
  'postgres://varlens:varlens_dev_password@127.0.0.1:55432/varlens_dev'

describe.skipIf(!RUN_PG)('shortlist candidate paging (#537) — PostgreSQL', () => {
  let schema: string
  let pool: Pool

  async function postgresShortlist(rows: SyntheticSnv[]): Promise<ShortlistResult> {
    const caseRow = await pool.query<{ id: string }>(
      `INSERT INTO "${schema}".cases (name, file_path, file_size, created_at)
       VALUES ($1, '/tmp/paging.vcf', 0, 0) RETURNING id`,
      [`paging-${randomBytes(4).toString('hex')}`]
    )
    const caseId = Number(caseRow.rows[0].id)
    const inserted = await pool.query<{ id: string; pos: number }>(
      `INSERT INTO "${schema}".variants
         (case_id, variant_type, chr, pos, ref, alt, consequence, cadd, gnomad_af, clinvar)
       SELECT $1, 'snv', '1', t.pos, 'A', 'T', t.consequence, t.cadd, t.gnomad_af, t.clinvar
       FROM unnest($2::int[], $3::text[], $4::float8[], $5::float8[], $6::text[])
         WITH ORDINALITY AS t(pos, consequence, cadd, gnomad_af, clinvar, ord)
       ORDER BY t.ord
       RETURNING id, pos`,
      [
        caseId,
        rows.map((v) => v.pos),
        rows.map((v) => v.consequence),
        rows.map((v) => v.cadd),
        rows.map((v) => v.gnomad_af),
        rows.map((v) => v.clinvar)
      ]
    )
    const starredPos = rows.find((v) => v.starred)?.pos
    const starredId = inserted.rows.find((r) => Number(r.pos) === starredPos)?.id
    await pool.query(
      `INSERT INTO "${schema}".case_variant_annotations (case_id, variant_id, starred, created_at, updated_at)
       VALUES ($1, $2, 1, 0, 0)`,
      [caseId, starredId]
    )
    const service = new PostgresShortlistService({
      pool,
      schema,
      filterPresets: { getPreset: async () => null },
      rows: new PostgresExportRepository(pool, schema)
    })
    return service.getShortlist({ caseId, adHocConfig: CONFIG })
  }

  beforeAll(async () => {
    schema = `vt_shortlist_paging_${randomBytes(4).toString('hex')}`
    const provisioner = new Client({ connectionString: PG_URL })
    await provisioner.connect()
    await provisioner.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`)
    await provisioner.end()
    pool = new Pool({ connectionString: PG_URL, max: 3 })
    await new PostgresMigrationRunner(pool, schema, POSTGRES_MIGRATIONS).migrate()
  }, 180_000)

  afterAll(async () => {
    if (pool) await pool.end()
    if (schema !== undefined) {
      const cleaner = new Client({ connectionString: PG_URL })
      await cleaner.connect()
      await cleaner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await cleaner.end()
    }
  }, 120_000)

  it('ranks late-imported variants and matches the SQLite ranking in any import order', async () => {
    const inOrder = await postgresShortlist(fixture())
    expect(positions(inOrder)).toEqual(EXPECTED_POSITIONS)
    expect(inOrder.rows[0].rank_starred_pinned).toBe(true)
    expect(inOrder.rows[1].rank_clinvar_pinned).toBe(true)
    expect(inOrder.totalCandidates).toBe(COUNT)
    expect(positions(await postgresShortlist(shuffled(fixture())))).toEqual(EXPECTED_POSITIONS)
  }, 120_000)
})
