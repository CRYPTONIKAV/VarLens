import type { AppStateReturn } from './useAppState'

/** Commands both FilterToolbar (case) and CohortFilterBar (cohort) expose. */
export interface FilterCommands {
  focusSearch: () => void
  toggleFilterDrawer: () => void
  toggleColumnsDrawer: () => void
  handleClearAll: () => void
}

type DispatchState = Pick<
  AppStateReturn,
  'activeTab' | 'filterToolbarRef' | 'cohortViewRef' | 'caseShortlistActive'
>

/**
 * Filter shortcut callbacks for `useKeyboardShortcuts`, routed to the filter
 * bar of the visible view. A view without a visible filter bar (case Shortlist,
 * cohort Gene Burden, not yet mounted) gets nothing: a hidden bar is never mutated.
 */
export function filterShortcutCallbacks(state: DispatchState): {
  onSearchFocus: () => void
  onToggleFilterDrawer: () => void
  onToggleColumnsDrawer: () => void
  onClearAllFilters: () => void
} {
  const target = (): FilterCommands | null => {
    if (state.activeTab.value === 'cohort') return state.cohortViewRef.value?.filterBar ?? null
    return state.caseShortlistActive.value ? null : state.filterToolbarRef.value
  }
  return {
    onSearchFocus: () => target()?.focusSearch(),
    onToggleFilterDrawer: () => target()?.toggleFilterDrawer(),
    onToggleColumnsDrawer: () => target()?.toggleColumnsDrawer(),
    onClearAllFilters: () => target()?.handleClearAll()
  }
}
