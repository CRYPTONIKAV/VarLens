import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import QueryErrorAlert from '../../../../src/renderer/src/components/table-state/QueryErrorAlert.vue'

const vuetify = createVuetify({ components })
const mountAlert = (props: { error: Error | null; stale: boolean }) =>
  mount(QueryErrorAlert, { props, global: { plugins: [vuetify] } })

describe('QueryErrorAlert (#530)', () => {
  it('renders nothing without an error', () => {
    expect(mountAlert({ error: null, stale: true }).find('.query-error-alert').exists()).toBe(false)
  })

  it('shows a first-load failure without a previous-results label', () => {
    const text = mountAlert({ error: new Error('HTTP 500'), stale: false }).text()
    expect(text).toContain('HTTP 500')
    expect(text).not.toContain('previous results')
  })

  it('labels rows still on screen as previous results and emits retry', async () => {
    const wrapper = mountAlert({ error: new Error('HTTP 500'), stale: true })
    expect(wrapper.text()).toContain('Showing previous results')
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
