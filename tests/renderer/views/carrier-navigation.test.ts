/**
 * Cohort carrier click → exact variant in the carrier's case (#535).
 *
 * Mounts the real cohort view wrapper (its table stubbed to emit the click)
 * next to the real CaseView (heavy children stubbed) under a router with the
 * URL-state sync, as App.vue wires them, and checks the case, the type tab,
 * the typed identity filter and the opened details panel.
 */
/* eslint-disable vue/one-component-per-file -- inline test doubles */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createPinia, setActivePinia } from 'pinia'

const casesList = vi.fn()
const typeCounts = vi.fn()
const variantsQuery = vi.fn()
vi.mock('../../../src/renderer/src/composables/useApiService', () => ({
  useApiService: () => ({
    api: {
      cases: { list: () => casesList() },
      variants: {
        typeCounts: (id: number) => typeCounts(id),
        query: (...args: unknown[]) => variantsQuery(...args)
      }
    },
    isAvailable: { value: true }
  })
}))
vi.mock('../../../src/renderer/src/services/LogService', () => ({
  logService: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))
vi.mock('../../../src/renderer/src/components/FilterToolbar.vue', () => ({
  default: defineComponent({
    name: 'FilterToolbarStub',
    setup(_, { expose }) {
      expose({ filterOptions: { columnMeta: [] }, handleClearAll: vi.fn() })
      return () => h('div')
    }
  })
}))
vi.mock('../../../src/renderer/src/components/VariantTable.vue', () => ({
  default: defineComponent({
    name: 'VariantTableStub',
    props: { filters: { type: Object, default: () => ({}) } },
    setup(_, { expose }) {
      expose({ columns: [], columnActiveFilters: [] })
      return () => h('div')
    }
  })
}))
vi.mock('../../../src/renderer/src/components/shortlist/ShortlistPanel.vue', () => ({
  default: defineComponent({ name: 'ShortlistPanelStub', setup: () => () => h('div') })
}))
vi.mock('../../../src/renderer/src/components/CohortView.vue', () => ({
  default: defineComponent({
    name: 'CohortViewStub',
    emits: ['navigate-to-case', 'row-click', 'deselect'],
    setup: () => () => h('div')
  })
}))

import CaseView from '../../../src/renderer/src/views/CaseView.vue'
import CohortView from '../../../src/renderer/src/views/CohortView.vue'
import { AppStateKey, createAppState } from '../../../src/renderer/src/composables/useAppState'
import { useCaseUrlParam } from '../../../src/renderer/src/composables/useViewUrlBindings'
import {
  _resetUrlStateForTesting,
  installUrlStateSync
} from '../../../src/renderer/src/composables/useUrlState'
import type { CarrierTarget } from '../../../src/renderer/src/composables/useCarrierTarget'

const vuetify = createVuetify({ components, directives })
const Empty = defineComponent({ render: () => null })

const CASES = [
  { id: 1, name: 'Case A', variant_count: 10, created_at: 0 },
  { id: 2, name: 'Case B', variant_count: 10, created_at: 0 }
]

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}

let pinia = createPinia()

async function mountShell() {
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/case', name: 'case', component: Empty },
      { path: '/cohort', name: 'cohort', component: Empty }
    ]
  })
  await router.push('/cohort')
  const state = createAppState()
  const snacks: string[] = []
  state.setSnackbarHandler((message) => snacks.push(message))
  const Host = defineComponent({
    setup() {
      installUrlStateSync(router)
      useCaseUrlParam(state)
      return () => [h(CohortView), h(CaseView)]
    }
  })
  const wrapper = mount(Host, {
    global: { plugins: [vuetify, router, pinia], provide: { [AppStateKey as symbol]: state } }
  })
  await settle()
  return { wrapper, router, state, snacks }
}

async function clickCarrier(
  wrapper: Awaited<ReturnType<typeof mountShell>>['wrapper'],
  target: CarrierTarget
): Promise<void> {
  wrapper.findComponent({ name: 'CohortViewStub' }).vm.$emit('navigate-to-case', target)
  await settle()
}

function tableFilters(wrapper: Awaited<ReturnType<typeof mountShell>>['wrapper']) {
  return wrapper.findComponent({ name: 'VariantTableStub' }).props('filters') as Record<
    string,
    unknown
  >
}

function caseTab(wrapper: Awaited<ReturnType<typeof mountShell>>['wrapper']): string {
  const caseView = wrapper.findComponent(CaseView)
  return (caseView.vm as unknown as { selectedVariantType: string }).selectedVariantType
}

function lookupFilter(): unknown {
  return variantsQuery.mock.calls.at(-1)?.[1]
}

const target = (over: Partial<CarrierTarget>): CarrierTarget => ({
  caseId: 2,
  chr: 'chr1',
  pos: 1000,
  ref: 'A',
  alt: 'G',
  variantType: 'snv',
  ...over
})

