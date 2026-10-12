/**
 * Cohort → case carrier navigation (#535): open the exact variant a cohort
 * row stands for in the carrier's case, by typed identity, not by text search.
 *
 * The cohort view sets `carrierTarget` and navigates to `?case=&tab=` (the
 * URL bindings select the case and the variant-type tab and clear the
 * previous case's filters). The case view calls `useCarrierTarget()`, which
 * narrows the table to the identity (exact chr/pos/ref/alt), looks the
 * variant up to open its details panel, and explains a target that is no
 * longer in the case instead of silently landing on other rows.
 */
import { computed, watch, type ComputedRef } from 'vue'
import type { VariantFilter } from '../../../shared/types/api'
import type { PerTypeTab } from '../../../shared/types/shortlist'
import { unwrapIpcResult } from '../../../shared/types/errors'
import { useAppState } from './useAppState'
import { useApiService } from './useApiService'
import { logService } from '../services/LogService'
import { formatError } from '../utils/ipc-result'

/** One cohort row's identity in one carrier case. */
export interface CarrierTarget {
  caseId: number
  chr: string
  pos: number
  ref: string
  alt: string
  /** Stored variant type: snv, indel, sv, cnv or str */
  variantType: string
}

/** Case-view tab showing a stored variant type (indels live on the SNV/Indel tab). */
export function tabForVariantType(variantType: string): PerTypeTab {
  return variantType === 'sv' || variantType === 'cnv' || variantType === 'str'
    ? variantType
    : 'snv'
}

export function describeCarrierTarget(t: CarrierTarget): string {
  return `${t.chr}:${t.pos} ${t.ref}>${t.alt}`
}

/** Case view: exact-identity filter for the table + open the target's panel. */
export function useCarrierTarget(): {
  targetFilter: ComputedRef<Pick<VariantFilter, 'chr' | 'pos' | 'ref' | 'alt'>>
} {
  const { carrierTarget, selectedCaseId, activeTab, selectedPanelVariant, panelOpen, showSnack } =
    useAppState()
  const { api } = useApiService()

  const activeTarget = computed(() =>
    carrierTarget.value !== null && carrierTarget.value.caseId === selectedCaseId.value
      ? carrierTarget.value
      : null
  )

  // Leaving the target's case ends the navigation (it must not re-apply later).
  watch(selectedCaseId, (id, old) => {
    if (carrierTarget.value?.caseId === old && id !== old) carrierTarget.value = null
  })

  // Once per target, after the shell switched to the case view (the switch
  // closes the cohort view's panel, which must not close this one).
  let lookedUp: CarrierTarget | null = null
  watch(
    () => (activeTab.value === 'case' ? activeTarget.value : null),
    async (target) => {
      if (target === null || target === lookedUp || !api) return
      lookedUp = target
      try {
        const page = unwrapIpcResult(
          await api.variants.query(
            target.caseId,
            {
              chr: target.chr,
              pos: target.pos,
              ref: target.ref,
              alt: target.alt,
              variant_type: target.variantType,
              exact_variant_type: true
            },
            0,
            1
          )
        )
        if (carrierTarget.value !== target) return
        const variant = page.data[0]
        if (variant === undefined) {
          carrierTarget.value = null
          showSnack(
            `Variant ${describeCarrierTarget(target)} is not in this case any more ` +
              '(it may have been removed or re-imported). Showing all variants.',
            'warning'
          )
          return
        }
        selectedPanelVariant.value = variant
        panelOpen.value = true
      } catch (e) {
        logService.error('Carrier variant lookup failed: ' + formatError(e), 'cohort')
      }
    },
    { immediate: true }
  )

  const targetFilter = computed(() => {
    const t = activeTarget.value
    return t === null ? {} : { chr: t.chr, pos: t.pos, ref: t.ref, alt: t.alt }
  })

  return { targetFilter }
}
