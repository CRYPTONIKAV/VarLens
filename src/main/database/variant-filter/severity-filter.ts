/**
 * Case-view filters on impact and ClinVar, matched by normalised category
 * (src/shared/filters/severity-filter.ts) with Kysely-bound parameters.
 */
import { sql, type RawBuilder } from 'kysely'

import type { SeverityKey } from '../../../shared/config/severity.config'
import { SEVERITY_RANK_COLUMN, severityFilterSql } from '../../../shared/filters/severity-filter'
import type { VariantQueryBuilder } from './query-types'

/** Marks where a bound value goes in the SQL text; cannot occur in the text itself. */
export const PLACEHOLDER = '\u0000'

/** Kysely predicate from SQL text whose {@link PLACEHOLDER}s stand for `bound`, in order. */
export function boundPredicate(text: string, bound: readonly unknown[]): RawBuilder<boolean> {
  const pieces = text.split(PLACEHOLDER)
  const fragments = pieces.flatMap((piece, index) =>
    index < bound.length ? [sql.raw(piece), sql`${bound[index]}`] : [sql.raw(piece)]
  )
  return sql<boolean>`${sql.join(fragments, sql.raw(''))}`
}

/** `key IN values` (or its negation) on the `variants` table. */
export function whereSeverity(
  query: VariantQueryBuilder,
  key: SeverityKey,
  values: readonly unknown[],
  negate = false
): VariantQueryBuilder {
  const bound: string[] = []
  const text = severityFilterSql(
    key,
    values,
    {
      column: `variants.${key}`,
      rank: `variants.${SEVERITY_RANK_COLUMN[key]}`,
      bind: (value) => {
        bound.push(value)
        return PLACEHOLDER
      }
    },
    negate
  )
  if (text === null) return query
  // The text is built from whitelisted column names and configured integers;
  // every user value is bound.
  return query.where(boundPredicate(text, bound))
}
