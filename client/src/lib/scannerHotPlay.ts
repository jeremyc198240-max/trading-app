export interface ScannerHotPlayCandidate {
  hasMonsterPlay?: boolean;
  breakoutSignal?: string | null;
  volumeSpike?: number;
  momentumStrength?: number;
  rsiValue?: number;
  squeezeCandles?: number;
  healthGrade?: string;
}

export function calculateScannerTradeQuality(result: ScannerHotPlayCandidate): {
  score: number;
  factors: string[];
} {
  const factors: string[] = [];
  let score = 0;
  const momentum = result.momentumStrength ?? 0;
  const rsi = result.rsiValue ?? 50;
  const isBullish = momentum > 0;
  const hasVolume = (result.volumeSpike ?? 0) >= 1.5;
  const hasBreakoutSignal = result.breakoutSignal === "BREAKOUT" || result.breakoutSignal === "BREAKDOWN";
  const hasExpansion = result.breakoutSignal === "EXPANSION";
  const hasCriticalSqueeze = result.breakoutSignal === "SQUEEZE" && (result.squeezeCandles ?? 0) >= 5;

  if (result.healthGrade === "A") { score += 25; factors.push("Strong health (A)"); }
  else if (result.healthGrade === "B") { score += 20; factors.push("Good health (B)"); }
  else if (result.healthGrade === "C") { score += 10; factors.push("Fair health (C)"); }

  if (isBullish && rsi < 60) { score += 20; factors.push("RSI has room to run"); }
  else if (isBullish && rsi < 70) { score += 10; factors.push("RSI acceptable"); }
  else if (!isBullish && rsi > 40) { score += 20; factors.push("RSI has room to fall"); }
  else if (!isBullish && rsi > 30) { score += 10; factors.push("RSI acceptable"); }
  else if (isBullish && rsi >= 70) factors.push("[!] RSI overbought");
  else if (!isBullish && rsi <= 30) factors.push("[!] RSI oversold");

  const absMomentum = Math.abs(momentum);
  if (absMomentum >= 50) { score += 20; factors.push("Strong momentum"); }
  else if (absMomentum >= 30) { score += 15; factors.push("Good momentum"); }
  else if (absMomentum >= 15) { score += 10; factors.push("Mild momentum"); }

  if (hasVolume) { score += 15; factors.push("Volume confirmed"); }
  else if ((result.volumeSpike ?? 0) >= 1.2) { score += 8; factors.push("Decent volume"); }

  if (hasExpansion) factors.push("Squeeze released!");
  if (hasExpansion) score += 20;
  else if (hasBreakoutSignal) { score += 18; factors.push("Breakout confirmed"); }
  else if (hasCriticalSqueeze) { score += 12; factors.push("Critical squeeze"); }
  else if ((result.squeezeCandles ?? 0) >= 3) { score += 8; factors.push("Building pressure"); }

  return { score, factors };
}

export function isScannerHotPlay(result: ScannerHotPlayCandidate): boolean {
  const hasVolume = (result.volumeSpike ?? 0) >= 1.5;
  const hasStrongMomentum = Math.abs(result.momentumStrength ?? 0) >= 40;
  const { score: tradeQuality } = calculateScannerTradeQuality(result);
  const breakoutSignal = result.breakoutSignal;

  return Boolean(
    result.hasMonsterPlay ||
    breakoutSignal === "MOMENTUM" ||
    (breakoutSignal === "EXPANSION" && (hasVolume || hasStrongMomentum)) ||
    ((breakoutSignal === "BREAKOUT" || breakoutSignal === "BREAKDOWN") && hasVolume && hasStrongMomentum) ||
    (breakoutSignal === "SQUEEZE" && (result.squeezeCandles ?? 0) >= 5 && tradeQuality >= 60 && hasStrongMomentum),
  );
}
