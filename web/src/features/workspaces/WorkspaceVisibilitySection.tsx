import { useId } from "react"
import { FiCheck, FiX } from "react-icons/fi"
import { ErrorBanner } from "@/design-system/feedback/ErrorBanner"
import { Toggle } from "@/design-system/forms/Toggle"
import { SettingRow } from "@/design-system/layout/SettingRow"
import { SettingsGroup } from "@/design-system/layout/SettingsGroup"
import {
  useSetWorkspaceVisibility,
  useWorkspaceVisibility,
} from "@/shared/api/workspaces"

/**
 * What members who do not manage the workspace can see beyond their own
 * requests, and the one switch that changes it. Rendered for managers only:
 * a member reads the outcome on Overview and Usage instead.
 */
export function WorkspaceVisibilitySection({
  workspaceId,
}: {
  workspaceId: string
}) {
  const visibility = useWorkspaceVisibility(workspaceId)
  const setVisibility = useSetWorkspaceVisibility(workspaceId)
  const isShown = visibility.data?.members_see_workspace_totals ?? false
  const titleId = useId()
  const totalsLabelId = useId()
  const seesId = useId()

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 id={titleId} className="text-title">
            Workspace visibility
          </h2>
          <span className="text-caption text-subtle">
            Admins only · admins always see everything
          </span>
        </div>
        <p className="text-sm text-muted">
          What members can see beyond their own requests.
        </p>
      </div>
      <ErrorBanner error={setVisibility.error ?? visibility.error} />
      <SettingsGroup isBounded>
        <SettingRow
          label="Workspace totals"
          labelId={totalsLabelId}
          help="Spend, budget used and request counts for the whole workspace. On by default."
          control={
            <Toggle
              label="Workspace totals"
              isSelected={isShown}
              // Withheld until the read answers, so a pending or failed read
              // never offers to write the opposite of what is stored, and
              // while a save is in flight, so two presses cannot settle out
              // of order.
              isDisabled={!visibility.data || setVisibility.isPending}
              onChange={(next) =>
                setVisibility.mutate({ members_see_workspace_totals: next })
              }
            />
          }
        />
      </SettingsGroup>
      <div className="flex flex-col gap-2">
        <h3 id={seesId} className="text-overline">
          A member will see
        </h3>
        <ul aria-labelledby={seesId} className="flex flex-col gap-1.5">
          <SeesRow isSeen>
            Their own requests in Activity, and their own usage
          </SeesRow>
          <SeesRow isSeen={isShown}>
            Workspace totals: spend, budget used, request counts (Overview,
            Usage)
          </SeesRow>
          <SeesRow isSeen={false} isNever>
            Anyone else&rsquo;s individual requests
          </SeesRow>
        </ul>
      </div>
    </section>
  )
}

function SeesRow({
  isSeen,
  isNever = false,
  children,
}: {
  isSeen: boolean
  /** Never shown whatever the setting, which the strike-through says. */
  isNever?: boolean
  children: string | string[]
}) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {isSeen ? (
        <FiCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <FiX aria-hidden className="mt-0.5 size-4 shrink-0 text-subtle" />
      )}
      <span className="sr-only">{isSeen ? "Shown: " : "Not shown: "}</span>
      <span
        className={
          isSeen
            ? "text-foreground"
            : `text-subtle ${isNever ? "line-through" : ""}`
        }
      >
        {children}
      </span>
    </li>
  )
}
