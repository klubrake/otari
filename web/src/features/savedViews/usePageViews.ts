import { useState } from "react"
import {
  type SavedViewPage,
  useCreateSavedView,
  useDeleteSavedView,
  useSavedViews,
} from "@/shared/api/savedViews"
import type { BuiltInView } from "./savedViews"

/**
 * A page's saved views, and which one it is showing.
 *
 * A view is the page's query string under a name, so the one on screen is the
 * view whose query matches the page's. After a change, the view last matched
 * keeps its name, marked as changed, so "All requests" plus a filter reads as
 * that rather than as nothing. A brushed span is a moment rather than a view,
 * so while one is set nothing matches.
 */
export function usePageViews({
  page,
  workspaceId,
  builtIns,
  query,
  hasSpan,
  onApply,
}: {
  page: SavedViewPage
  workspaceId: string
  builtIns: readonly BuiltInView[]
  /** The page's current view as a canonical query string. */
  query: string
  hasSpan: boolean
  /** Puts a view's query on the page. */
  onApply: (query: string) => void
}) {
  const saved = useSavedViews(workspaceId, page)
  const create = useCreateSavedView(workspaceId)
  const remove = useDeleteSavedView(workspaceId)
  const [lastMatched, setLastMatched] = useState<string>()

  const views = saved.data ?? []
  const matching = hasSpan
    ? undefined
    : [...builtIns, ...views].find((view) => view.query === query)
  if (matching && matching.name !== lastMatched) setLastMatched(matching.name)

  return {
    views,
    current: matching?.name ?? lastMatched,
    /** The view the page matches exactly, if any: the one its menu checks. */
    matching,
    isDirty: !matching && lastMatched !== undefined,
    apply: (view: BuiltInView) => {
      onApply(view.query)
      setLastMatched(view.name)
    },
    save: (name: string, shared: boolean) => {
      remove.reset()
      return create
        .mutateAsync({ page, name, query, shared })
        .then(() => setLastMatched(name))
    },
    remove: (id: string) => {
      create.reset()
      remove.mutate(id)
    },
    isSaving: create.isPending,
    error: create.error ?? remove.error,
    /** Forget a failed save or delete, once the menu that showed it closes. */
    clearError: () => {
      create.reset()
      remove.reset()
    },
  }
}
