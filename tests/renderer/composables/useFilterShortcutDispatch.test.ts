import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { useKeyboardShortcuts } from '../../../src/renderer/src/composables/useKeyboardShortcuts'
import { filterShortcutCallbacks } from '../../../src/renderer/src/composables/useFilterShortcutDispatch'

function commands() {
  return {
    focusSearch: vi.fn(),
    toggleFilterDrawer: vi.fn(),
    toggleColumnsDrawer: vi.fn(),
    handleClearAll: vi.fn()
  }
}

/** The App wiring: real key events through useKeyboardShortcuts into the dispatcher. */
function setup(initial: { tab: 'case' | 'cohort'; caseBar: boolean; cohortBar: boolean }) {
  const caseBar = commands()
  const cohortBar = commands()
  const state = {
    activeTab: ref(initial.tab),
    caseShortlistActive: ref(false),
    filterToolbarRef: ref(initial.caseBar ? caseBar : null),
    cohortViewRef: ref(initial.cohortBar ? { filterBar: cohortBar } : null)
  }
  mount(
    defineComponent({
      setup() {
        useKeyboardShortcuts(filterShortcutCallbacks(state as never))
        return () => null
      }
    })
  )
  return { state, caseBar, cohortBar }
}

function press(init: KeyboardEventInit, target: EventTarget = window): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
}

function pressAll(): void {
  press({ key: '/' })
  press({ key: 'F', ctrlKey: true, shiftKey: true })
  press({ key: 'C', code: 'KeyC', altKey: true, shiftKey: true })
  press({ key: 'X', ctrlKey: true, shiftKey: true })
}

function expectAllCalledOnce(bar: ReturnType<typeof commands>): void {
  expect(bar.focusSearch).toHaveBeenCalledTimes(1)
  expect(bar.toggleFilterDrawer).toHaveBeenCalledTimes(1)
  expect(bar.toggleColumnsDrawer).toHaveBeenCalledTimes(1)
  expect(bar.handleClearAll).toHaveBeenCalledTimes(1)
}

function expectNoneCalled(bar: ReturnType<typeof commands>): void {
  for (const fn of Object.values(bar)) expect(fn).not.toHaveBeenCalled()
}

describe('filter shortcut dispatch', () => {
  enableAutoUnmount(afterEach)
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('reaches the case toolbar on the case view', () => {
    const { caseBar, cohortBar } = setup({ tab: 'case', caseBar: true, cohortBar: false })
    pressAll()
    expectAllCalledOnce(caseBar)
    expectNoneCalled(cohortBar)
  })

  it('reaches the cohort filter bar on a fresh cohort route', () => {
    const { cohortBar } = setup({ tab: 'cohort', caseBar: false, cohortBar: true })
    pressAll()
    expectAllCalledOnce(cohortBar)
  })

  it('after case -> cohort navigation, never touches the kept-alive case toolbar', () => {
    const { state, caseBar, cohortBar } = setup({ tab: 'case', caseBar: true, cohortBar: false })
    state.activeTab.value = 'cohort'
    state.cohortViewRef.value = { filterBar: cohortBar }
    pressAll()
    expectAllCalledOnce(cohortBar)
    expectNoneCalled(caseBar)
  })

  it('does nothing while the case Shortlist hides the toolbar', () => {
    const { state, caseBar } = setup({ tab: 'case', caseBar: true, cohortBar: false })
    state.caseShortlistActive.value = true
    pressAll()
    expectNoneCalled(caseBar)
  })

  it('does nothing when the cohort view has no visible filter bar (e.g. Gene Burden)', () => {
    const { state, caseBar } = setup({ tab: 'cohort', caseBar: true, cohortBar: false })
    state.cohortViewRef.value = { filterBar: null } as never
    pressAll()
    expectNoneCalled(caseBar)
  })

  it('keeps "/" and Alt+Shift+C as text while typing in a field', () => {
    const { cohortBar } = setup({ tab: 'cohort', caseBar: false, cohortBar: true })
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    press({ key: '/' }, input)
    press({ key: 'C', code: 'KeyC', altKey: true, shiftKey: true }, input)
    expect(cohortBar.focusSearch).not.toHaveBeenCalled()
    expect(cohortBar.toggleColumnsDrawer).not.toHaveBeenCalled()
  })
})
