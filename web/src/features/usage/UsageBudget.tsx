import type { WorkspaceSpend } from "@/client"
import { SpendMeter } from "@/design-system/metrics/SpendMeter"
import { describeBudgetPeriod } from "@/features/activity/WorkspaceBudget"
import {
  formatPct,
  formatUsd,
  formatUsdHeadline,
} from "@/shared/helpers/format"

// Where the figure starts warning, and where it reads as nearly spent.
const NEAR_LIMIT = 0.75
const AT_LIMIT = 0.9

/**
 * The workspace's spend against its ceiling this period: billed spend only,
 * since subscription usage counts toward no limit. Nothing renders for a
 * workspace without a dollar ceiling. Where the workspace keeps its totals
 * from members, a member is given the share used and the cap, not the dollars.
 */
export function UsageBudget({ spend }: { spend: WorkspaceSpend | undefined }) {
  if (!spend?.max_budget) return null
  const cap = spend.max_budget
  // A null `spent` is withheld from this caller; the share still says how full it is.
  const spent = spend.spent ?? undefined
  const share =
    spent !== undefined ? spent / cap : (spend.used_fraction ?? undefined)
  if (share === undefined) return null
  const period = describeBudgetPeriod(spend)
  return (
    // The rule sets it off from the window beside it on a wide row; on a
    // phone the row wraps and it starts a line of its own, with no rule to lean
    // on.
    // `min-w-0` and wrapping words rather than `whitespace-nowrap`: at 320px
    // the figures and the meter beside them are wider than the row.
    <span className="flex max-w-full min-w-0 items-center gap-3.5 xl:border-l xl:border-border xl:pl-4">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-overline">
          Workspace budget{period ? ` · ${period}` : ""}
        </span>
        {spent !== undefined ? (
          <span className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-mono-caption text-foreground">
              {formatUsd(spent)}
            </span>
            <span className="text-caption text-subtle">
              of {formatUsdHeadline(cap)}, billed only
            </span>
          </span>
        ) : (
          <>
            <span className="text-caption text-subtle">
              used of {formatUsdHeadline(cap)}
            </span>
            <span className="text-caption text-subtle">
              Workspace total hidden by your admin
            </span>
          </>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={`text-mono-caption ${
            share >= AT_LIMIT
              ? "text-danger"
              : share >= NEAR_LIMIT
                ? "text-warning"
                : "text-foreground"
          }`}
        >
          {formatPct(share, 0)}
        </span>
        <span className="w-30">
          {/* Against a cap of one where the dollars are withheld, which draws
              the same bar from the share alone. */}
          <SpendMeter
            spent={spent ?? share}
            allocated={spent !== undefined ? cap : 1}
            nearLimitAt={NEAR_LIMIT}
            ariaLabel={
              spent !== undefined
                ? `Workspace budget used: ${formatUsd(spent)} of ${formatUsd(cap)}`
                : `Workspace budget used: ${formatPct(share, 0)} of ${formatUsd(cap)}`
            }
          />
        </span>
      </span>
    </span>
  )
}
