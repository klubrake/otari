import { usePageViews } from "@/features/savedViews/usePageViews"
import {
  type ActivityUrl,
  BUILT_IN_VIEWS,
  viewPatch,
  viewQuery,
} from "./activityQuery"

/** The request log's saved views; see `usePageViews` for how one is matched. */
export function useActivityViews({
  url,
  workspaceId,
  hasSpan,
  onApplied,
}: {
  url: ActivityUrl
  workspaceId: string
  hasSpan: boolean
  /** Called once a view is applied, for state the URL does not hold. */
  onApplied: () => void
}) {
  return usePageViews({
    page: "activity",
    workspaceId,
    builtIns: BUILT_IN_VIEWS,
    query: viewQuery(url),
    hasSpan,
    onApply: (query) => {
      url.patch({ ...viewPatch(query), request: "" })
      onApplied()
    },
  })
}
