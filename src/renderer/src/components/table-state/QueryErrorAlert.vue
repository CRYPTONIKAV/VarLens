<script setup lang="ts">
/**
 * Failed-query banner shared by the case and cohort tables (#530). When rows
 * from an earlier successful query are still on screen it labels them as
 * previous results so they are not mistaken for results of the new filters.
 * Driven by useOffsetPagination's `error`, which clears on the next success.
 */
import { mdiRefresh } from '@mdi/js'

defineProps<{
  error: Error | null
  /** Rows from an earlier query are still displayed. */
  stale: boolean
}>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <v-alert v-if="error" type="error" variant="tonal" class="query-error-alert mb-2">
    <div class="d-flex align-center justify-space-between ga-2">
      <span>
        <strong v-if="stale">Showing previous results — the latest query failed. </strong>
        {{ error.message || 'Failed to load data.' }}
      </span>
      <v-btn variant="tonal" size="small" :prepend-icon="mdiRefresh" @click="$emit('retry')">
        Retry
      </v-btn>
    </div>
  </v-alert>
</template>

<style scoped>
/* Vuetify sets `.v-alert { flex: 1 1 }`; inside a flex column the banner must not grow. */
.query-error-alert {
  flex: 0 0 auto;
}
</style>