describe('cohort carrier navigation (#535)', () => {
  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
    casesList.mockReset().mockResolvedValue(CASES)
    typeCounts.mockReset().mockResolvedValue({ snv: 5, sv: 2, cnv: 1 })
    variantsQuery.mockReset()
  })
  afterEach(() => {
    _resetUrlStateForTesting()
  })

  it('opens an SNV without gene/cDNA on its SNV tab, not the Shortlist', async () => {
    const found = { id: 7, chr: 'chr1', pos: 1000, ref: 'A', alt: 'G', gene_symbol: null }
    variantsQuery.mockResolvedValue({ data: [found], total_count: 1 })
    const { wrapper, router, state } = await mountShell()

    await clickCarrier(wrapper, target({}))

    expect(router.currentRoute.value.path).toBe('/case')
    expect(router.currentRoute.value.query).toMatchObject({ case: '2', tab: 'snv' })
    expect(state.selectedCaseId.value).toBe(2)
    expect(caseTab(wrapper)).toBe('snv')
    expect(tableFilters(wrapper)).toMatchObject({ chr: 'chr1', pos: 1000, ref: 'A', alt: 'G' })
    expect(tableFilters(wrapper).search_query).toBeUndefined()
    expect(lookupFilter()).toMatchObject({
      chr: 'chr1',
      pos: 1000,
      ref: 'A',
      alt: 'G',
      variant_type: 'snv',
      exact_variant_type: true
    })
    expect(state.selectedPanelVariant.value).toEqual(found)
    expect(state.panelOpen.value).toBe(true)
    expect(wrapper.find('[data-testid="carrier-target-banner"]').exists()).toBe(true)
  })

  it('keeps two alleles at one position apart by their alt allele', async () => {
    variantsQuery.mockImplementation((_id, f: { alt: string }) =>
      Promise.resolve({ data: [{ id: f.alt === 'T' ? 11 : 12, alt: f.alt }], total_count: 1 })
    )
    const { wrapper, state } = await mountShell()

    await clickCarrier(wrapper, target({ alt: 'T' }))

    expect(tableFilters(wrapper)).toMatchObject({ pos: 1000, ref: 'A', alt: 'T' })
    expect(state.selectedPanelVariant.value).toMatchObject({ id: 11, alt: 'T' })
  })

  it.each([
    ['sv', 'sv'],
    ['cnv', 'cnv'],
    ['indel', 'snv']
  ])('opens a %s carrier on the %s tab', async (variantType, tab) => {
    variantsQuery.mockResolvedValue({ data: [{ id: 3 }], total_count: 1 })
    const { wrapper, router } = await mountShell()

    await clickCarrier(wrapper, target({ variantType, ref: 'N', alt: '<DEL>' }))

    expect(router.currentRoute.value.query.tab).toBe(tab)
    expect(caseTab(wrapper)).toBe(tab)
    expect(tableFilters(wrapper)).toMatchObject({ variant_type: tab, alt: '<DEL>' })
    expect(lookupFilter()).toMatchObject({ variant_type: variantType })
  })

  it('explains a target that is no longer in the case and shows all variants', async () => {
    variantsQuery.mockResolvedValue({ data: [], total_count: 0 })
    const { wrapper, state, snacks } = await mountShell()

    await clickCarrier(wrapper, target({}))

    expect(state.selectedCaseId.value).toBe(2)
    expect(snacks.join(' ')).toContain('chr1:1000 A>G is not in this case')
    expect(state.carrierTarget.value).toBeNull()
    expect(tableFilters(wrapper).pos).toBeUndefined()
    expect(state.panelOpen.value).toBe(false)
  })

  it('reports a carrier case that no longer exists', async () => {
    const { wrapper, state, snacks } = await mountShell()

    await clickCarrier(wrapper, target({ caseId: 99 }))

    expect(snacks.join(' ')).toContain('Case 99 from the link was not found')
    expect(state.selectedCaseId.value).toBeNull()
    expect(variantsQuery).not.toHaveBeenCalled()
  })

  it('waits for delayed type counts before choosing the tab', async () => {
    let release!: () => void
    typeCounts.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ snv: 5, cnv: 1 })
        })
    )
    variantsQuery.mockResolvedValue({ data: [{ id: 4 }], total_count: 1 })
    const { wrapper } = await mountShell()

    await clickCarrier(wrapper, target({ variantType: 'cnv' }))
    release()
    await settle()

    expect(caseTab(wrapper)).toBe('cnv')
  })

  it('drops the identity filter when leaving the case', async () => {
    variantsQuery.mockResolvedValue({ data: [{ id: 5 }], total_count: 1 })
    const { wrapper, state } = await mountShell()
    await clickCarrier(wrapper, target({}))

    state.selectCase({ caseId: 1, caseName: 'Case A' })
    await settle()

    expect(state.carrierTarget.value).toBeNull()
    expect(tableFilters(wrapper).pos).toBeUndefined()
  })
})
