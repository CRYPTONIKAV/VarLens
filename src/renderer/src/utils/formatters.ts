/**
 * Formatting utilities for displaying variant data in human-readable format
 */

import { decodeVepHgvs } from '../../../shared/utils/hgvs'
import { CONSEQUENCE_LABELS } from '../config/displayConfig'
import { VEP_CONSEQUENCE_SEPARATOR } from '../../../shared/config/vep.config'

export { EMPTY_VALUE_PLACEHOLDER } from '../config/displayConfig'

/**
 * Format a consequence type to human-readable form
 * @param raw - The raw consequence string from the database
 * @returns Human-readable consequence name
 */
export function formatConsequence(raw: string): string {
  if (!raw) return ''
  return raw
    .split(VEP_CONSEQUENCE_SEPARATOR)
    .map((term) => CONSEQUENCE_LABELS[term] || term.replace(/_/g, ' '))
    .join(', ')
}

/**
 * Format multiple consequences (comma-separated) to human-readable form
 * @param raw - Comma-separated consequence string
 * @returns Formatted consequence string
 */
export function formatConsequences(raw: string): string {
  if (!raw) return ''
  return raw
    .split(',')
    .map((c) => formatConsequence(c.trim()))
    .join(', ')
}

/**
 * Get the original consequence value (for tooltips)
 * @param formatted - The formatted consequence
 * @returns Original database value or the input if not found
 */
export function getOriginalConsequence(formatted: string): string | null {
  for (const [key, value] of Object.entries(CONSEQUENCE_LABELS)) {
    if (value === formatted) return key
  }
  return null
}

/**
 * One HGVS display string for every surface (tables, panel, Copy). VEP values
 * are already `ENST….7:c.…` (the only place the transcript version lives), so
 * the transcript is prefixed only onto bare SnpEff/JSON `c.…` values. Decoding
 * here also fixes databases imported before VEP escapes were decoded at import.
 */
export function formatHgvs(
  value: string | null | undefined,
  transcript?: string | null
): string | null {
  if (value === null || value === undefined || value === '') return null
  const decoded = decodeVepHgvs(value)
  const hasTranscript = transcript !== null && transcript !== undefined && transcript !== ''
  return hasTranscript && !decoded.includes(':') ? `${transcript}:${decoded}` : decoded
}
