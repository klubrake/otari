import { formatUsd } from "@/shared/helpers/format"
import { SplitBar } from "./SplitBar"

/**
 * A total at API prices split straight away into what was billed, which
 * counts toward limits, and what a subscription covered, so the headline is
 * never mistaken for the bill: a bar, then each part with what it means.
 */
export function CostSplit({
  billed,
  subscription,
  subscriptionLabel = "subscription · not billed, no limits",
}: {
  billed: number
  subscription: number
  subscriptionLabel?: string
}) {
  return (
    <span className="flex w-full flex-col gap-1.5 pt-1">
      <SplitBar
        ariaLabel={`${formatUsd(billed)} billed, ${formatUsd(subscription)} subscription`}
        parts={[
          { value: billed, className: "bg-accent" },
          { value: subscription, className: "bg-chart-ramp-4" },
        ]}
      />
      <span className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-2 text-caption whitespace-nowrap">
        <span aria-hidden className="size-2 bg-accent" />
        <span className="text-mono-caption text-foreground">
          {formatUsd(billed)}
        </span>
        <span className="truncate text-subtle">
          billed · counts toward limits
        </span>
        <span aria-hidden className="size-2 bg-chart-ramp-4" />
        <span className="text-mono-caption text-foreground">
          {formatUsd(subscription)}
        </span>
        <span className="truncate text-subtle">{subscriptionLabel}</span>
      </span>
    </span>
  )
}
