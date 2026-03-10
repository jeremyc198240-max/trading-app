export function normalizeChain(chain: any[], spot: number) {
  return chain
    .filter(c =>
      c.strike &&
      c.bid != null &&
      c.ask != null &&
      c.lastPrice != null
    )
    .map(c => ({
      type: c.contractSymbol.includes("C") ? "CALL" : "PUT",
      strike: c.strike,
      bid: c.bid,
      ask: c.ask,
      last: c.lastPrice,
      volume: c.volume ?? 0,
      openInterest: c.openInterest ?? 0,
      delta: c.delta ?? null,
      gamma: c.gamma ?? null,
      theta: c.theta ?? null,
      vega: c.vega ?? null,
      itm: c.inTheMoney ?? false,
      distance: Math.abs(c.strike - spot),
    }))
    .sort((a, b) => a.distance - b.distance);
}