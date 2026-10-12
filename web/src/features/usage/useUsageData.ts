import { useState } from "react"
import type { UsageBucket, UsageFilters } from "@/client"
import { useActivityViewer } from "@/features/activity/useActivityViewer"
import { useMemberAttributionLabels } from "@/features/organization/attribution"
import { canManage } from "@/features/organization/roles"
import {
  memberReach,
  readMemberTotalsVisibility,
  usageScopeFor,
} from "@/features/workspaces/memberVisibility"
import { useWorkspaceSpend } from "@/shared/api/budgets"
import { useOrganizationContext } from "@/shared/api/organizations"
import {
  NO_BREAKDOWNS,
  useUsageBreakdown,
  useUsageGroupedSeries,
  useUsageSummary,
} from "@/shared/api/usage"
import { useWorkspaceVisibility } from "@/shared/api/workspaces"
import { bucketForWindow, isoAgo } from "@/shared/helpers/timeRange"
import { useSelectedWorkspace } from "@/shared/hooks/SelectedWorkspace"
import { breakdownRankFor, rankByFor, readMetric } from "./usageModel"
import {
  DIMENSIONS,
  dimensionsFor,
  filterApplies,
  readDimension,
  readFilters,
  readPreset,
  readScope,
  readSort,
  toUsageFilters,
  type UsageContext,
  type UsageUrl,
} from "./usageQuery"

/**
 * Who is reading, and what the page offers them. A member reads their own
 * usage, which the server decides, and the workspace's totals while its
 * managers share them. Someone who manages the workspace also reads everyone's
 * in it and can narrow to their own, and someone who manages the organization
 * can read across its workspaces. Each is the client half of a check the
 * server makes.
 */
export function useUsageViewer() {
  const viewer = useActivityViewer()
  const context = useOrganizationContext()
  const switcher = useSelectedWorkspace()
  return {
    ...viewer,
    canReadOrganization: canManage(context.data),
    /**
     * The caller's roles are still on their way, and with them the workspace
     * on screen. The switcher's own word too, since it settles a render after
     * the context does.
     */
    isFindingRole: context.isPending || switcher.isLoading,
    memberLabels: useMemberAttributionLabels(),
  }
}

type UsageViewer = ReturnType<typeof useUsageViewer>

/**
 * Every read the page makes, and what it derives from the URL to make them:
 * the scope, the window or span, the breakdown, and the filters that apply in
 * this scope (the rest wait in the URL for a scope that has them).
 */
