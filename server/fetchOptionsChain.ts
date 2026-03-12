import yahooFinance from "yahoo-finance2";

export async function fetchOptionsChain0DTE(symbol: string) {
  try {
    const chain = await yahooFinance.options(symbol, {});

    const expirations = chain.expirationDates;
    if (!expirations || expirations.length === 0) {
      return { calls: [], puts: [], expiration: null };
    }

    // find today's expiration (0DTE)
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    const zeroDTE = expirations.find(exp => exp.toISOString().split("T")[0] === todayStr);
    if (!zeroDTE) {
      return { calls: [], puts: [], expiration: null };
    }

    // fetch only today's chain
    const result = await yahooFinance.options(symbol, { date: zeroDTE });

    const { calls = [], puts = [] } = result.options?.[0] || {};

    return {
      calls,
      puts,
      expiration: zeroDTE,
      timestamp: new Date().toISOString()
    };

  } catch (err) {
    console.error("fetchOptionsChain0DTE error:", err);
    return { calls: [], puts: [], expiration: null };
  }
}
