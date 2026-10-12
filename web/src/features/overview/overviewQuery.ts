import type { UsageFilters } from "@/client"
import type { UsageScopeKey } from "@/features/usage/usageQuery"
import type { UrlState } from "@/shared/helpers/urlState"

/**
 * What decides the Overview, in the URL: whose numbers, and which calendar
 * month. Months are UTC, as the budgets they are read against reset on the
 * 1st in UTC; Usage keeps the rolling windows.
 */
export const OVERVIEW_URL_DEFAULTS = {
  // "" is the reader's default: Workspace for someone who manages it, You for
  // everyone else.
  scope: "",
  // "YYYY-MM"; "" is the month now.
  month: "",
} as const

export type OverviewUrl = UrlState<keyof typeof OVERVIEW_URL_DEFAULTS>

/** How far back the month menu reaches, this month included. */
export const MONTHS_OFFERED = 12

const DAY_MS = 86_400_000

/** One calendar month in UTC, and where today falls in it. */
export interface Month {
  /** "2026-10". */
  key: string
  /** The first instant of the month. */
  start: Date
  /** The first instant of the month after. */
  end: Date
  /** How many days the month has. */
  length: number
  /** Days of the month that have begun: all of them once it is over. */
  elapsed: number
  isCurrent: boolean
}

/** The month that starts at `year`/`monthIndex` (UTC), seen from `now`. */
function monthAt(year: number, monthIndex: number, now: Date): Month {
  const start = new Date(Date.UTC(year, monthIndex, 1))
  const end = new Date(Date.UTC(year, monthIndex + 1, 1))
  const length = Math.round((end.getTime() - start.getTime()) / DAY_MS)
  const isCurrent = now >= start && now < end
  const elapsed = isCurrent ? now.getUTCDate() : now >= end ? length : 0
  return {
    key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
    start,
    end,
    length,
    elapsed,
    isCurrent,
  }
}

/** The months the menu offers, this one first. */
export function offeredMonths(now: Date): Month[] {
  return Array.from({ length: MONTHS_OFFERED }, (_, back) =>
    monthAt(now.getUTCFullYear(), now.getUTCMonth() - back, now),
  )
}

/** The month the URL names, if the menu offers it, else this one. */
export function readMonth(url: OverviewUrl, now: Date): Month {
  const months = offeredMonths(now)
  return months.find((month) => month.key === url.get("month")) ?? months[0]
}

/**
 * What a month is compared against. Part of the way through, the same stretch
 * of the month before, to the same hour, so an early total is not set against
 * a whole month, nor today's part of a day against a whole one; over, the whole
 * month before.
 */
export function comparisonWindow(
  month: Month,
  now: Date,
): {
  start: Date
  end: Date
  isWholeMonth: boolean
} {
  const before = monthAt(
    month.start.getUTCFullYear(),
    month.start.getUTCMonth() - 1,
    month.start,
  )
  if (!month.isCurrent) {
    return { start: before.start, end: before.end, isWholeMonth: true }
  }
  const end = Math.min(
    before.end.getTime(),
    before.start.getTime() + (now.getTime() - month.start.getTime()),
  )
  return { start: before.start, end: new Date(end), isWholeMonth: false }
}

/** The usage filters for a scope: the workspace unless across them, and the reader's own rows at You. */
export function scopeFilters(context: {
  scope: UsageScopeKey
  workspaceId: string | undefined
  ownUserId: string | undefined
  isManager: boolean
}): UsageFilters {
  const filters: UsageFilters = {}
  if (context.scope !== "organization") {
    filters.workspace_id = context.workspaceId
  }
  if (context.scope === "you" && context.isManager && context.ownUserId) {
    filters.user_id = [context.ownUserId]
  }
  return filters
}

/** A window as the usage API's bounds. */
export function windowFilters(start: Date, end: Date): UsageFilters {
  return { start_date: start.toISOString(), end_date: end.toISOString() }
}
