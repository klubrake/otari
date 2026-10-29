import { FiAlertTriangle } from "react-icons/fi"
import type { KeyRouting, KeyRoutingModel } from "@/client"
import { TextButton } from "@/design-system/actions/TextButton"
import { Tooltip } from "@/design-system/overlays/Tooltip"
import type { KeyModelsSummary } from "./keyModels"

function modelCount(count: number): string {
  return `${count} ${count === 1 ? "model" : "models"}`
}

/**
 * A key's Models lane: what its allow-list reaches, as the providers it draws
 * on and how many models that is, with each provider's count on hover. Pressing
 * it opens Edit, which is where the list is changed.
 */
export function KeyModelsCell({
  summary,
  onOpen,
}: {
  summary: KeyModelsSummary
  onOpen: () => void
}) {
  if (summary.kind !== "selected") {
    return (
      <Tooltip
        content={
          summary.kind === "all"
            ? "Every model its owner may use"
            : "Every request on this key is refused"
        }
        delay={0}
      >
        <span
          className={`text-sm ${summary.kind === "none" ? "text-danger" : ""}`}
        >
          <TextButton onPress={onOpen}>
            {summary.kind === "all" ? "All allowed models" : "No models"}
          </TextButton>
        </span>
      </Tooltip>
    )
  }
  const detail = summary.providers
    .map((provider) => {
      const count = summary.counts.get(provider)
      return count === undefined
        ? provider
        : `${provider}: ${modelCount(count)}`
    })
    .join(" · ")
  return (
    <Tooltip content={detail} delay={0}>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm">
          <TextButton onPress={onOpen}>
            {summary.providers.join(", ")}
          </TextButton>
        </span>
        {summary.total === undefined ? null : (
          <span className="text-caption text-subtle">
            {modelCount(summary.total)}
          </span>
        )}
      </span>
    </Tooltip>
  )
}

/** Why a name has no backup, in the words the Edit dialog and the tooltip share. */
export function noBackupReason(model: KeyRoutingModel): string {
  switch (model.reason) {
    case "single_offering":
      return model.provider
        ? `only ${model.provider} serves it`
        : "one provider serves it"
    case "single_target_policy":
      return "policy with one target"
    case "pinned":
      return model.provider
        ? `pinned to ${model.provider}`
        : "pinned to one provider"
    case "no_allowed_offering":
      return "no provider this key may use serves it"
    default:
      return "no backup"
  }
}

/** The backup state under a name: said in words, with a mark where it needs noticing. */
export function KeyBackupLine({ model }: { model: KeyRoutingModel }) {
  if (model.backup === "no_backup") {
    return (
      <Tooltip content={noBackupReason(model)} delay={0}>
        <span className="flex items-center gap-1.5 text-caption text-warning">
          <FiAlertTriangle aria-hidden className="size-3 shrink-0" />
          No backup
        </span>
      </Tooltip>
    )
  }
  const word =
    model.backup === "has_backup"
      ? "Has backup"
      : model.backup === "subscription"
        ? "Subscription"
        : "Not routed now"
  return <span className="text-caption text-subtle">{word}</span>
}

/**
 * A key's Most-used model lane: the name it sent most in the last 30 days, how
 * many others it sent, and whether a failure on it has somewhere to go.
 * `routing` is absent while the read is in flight or for a key it did not
 * cover, and then the lane says nothing rather than guessing.
 */
export function KeyMostUsedCell({
  routing,
}: {
  routing: KeyRouting | undefined
}) {
  if (!routing) {
    return <span className="text-caption text-subtle">—</span>
  }
  const [top] = routing.models
  if (!top) {
    return <span className="text-caption text-subtle">Not used (30d)</span>
  }
  const others = routing.model_count - 1
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-mono-caption text-foreground">
        {top.name}
        {others > 0 ? <span className="text-subtle"> +{others}</span> : null}
      </span>
      <KeyBackupLine model={top} />
    </span>
  )
}
