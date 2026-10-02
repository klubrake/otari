import { shortId } from "@/features/activity/activityModel"
import { userDisplay } from "@/features/users/userDisplay"
import { useKeysById } from "@/shared/api/apiKeys"
import type { UsageBreakdownRow } from "@/shared/api/usage"
import { describeChannel } from "@/shared/helpers/usageChannel"
import { type NamedGroup, nameText, rowName } from "./usageModel"
import { DIMENSIONS, type DimensionKey, type UsageFilter } from "./usageQuery"

/**
 * How the page names what it shows: a breakdown row, a chart series, and each
 * value on a filter chip. A key a filter names is looked up by id, so a key
 * picked on the Keys page reads by name even when the window has no traffic.
 */
export function useUsageNames({
  dimension,
  rows,
  filters,
  viewer,
}: {
  dimension: DimensionKey
  rows: readonly UsageBreakdownRow[]
  filters: readonly UsageFilter[]
  viewer: {
    memberLabels: ReadonlyMap<string, string>
    ownUserId: string | undefined
    workspaceId: string
  }
}) {
  const context = {
    memberLabels: viewer.memberLabels,
    ownUserId: viewer.ownUserId,
    currentWorkspaceId: viewer.workspaceId,
  }
  const nameOf = (group: NamedGroup) => rowName(dimension, group, context)
  const pickedKeys = useKeysById(
    filters
      .filter((filter) => filter.dimension === "key")
      .flatMap((filter) => filter.values),
  )

  const valueName = (filter: UsageFilter, value: string) => {
    switch (filter.dimension) {
      case "key": {
        const known = pickedKeys.find((apiKey) => apiKey.id === value)
        return known?.key_name ?? shortId(value)
      }
      case "member":
        return value === viewer.ownUserId
          ? "You"
          : userDisplay(value, undefined, viewer.memberLabels).label
      case "channel":
        return describeChannel(value)
      case "workspace":
        return rows.find((row) => row.key === value)?.label ?? shortId(value)
      default:
        return value
    }
  }

  return {
    nameOf,
    /** A group as one line names it: a chart series, a sort by name. */
    labelOf: (group: NamedGroup) => {
      // A series' group carries no session span; its table row, where there
      // is one, names it the same way the table does.
      const row = rows.find((one) => !one.is_other && one.key === group.key)
      return nameText(nameOf(row ?? group))
    },
    valueName,
    /** A filter as the share card names it: "Model is not: claude-haiku-4-5". */
    describeFilter: (filter: UsageFilter) =>
      `${DIMENSIONS[filter.dimension].label}${filter.mode === "exclude" ? " is not" : ""}: ${filter.values.map((value) => valueName(filter, value)).join(", ")}`,
  }
}
