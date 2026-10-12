import { Link, useNavigate } from "@tanstack/react-router"
import type { UsageEntry } from "@/client"
import { DataTable, type DataTableColumn } from "@/design-system/data/DataTable"
import { ErrorBanner } from "@/design-system/feedback/ErrorBanner"
import { Dot } from "@/design-system/indicators/Dot"
import {
  formatNumber,
  formatUtcMinute,
  formatUtcMonthName,
  formatUtcTime,
} from "@/shared/helpers/format"
import type { DashboardSearch } from "@/shared/helpers/search"
import { useIsPhone } from "@/shared/hooks/useIsPhone"
import type { Month } from "./overviewQuery"

const PHONE_HIDDEN = new Set(["time", "key"])

/** "08:41:12" today, "Oct 11 22:40" before. */
function failedAt(timestamp: string, now: Date): string {
  return timestamp.slice(0, 10) === now.toISOString().slice(0, 10)
    ? formatUtcTime(timestamp, true)
    : formatUtcMinute(timestamp)
}

/**
 * The month's latest failed requests, newest first: when, which model, under
 * which key, and what went wrong. A row opens that request in Activity, and the
 * header opens every failure of the month there.
 */
export function RecentFailures({
  month,
  now,
  entries,
  count,
  isLoading,
  error,
  failuresSearch,
}: {
  month: Month
  now: Date
  entries: UsageEntry[]
  /** How many requests failed this month. */
  count: number | undefined
  isLoading: boolean
  error: unknown
  /** Activity's search for the month's failures, where it can show them. */
  failuresSearch: DashboardSearch | undefined
}) {
  const navigate = useNavigate()
  const isPhone = useIsPhone()
  const allColumns: DataTableColumn<UsageEntry>[] = [
    {
      id: "time",
      header: "Time",
      cell: (entry) => (
        <span className="text-mono-caption">
          {failedAt(entry.timestamp, now)}
        </span>
      ),
    },
    {
      id: "model",
      header: "Model",
      isRowHeader: true,
      cell: (entry) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-mono-caption" title={entry.model}>
            {entry.model}
          </span>
          {isPhone ? (
            <span className="text-mono-micro text-subtle">
              {failedAt(entry.timestamp, now)}
              {entry.api_key_name ? ` · ${entry.api_key_name}` : ""}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "key",
      header: "Key",
      cell: (entry) => (
        <span className="block truncate">{entry.api_key_name ?? "—"}</span>
      ),
    },
    {
      id: "error",
      header: "Error",
      cell: (entry) => (
        <span className="flex min-w-0 items-center gap-2">
          <Dot className="bg-danger" />
          {entry.status_code !== null ? (
            <span className="text-mono-caption text-danger">
              {entry.status_code}
            </span>
          ) : null}
          <span className="truncate text-caption">
            {entry.error_message ?? "Failed"}
          </span>
        </span>
      ),
    },
  ]
  const columns = isPhone
    ? allColumns.filter((column) => !PHONE_HIDDEN.has(column.id))
    : allColumns

  return (
    <section className="flex flex-col px-4 py-5 md:px-6">
      <div className="flex items-baseline gap-3 pb-3">
        <h2 className="flex-1 text-title">
          {month.isCurrent
            ? "Recent failures"
            : `Failures in ${formatUtcMonthName(month.start.getTime())}`}
        </h2>
        {failuresSearch && count ? (
          <Link
            to="/activity"
            search={failuresSearch}
            className="text-sm whitespace-nowrap text-link underline-offset-2 hover:underline focus-visible:otari-focus-ring"
          >
            View all {formatNumber(count)} in Activity →
          </Link>
        ) : null}
      </div>
      <ErrorBanner error={error} />
      <div className="otari-overview-activity">
        <DataTable
          ariaLabel={
            month.isCurrent
              ? "Recent failures"
              : `Failures in ${formatUtcMonthName(month.start.getTime())}`
          }
          columns={columns}
          rows={entries}
          getRowKey={(entry) => entry.id}
          isLoading={isLoading}
          emptyContent={`No failed requests ${
            month.isCurrent
              ? "this month"
              : `in ${formatUtcMonthName(month.start.getTime())}`
          }.`}
          onRowAction={
            failuresSearch
              ? (id) =>
                  void navigate({
                    to: "/activity",
                    search: { ...failuresSearch, request: id },
                  })
              : undefined
          }
        />
      </div>
    </section>
  )
}
