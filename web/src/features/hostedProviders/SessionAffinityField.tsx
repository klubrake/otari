import { Checkbox } from "@/design-system/forms/Checkbox"

// The implementations whose SDK client takes the header as a default header,
// as `session_affinity_supported` in the gateway's config decides.
const AFFINITY_IMPLEMENTATIONS = new Set([
  "openai",
  "openai-compatible",
  "openai_compatible",
  "anthropic",
  "anthropic-compatible",
  "anthropic_compatible",
])

/** Whether a hosted provider served by `provider` can forward the header. */
export function supportsSessionAffinity(provider: string): boolean {
  return AFFINITY_IMPLEMENTATIONS.has(provider)
}

/**
 * Whether a hosted provider forwards the caller's scoped prompt cache key as
 * `x-session-affinity`. Shared by the add and edit dialogs, which render it
 * only for an implementation that can carry the header.
 */
export function SessionAffinityField({
  isSelected,
  onChange,
}: {
  isSelected: boolean
  onChange: (isSelected: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <Checkbox isSelected={isSelected} onChange={onChange}>
        Session affinity
      </Checkbox>
      <span className="text-caption">
        Sends the caller's prompt cache key, scoped to the caller, as an
        x-session-affinity header, so a backend such as Baseten routes a session
        to the same replica and its prefix cache keeps hitting.
      </span>
    </div>
  )
}
