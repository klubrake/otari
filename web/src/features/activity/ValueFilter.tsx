import { FiFilter, FiSlash } from "react-icons/fi"
import { Button } from "@/design-system/actions/Button"
import { MenuButton, MenuItem } from "@/design-system/overlays/Menu"

/**
 * The filter a cell offers on its own value: only rows with it, or every row
 * but those. Revealed on hover beside the value, and shown outright where the
 * pointer is a finger, which has no hover.
 *
 * Left out of the tab order where the column's own menu in the header reaches
 * the same filters, as on Activity: a control in every cell would put three
 * stops on each row before the next one. A table with no such menu keeps it in
 * the order (`isInTabOrder`), since this is then the keyboard's only way in.
 */
export function ValueFilter({
  value,
  onFilter,
  canExclude = true,
  isInTabOrder = false,
}: {
  value: string
  onFilter: (mode: "include" | "exclude") => void
  /** False where the filter takes one value and has no way to leave one out. */
  canExclude?: boolean
  isInTabOrder?: boolean
}) {
  return (
    // Stops the press reaching the row, which would open the request.
    // biome-ignore lint/a11y/noStaticElementInteractions: a containment boundary, not a control
    // biome-ignore lint/a11y/useKeyWithClickEvents: the controls inside handle their own keys
    <span
      onClick={(event) => event.stopPropagation()}
      className="absolute top-1/2 right-1.5 z-[1] -translate-y-1/2 opacity-0 group-hover/cell:opacity-100 has-[[aria-expanded=true]]:opacity-100 has-[:focus-visible]:opacity-100 pointer-coarse:opacity-100"
    >
      <MenuButton
        label={`Filter by ${value}`}
        placement="bottom"
        onAction={(key) => onFilter(key === "exclude" ? "exclude" : "include")}
        trigger={
          <Button
            size="sm"
            isIconOnly
            aria-label={`Filter by ${value}`}
            excludeFromTabOrder={!isInTabOrder}
            // 44px under a finger, where it shows outright.
            className="size-6 min-w-6 pointer-coarse:size-11 pointer-coarse:min-w-11"
          >
            <FiFilter aria-hidden className="size-3" />
          </Button>
        }
      >
        <MenuItem id="include" icon={FiFilter} textValue={`Only ${value}`}>
          Only <b className="font-medium text-foreground">{value}</b>
        </MenuItem>
        {canExclude ? (
          <MenuItem id="exclude" icon={FiSlash} textValue={`Exclude ${value}`}>
            Exclude <b className="font-medium text-foreground">{value}</b>
          </MenuItem>
        ) : null}
      </MenuButton>
    </span>
  )
}
