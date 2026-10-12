/**
 * Binds the cohort genome build to the URL (`?build=`), so a reloaded or
 * shared cohort link reopens on the same build as its filters and type.
 *
 * A linked build is applied right away (table, panel resolution and export
 * all read the shared `genomeBuild` ref); once the database's builds are
 * known, `validateLinkedBuild()` reports a linked build the database does not
 * contain instead of silently showing another build.
 */
import { ref, type Ref } from 'vue'
import type { AvailableBuild } from '../../../shared/types/database'
import { useUrlParam } from './useUrlState'

export function useCohortBuildUrlParam(opts: {
  genomeBuild: Ref<string>
  availableBuilds: Ref<AvailableBuild[]>
}): { unavailableBuild: Ref<string | null>; validateLinkedBuild: () => void } {
  const { genomeBuild, availableBuilds } = opts
  /** Build named by the URL, not yet checked against the loaded builds. */
  let pendingBuild: string | null = null
  const unavailableBuild = ref<string | null>(null)

  const hasBuild = (build: string): boolean => availableBuilds.value.some((b) => b.build === build)

  useUrlParam({
    route: 'cohort',
    key: 'build',
    priority: 0,
    history: 'replace',
    // Not written until the builds are known: the default is only a placeholder.
    read: () => (availableBuilds.value.length === 0 ? null : genomeBuild.value),
    apply: (value) => {
      if (value === undefined || value === '') return
      unavailableBuild.value = null
      if (availableBuilds.value.length === 0) {
        pendingBuild = value
        genomeBuild.value = value
      } else if (hasBuild(value)) {
        genomeBuild.value = value
      } else {
        unavailableBuild.value = value
      }
    }
  })

  /** Call after `loadAvailableBuilds()`; it already fell back to a present build. */
  function validateLinkedBuild(): void {
    if (pendingBuild === null || availableBuilds.value.length === 0) return
    if (!hasBuild(pendingBuild)) unavailableBuild.value = pendingBuild
    pendingBuild = null
  }

  return { unavailableBuild, validateLinkedBuild }
}