export function useUsageData(url: UsageUrl, viewer: UsageViewer) {
  // Whether the workspace shares its totals with members. Only a member's
  // page depends on it, so only a member asks.
  const visibility = useWorkspaceVisibility(
    viewer.isManager ? "" : viewer.workspaceId,
  )
  const reach = memberReach(viewer, readMemberTotalsVisibility(visibility))
  const scopes = reach.scopes
  const scope = readScope(url, scopes)
  // A link to Workspace waits for who is reading and, for a member, the
  // workspace's answer, rather than reading and saying their own usage first.
  const isAwaitingScope =
    url.get("scope") === "workspace" &&
    (viewer.isFindingRole || reach.isPending)
  // "You" reads nothing until the roster says which requests are the caller's,
  // or it would read the whole workspace under a label saying otherwise.
  const isReady =
    !isAwaitingScope &&
    !(scope === "you" && viewer.isManager && viewer.ownUserId === undefined)
  const usageScope = usageScopeFor(reach, scope)
  const isReadingTotals = usageScope === "workspace_totals"
  const offered = dimensionsFor(scope, reach)
  const dimension = readDimension(url, offered)
  const allFilters = readFilters(url)
  const allowedFilters = isReadingTotals ? reach.totalsFilters : undefined
  const filters = allFilters.filter((filter) =>
    filterApplies(filter, offered, allowedFilters),
  )
  const idleFilters = allFilters.filter(
    (filter) => !filterApplies(filter, offered, allowedFilters),
  )
  const metric = readMetric(url.get("metric"))
  // The setting is offered with cost only, so it has no effect anywhere while
  // another metric is on screen (the share card included).
  const withSubscription =
    metric !== "cost" || url.get("subscription") !== "exclude"
  const sort = readSort(url)
  const preset = readPreset(url)

  // A rolling window's start, taken when the window is picked and on refresh
  // rather than each render: recomputed on render, "now" would mint a new query
  // key, and a new request, every time anything re-rendered.
  const [anchor, setAnchor] = useState(() => ({
    range: preset.key,
    start: isoAgo(preset.seconds ?? 0),
  }))
  if (anchor.range !== preset.key) {
    setAnchor({ range: preset.key, start: isoAgo(preset.seconds ?? 0) })
  }
  const spanStart = url.get("start_date")
  const spanEnd = url.get("end_date")
  const hasSpan = spanStart !== "" && spanEnd !== ""
  const window = hasSpan
    ? { start: spanStart, end: spanEnd }
    : { start: anchor.start, end: undefined }
  const bucket: UsageBucket = hasSpan
    ? bucketForWindow(spanStart, spanEnd)
    : preset.bucket

  const context: UsageContext = {
    scope,
    workspaceId: viewer.workspaceId || undefined,
    ownUserId: viewer.ownUserId,
    isManager: viewer.isManager,
    canOpenWorkspaceActivity: reach.canOpenWorkspaceActivity,
  }
  const usageFilters = toUsageFilters(filters, window, context)
  // The window of equal length just before this one, for the tiles' growth.
  // None for a span: a stretch dragged out of the chart has no "before".
  const previousFilters: UsageFilters = {
    ...usageFilters,
    start_date: new Date(
      Date.parse(anchor.start) - (preset.seconds ?? 0) * 1000,
    ).toISOString(),
    end_date: anchor.start,
  }
  const def = DIMENSIONS[dimension]

  const breakdown = useUsageBreakdown(
    usageFilters,
    bucket,
    def.summary,
    breakdownRankFor(sort, metric, withSubscription),
    {
      enabled: isReady,
      usageScope,
      allowedDimensions: isReadingTotals ? reach.totalsDimensions : undefined,
    },
  )
  const previous = useUsageSummary(
    previousFilters,
    bucket,
    NO_BREAKDOWNS,
    isReady && !hasSpan,
    usageScope,
  )
  const grouped = useUsageGroupedSeries(
    usageFilters,
    bucket,
    def.series,
    // The chart ranks by the metric whatever the table's sort.
    rankByFor(metric, withSubscription),
    isReady,
    usageScope,
  )
  const spend = useWorkspaceSpend(
    scope === "organization" ? "" : viewer.workspaceId,
  )

  // A rolling window moves on to now, which is a new key and so one new read
  // of each; a span's window stays where it is, so its reads go again.
  const refresh = () => {
    // The setting the page is laid out from may have moved too.
    if (!viewer.isManager) void visibility.refetch()
    if (!hasSpan) {
      setAnchor({ range: preset.key, start: isoAgo(preset.seconds ?? 0) })
      return
    }
    void breakdown.refetch()
    void grouped.refetch()
  }

  // While another breakdown loads, the last one's answer keeps the totals and
  // the chart's window on screen; its rows are that breakdown's, so none show.
  const answer = breakdown.data
  const isCurrent = answer?.dimension === def.summary

  return {
    scopes,
    scope,
    /** A link asked for a member's Workspace, and the workspace's answer is on its way. */
    isAwaitingScope,
    /** Rows open their requests in Activity, which lists a member only their own. */
    canOpenActivity: scope !== "workspace" || reach.canOpenWorkspaceActivity,
    context,
    dimension,
    offered,
    filters,
    idleFilters,
    metric,
    withSubscription,
    sort,
    preset,
    window,
    hasSpan,
    bucket,
    usageFilters,
    usageScope,
    summary: answer?.summary,
    rows: isCurrent ? (def.rows(answer.summary) ?? []) : [],
    previous: hasSpan ? undefined : previous.data?.totals,
    grouped: grouped.data,
    spend: spend.data ?? undefined,
    isLoading: !isReady || (!isCurrent && !breakdown.error),
    isFetching: breakdown.isFetching || breakdown.isPlaceholderData,
    updatedAt: breakdown.dataUpdatedAt,
    error: breakdown.error ?? grouped.error,
    refresh,
  }
}
