/* eslint-disable vue/one-component-per-file -- test hosts */
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import {
  _resetUrlStateForTesting,
  installUrlStateSync,
  useUrlParam
} from '../../../src/renderer/src/composables/useUrlState'
import { useCohortBuildUrlParam } from '../../../src/renderer/src/composables/useCohortBuildUrlParam'
import type { AvailableBuild } from '../../../src/shared/types/database'

const Empty = defineComponent({ render: () => null })

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/case', name: 'case', component: Empty },
      { path: '/cohort', name: 'cohort', component: Empty }
    ]
  })
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}

const BOTH: AvailableBuild[] = [
  { build: 'GRCh38', caseCount: 3 },
  { build: 'GRCh37', caseCount: 2 }
]

/** Mirrors CohortView: build + type bindings over useCohortData-like refs. */
async function mountCohort(path: string, builds: AvailableBuild[]) {
  const router = makeRouter()
  await router.push(path)
  const genomeBuild = ref('GRCh38')
  const availableBuilds = ref<AvailableBuild[]>([])
  const type = ref('snv')
  let api!: ReturnType<typeof useCohortBuildUrlParam>
  const app = createApp({
    setup() {
      installUrlStateSync(router)
      api = useCohortBuildUrlParam({ genomeBuild, availableBuilds })
      useUrlParam({
        route: 'cohort',
        key: 'type',
        priority: 1,
        history: 'replace',
        read: () => (type.value === 'snv' ? undefined : type.value),
        apply: (v) => {
          type.value = v ?? 'snv'
        }
      })
      return () => null
    }
  })
  app.mount(document.createElement('div'))
  await settle()
  // useCohortData.loadAvailableBuilds: keep a present build, else fall back.
  availableBuilds.value = builds
  if (builds.length > 0 && !builds.some((b) => b.build === genomeBuild.value)) {
    genomeBuild.value = builds[0].build
  }
  api.validateLinkedBuild()
  await settle()
  return { router, genomeBuild, type, unavailableBuild: api.unavailableBuild, app }
}

afterEach(() => {
  _resetUrlStateForTesting()
})

describe('useCohortBuildUrlParam', () => {
  it('restores a GRCh37 link with filters and type when both builds exist', async () => {
    const { router, genomeBuild, type, unavailableBuild, app } = await mountCohort(
      '/cohort?build=GRCh37&type=sv&f=abc',
      BOTH
    )
    expect(genomeBuild.value).toBe('GRCh37')
    expect(type.value).toBe('sv')
    expect(unavailableBuild.value).toBeNull()
    expect(router.currentRoute.value.query).toEqual({ build: 'GRCh37', type: 'sv', f: 'abc' })
    app.unmount()
  })

  it('writes the selected build to the URL and follows back/forward', async () => {
    const { router, genomeBuild, app } = await mountCohort('/cohort', BOTH)
    expect(router.currentRoute.value.query.build).toBe('GRCh38')

    genomeBuild.value = 'GRCh37'
    await settle()
    expect(router.currentRoute.value.query.build).toBe('GRCh37')

    await router.push('/case')
    await settle()
    router.back()
    await settle()
    expect(genomeBuild.value).toBe('GRCh37')

    await router.push('/cohort?build=GRCh38')
    await settle()
    expect(genomeBuild.value).toBe('GRCh38')
    router.back()
    await settle()
    expect(genomeBuild.value).toBe('GRCh37')
    app.unmount()
  })

  it('reports a linked build that the database does not contain', async () => {
    const { genomeBuild, unavailableBuild, app } = await mountCohort('/cohort?build=GRCh37', [
      { build: 'GRCh38', caseCount: 3 }
    ])
    expect(genomeBuild.value).toBe('GRCh38')
    expect(unavailableBuild.value).toBe('GRCh37')
    app.unmount()
  })

  it('reports an absent build linked after the builds loaded', async () => {
    const { router, genomeBuild, unavailableBuild, app } = await mountCohort('/cohort', BOTH)
    await router.push('/cohort?build=T2T')
    await settle()
    expect(genomeBuild.value).toBe('GRCh38')
    expect(unavailableBuild.value).toBe('T2T')
    app.unmount()
  })
})
