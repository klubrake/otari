import { useState } from "react"
import { FormDialog } from "@/design-system/feedback/FormDialog"
import { Field } from "@/design-system/forms/Field"
import { describeTool } from "@/features/activity/activityModel"
import { parsePerCall, perCallToStored } from "@/features/tools/toolPrice"
import { useSetPricing } from "@/shared/api/pricing"

/**
 * Sets the per-call price of a tool Otari runs itself, the same rate the Tools
 * page sets, so calls from now on are costed and count toward budgets.
 */
export function ToolPriceDialog({
  tool,
  onClose,
}: {
  /** The tool whose price to set; the dialog is mounted only while one is. */
  tool: string
  onClose: () => void
}) {
  const setPricing = useSetPricing()
  const [draft, setDraft] = useState("")
  const trimmed = draft.trim()
  const perCall = parsePerCall(trimmed)
  return (
    <FormDialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
      title={`${describeTool(tool)} price`}
      description="Calls from now on are costed at this rate and count toward budgets."
      size="sm"
      submitLabel="Set price"
      isPending={setPricing.isPending}
      error={setPricing.error}
      isDirty={trimmed !== ""}
      isSubmitDisabled={perCall === undefined}
      onSubmit={() =>
        setPricing.mutate(
          {
            model_key: `otari:${tool}`,
            input_price_per_million: perCallToStored(perCall ?? 0),
            // A tool call is one unit; there is no output side of it to price.
            output_price_per_million: 0,
            unit: "requests",
          },
          { onSuccess: onClose },
        )
      }
    >
      <Field
        label="USD per call"
        value={draft}
        onChange={setDraft}
        placeholder="0.01"
        autoFocus
        isInvalid={trimmed !== "" && perCall === undefined}
        errorMessage="An amount in dollars, such as 0.01."
      />
    </FormDialog>
  )
}
