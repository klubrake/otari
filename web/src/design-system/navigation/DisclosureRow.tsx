import type { ReactNode } from "react"
import { useId } from "react"
import { FiChevronRight } from "react-icons/fi"

/**
 * A settings row that opens in place, for detail that belongs to the row rather
 * than beside it.
 *
 * The whole row is the button, which is what keeps the target at the row's own
 * size: a chevron is a 16px glyph, and making it the control puts a 16px target
 * in a 44px row. No press transform either, unlike an action button: a row is a
 * surface, and a surface that shrinks under the finger reads as a misfire.
 *
 * Two children of a `SettingsGroup`, not one, so the group's own divider draws
 * the line between the row and the panel it opened.
 */
export function DisclosureRow({
  label,
  help,
  trailing,
  isOpen,
  onToggle,
  chevronPlacement = "end",
  children,
}: {
  label: ReactNode
  help?: ReactNode
  /** A count or a status, at the row's end. */
  trailing?: ReactNode
  isOpen: boolean
  onToggle: () => void
  /**
   * `start` puts the chevron before the label, as a tree does, for a row whose
   * panel holds rows like the ones around it: the open state then reads where
   * the eye starts the row rather than at its far end.
   */
  chevronPlacement?: "start" | "end"
  children: ReactNode
}) {
  const panelId = useId()
  const chevron = (
    <FiChevronRight
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-subtle transition-transform duration-150 ease-out motion-reduce:transition-none ${
        isOpen ? "rotate-90" : ""
      }`}
    />
  )
  return (
    <>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
        // With the chevron at the end, a grid so the status can drop under the
        // label on a phone. Beside the label it took the width first and left
        // the help a one-word column; from `md` it sits on the label's line.
        className={`min-h-11 w-full items-center px-4 py-3 text-left transition-colors duration-150 ease-out hover:bg-surface-subtle focus-visible:otari-focus-ring motion-reduce:transition-none ${
          chevronPlacement === "start"
            ? "flex gap-2"
            : `grid gap-x-3 gap-y-1.5 ${
                trailing
                  ? "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_auto_auto]"
                  : "grid-cols-[minmax(0,1fr)_auto]"
              }`
        }`}
      >
        {chevronPlacement === "start" ? chevron : null}
        <span
          className={`flex min-w-0 flex-col gap-0.5 ${chevronPlacement === "start" ? "flex-1" : "md:pr-3"}`}
        >
          <span className="text-emphasis">{label}</span>
          {help ? (
            <span className="text-caption text-subtle">{help}</span>
          ) : null}
        </span>
        {chevronPlacement === "start" ? (
          trailing ? (
            <span className="flex shrink-0 items-center gap-3">{trailing}</span>
          ) : null
        ) : (
          <>
            {trailing ? (
              <span className="col-start-1 row-start-2 flex items-center md:col-start-2 md:row-start-1">
                {trailing}
              </span>
            ) : null}
            <span
              className={
                trailing
                  ? "col-start-2 row-span-2 row-start-1 flex md:col-start-3 md:row-span-1"
                  : "flex"
              }
            >
              {chevron}
            </span>
          </>
        )}
      </button>
      {/* Rendered whether or not it is open, so `aria-controls` above always
          names an element that exists. `hidden` rather than unmounting: an
          attribute pointing at nothing is worse than a hidden panel, and the
          rows inside cost nothing when the browser is not painting them. */}
      <div id={panelId} hidden={!isOpen}>
        {children}
      </div>
    </>
  )
}
