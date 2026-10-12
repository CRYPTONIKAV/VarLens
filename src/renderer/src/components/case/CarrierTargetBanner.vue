<template>
  <v-alert
    v-if="target !== null"
    type="info"
    variant="tonal"
    density="compact"
    class="mx-2 my-1"
    data-testid="carrier-target-banner"
  >
    <div class="d-flex align-center flex-wrap ga-2">
      <span>
        Showing variant <strong>{{ describeCarrierTarget(target) }}</strong> opened from the cohort
        view.
      </span>
      <v-btn size="small" variant="text" color="primary" @click="carrierTarget = null">
        Show all variants
      </v-btn>
    </div>
  </v-alert>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppState } from '../../composables/useAppState'
import { describeCarrierTarget } from '../../composables/useCarrierTarget'

const { carrierTarget, selectedCaseId } = useAppState()
const target = computed(() =>
  carrierTarget.value?.caseId === selectedCaseId.value ? carrierTarget.value : null
)
</script>
