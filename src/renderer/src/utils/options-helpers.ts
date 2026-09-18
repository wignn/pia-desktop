import type { OptionContractData } from '@shared/types'

export interface PairedStrikeRow {
  strike: number
  call?: OptionContractData
  put?: OptionContractData
}

/**
 * Filter calls and puts by selected expiration (if provided)
 * and pair them into unified rows keyed by strike price, sorted ascending.
 */
export function pairOptionContractsByStrike(
  calls: OptionContractData[] = [],
  puts: OptionContractData[] = [],
  selectedExp?: string
): PairedStrikeRow[] {
  const filteredCalls = selectedExp ? calls.filter((c) => c.expiration === selectedExp) : calls

  const filteredPuts = selectedExp ? puts.filter((p) => p.expiration === selectedExp) : puts

  const callMap = new Map<number, OptionContractData>()
  for (const c of filteredCalls) {
    if (!callMap.has(c.strike)) {
      callMap.set(c.strike, c)
    }
  }

  const putMap = new Map<number, OptionContractData>()
  for (const p of filteredPuts) {
    if (!putMap.has(p.strike)) {
      putMap.set(p.strike, p)
    }
  }

  const allStrikes = new Set<number>([...callMap.keys(), ...putMap.keys()])

  const sortedStrikes = Array.from(allStrikes).sort((a, b) => a - b)

  return sortedStrikes.map((strike) => ({
    strike,
    call: callMap.get(strike),
    put: putMap.get(strike)
  }))
}

/**
 * Validates whether the currently selected expiration is valid for the given expirations.
 * Returns the valid expiration, or the first available, or empty string.
 */
export function resolveValidExpiration(
  expirations: string[] | undefined,
  currentSelected: string | null | undefined
): string {
  if (!expirations || expirations.length === 0) return ''
  if (currentSelected && expirations.includes(currentSelected)) {
    return currentSelected
  }
  return expirations[0]
}
