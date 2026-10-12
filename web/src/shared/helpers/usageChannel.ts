import type { UsageChannel } from "@/client"

/**
 * The ways a request reaches the usage log, as the server names them: usage an
 * agent reported (imported, not served by Otari), the dashboard's own
 * Playground, or a call to the API. The server's `channel` breakdown and
 * filters share one rule, so the dashboard only names the keys.
 */
export const USAGE_CHANNELS: Record<
  UsageChannel,
  { label: string; hint: string }
> = {
  imported: {
    label: "Subscription (imported)",
    hint: "Usage an agent reported, recorded but not served by Otari",
  },
  api: { label: "API", hint: "Requests Otari served from your own code" },
  playground: { label: "Playground", hint: "The dashboard's own Playground" },
}

/** A channel's label, or the key itself for one this dashboard does not know. */
export function describeChannel(value: string): string {
  return Object.hasOwn(USAGE_CHANNELS, value)
    ? USAGE_CHANNELS[value as UsageChannel].label
    : value
}
