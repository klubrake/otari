/**
 * One quantity split into two parts as a thin bar, each part's width its
 * share. Used where the tiles say what a total is made of: billed and
 * subscription, cache and fresh.
 */
export function SplitBar({
  parts,
  ariaLabel,
}: {
  parts: readonly { value: number; className: string }[]
  ariaLabel: string
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0)
  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className="flex h-1.5 w-full gap-px"
    >
      {total > 0
        ? parts.map((part) =>
            part.value > 0 ? (
              <span
                key={part.className}
                className={part.className}
                style={{ flex: part.value / total }}
              />
            ) : null,
          )
        : null}
    </span>
  )
}
