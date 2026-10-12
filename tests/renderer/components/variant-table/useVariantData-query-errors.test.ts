/**
 * #530: a failed case-table query must surface an error instead of leaving
 * the previous rows on screen as if they matched the new filters.
 *
 * Uses the real useOffsetPagination so the request-order guards and the
 * error/rows state are what is asserted.
 */
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { withSetup, flushPromises } from '../../../utils/test-helpers'
import type { Variant, VariantFilter } from '../../../../src/shared/types/api'
import { useSettingsStore } from '../../../../src/renderer/src/stores/settingsStore'

const queryMock = vi.fn()

vi.mock('../../../../src/renderer/src/composables/useApiService', () => ({
  useApiService: () => ({ api: { variants: { query: queryMock } } })
}))

vi.mock('../../../../src/renderer/src/composables/useAnnotations', () => ({
  useAnnotations: () => ({
    loadAnnotationsBatch: vi.fn(),
    invalidateAnnotationGeneration: vi.fn(),
    clearCache: vi.fn()
  })
}))

import { useVariantData } from '../../../../src/renderer/src/components/variant-table/useVariantData'

const rows = [{ id: 1, case_id: 1, chr: '1', pos: 1, ref: 'A', alt: 'T' } as Variant]
/** What wrapHandler returns for a thrown main-process error (plain object, not Error). */
const ipcFailure = {
  code: 'DATABASE_ERROR',
  message: 'Query failed',
  userMessage: 'The variant query failed.'
}

describe('useVariantData query errors (#530)', () => {
  let app: { unmount: () => void } | undefined

  beforeEach(() => {
    setActivePinia(createPinia())
    useSettingsStore().prefetchEnabled = false
    queryMock.mockReset()
  })

  afterEach(() => {
    app?.unmount()
    app = undefined
  })

  function setup() {
    const filters = ref<Omit<VariantFilter, 'case_id'>>({ variant_type: 'snv' })
    const [data, appInstance] = withSetup(() =>
      useVariantData({
        caseId: ref(1),
        filters,
        onCountsUpdate: vi.fn(),
        onSortUpdate: vi.fn()
      })
    )
    app = appInstance
    return { filters, data }
  }

  it('exposes an initial-load failure with no rows', async () => {
    queryMock.mockResolvedValueOnce(ipcFailure)
    const { data } = setup()
    await data.loadVariants()

    expect(data.loadError.value?.message).toBe('The variant query failed.')
    expect(data.variants.value).toEqual([])
    expect(data.loading.value).toBe(false)
  })

  it('keeps previous rows but exposes the error when a filter refresh fails', async () => {
    queryMock.mockResolvedValueOnce({ data: rows, total_count: 1, unfiltered_count: 1 })
    const { filters, data } = setup()
    await data.loadVariants()
    expect(data.loadError.value).toBeNull()

    queryMock.mockResolvedValueOnce(ipcFailure)
    filters.value = { variant_type: 'snv', search_query: 'BRCA2' }
    await flushPromises()

    expect(data.loadError.value).not.toBeNull()
    expect(data.variants.value).toEqual(rows) // stale rows the UI labels as previous results
  })

  it('retries with the current filters and clears the error on success', async () => {
    queryMock.mockResolvedValueOnce({ data: rows, total_count: 1, unfiltered_count: 1 })
    const { filters, data } = setup()
    await data.loadVariants()
    queryMock.mockResolvedValueOnce(ipcFailure)
    filters.value = { variant_type: 'snv', search_query: 'BRCA2' }
    await flushPromises()

    queryMock.mockResolvedValueOnce({ data: [], total_count: 0 })
    await data.loadVariants() // the alert's Retry

    expect(queryMock.mock.calls.at(-1)?.[1]).toMatchObject({ search_query: 'BRCA2' })
    expect(data.loadError.value).toBeNull()
    expect(data.variants.value).toEqual([]) // normal no-matches state
  })

  it('treats a successful empty response as no matches, not an error', async () => {
    queryMock.mockResolvedValueOnce({ data: [], total_count: 0, unfiltered_count: 5 })
    const { data } = setup()
    await data.loadVariants()

    expect(data.loadError.value).toBeNull()
    expect(data.variants.value).toEqual([])
    expect(data.totalCount.value).toBe(0)
  })

  it('ignores a late failure of a superseded request', async () => {
    let failSlow!: () => void
    queryMock.mockImplementationOnce(
      () => new Promise((resolve) => (failSlow = () => resolve(ipcFailure)))
    )
    queryMock.mockResolvedValueOnce({ data: rows, total_count: 1, unfiltered_count: 1 })
    const { filters, data } = setup()
    const slow = data.loadVariants()
    filters.value = { variant_type: 'snv', search_query: 'BRCA2' }
    await flushPromises()

    failSlow()
    await slow
    expect(data.loadError.value).toBeNull()
    expect(data.variants.value).toEqual(rows)
  })
})
