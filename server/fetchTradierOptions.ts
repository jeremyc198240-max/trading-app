// fetchTradierOptions.ts - Tradier sandbox options chain fetcher
const TRADIER_API_KEY = 'dB94ZbMNqwU7wuapx4exnCu8gv5J';
const TRADIER_SANDBOX_URL = 'https://sandbox.tradier.com/v1/markets/options/chains';

export async function fetchTradierOptionsChain(symbol: string, expiration: string) {
  const url = `${TRADIER_SANDBOX_URL}?symbol=${encodeURIComponent(symbol)}&expiration=${encodeURIComponent(expiration)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${TRADIER_API_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Tradier API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  // Returns { options: { option: [ ... ] } }
  return data.options?.option || [];
}
