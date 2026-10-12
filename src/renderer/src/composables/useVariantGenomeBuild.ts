import { computed, type ComputedRef } from 'vue'
import { useQuery } from '@pinia/colada'

import type { Variant } from '../../../shared/types/api'
import type { CohortVariant } from '../../../shared/types/cohort'
import { caseBuildsQuery } from '../queries/cases'

/**
 * Genome build of the variant shown in the details panel: a cohort row carries
 * its own; a case variant inherits its case's. Null while unknown.
 */
export function useVariantGenomeBuild(props: {
  variant: Variant | CohortVariant | null
  caseId: number | null
}): ComputedRef<string | null> {
  const { data: caseBuilds } = useQuery(caseBuildsQuery)
  return computed(() => {
    const v = props.variant
    if (v === null) return null
    if ('genome_build' in v) return v.genome_build
    const id = props.caseId
    return id === null ? null : (caseBuilds.value?.get(id) ?? null)
  })
}
