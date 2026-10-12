// A gateway-run tool's price is stored as `input_price_per_million`, which
// `flat_request_cost` reads as USD per *million* calls, so a cent a search is
// stored as 10000. Right for the wire, hostile at a keyboard: the dashboard
// speaks dollars per call and converts here, in one place for every form that
// sets one.
const PER_MILLION = 1_000_000

/**
 * Dollars per call as typed, or undefined for anything but digits with an
 * optional decimal part. Spelled out rather than left to `Number`, which reads
 * "1e3" as 1000 and "0x10" as 16.
 */
export function parsePerCall(text: string): number | undefined {
  const trimmed = text.trim()
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : undefined
}

/** The stored rate for a per-call price, rounded: 0.07 * 1e6 is 70000.00000000001. */
export function perCallToStored(perCall: number): number {
  return Math.round(perCall * PER_MILLION)
}

/** A stored rate as dollars per call. */
export function storedToPerCall(stored: number): number {
  return stored / PER_MILLION
}
