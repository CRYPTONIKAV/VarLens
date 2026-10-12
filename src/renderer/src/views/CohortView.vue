<script setup lang="ts">
import { isNavigationFailure, useRouter } from 'vue-router'
import CohortViewComponent from '../components/CohortView.vue'
import { useAppState } from '../composables/useAppState'
import { tabForVariantType, type CarrierTarget } from '../composables/useCarrierTarget'
import type { Variant } from '../../../shared/types/api'
import type { CohortVariant } from '../../../shared/types/cohort'
import { logService } from '../services/LogService'
import { formatError } from '../utils/ipc-result'

const router = useRouter()
const { carrierTarget, panelOpen, selectedPanelVariant, cohortViewRef } = useAppState()

// cohortViewRef is used as template ref (not detected by vue-tsc from destructured composable)
void cohortViewRef

/**
 * Open the carrier's case on the variant's own type tab, narrowed to the exact
 * variant. The URL bindings select the case and tab (and report a case that
 * no longer exists); the case view's useCarrierTarget does the rest.
 */
async function handleNavigateToCase(target: CarrierTarget): Promise<void> {
  carrierTarget.value = target
  try {
    const failure = await router.push({
      path: '/case',
      query: { case: String(target.caseId), tab: tabForVariantType(target.variantType) }
    })
    // Cancelled (e.g. an unsaved ACMG draft): the target must not apply later.
    if (isNavigationFailure(failure)) carrierTarget.value = null
  } catch (error) {
    logService.error('Navigating to the carrier case failed: ' + formatError(error), 'cohort')
  }
}

function handleRowClick(variant: Variant | CohortVariant): void {
  selectedPanelVariant.value = variant
  panelOpen.value = true
}

function handleDeselect(): void {
  if (panelOpen.value) {
    panelOpen.value = false
  }
}
</script>

<template>
  <CohortViewComponent
    ref="cohortViewRef"
    @navigate-to-case="handleNavigateToCase"
    @row-click="handleRowClick"
    @deselect="handleDeselect"
  />
</template>
