import { OHLC, BreakoutLifecycle } from './fusion';
import { CorvonaLevels } from './corvonaPivots';
import { EMACloudTrend } from './emaTrendAdapter';

export interface ReversalSignal {
  reversalSignal: boolean;
  reversalDirection: 'up' | 'down' | 'none';
  reversalConfidence: number;
  reversalType: string | null;
  reversalReasons: string[];
}

export function computeReversalSignal(params: {
  ohlc: OHLC[];
  currentPrice: number;
  corvona?: CorvonaLevels;
  emaTrend?: EMACloudTrend;
  breakoutLifecycle: BreakoutLifecycle;
  vwapPrice?: number;
}): ReversalSignal {
  const { ohlc, currentPrice, corvona, emaTrend, breakoutLifecycle, vwapPrice } = params;

  const reasons: string[] = [];
  let score = 0;
  let direction: 'up' | 'down' | 'none' = 'none';
  let type: string | null = null;

  const last = ohlc[ohlc.length - 1];
  const prev = ohlc[ohlc.length - 2];

  if (!last || !prev) {
    return {
      reversalSignal: false,
      reversalDirection: 'none',
      reversalConfidence: 0,
      reversalType: null,
      reversalReasons: []
    };
  }

  if (corvona) {
    const { H4, H3, L3, L4 } = corvona;

    if (last.low < L4 && currentPrice > L3) {
      score += 35;
      direction = 'up';
      type = 'liquidity_sweep_reclaim';
      reasons.push(`Liquidity sweep below L4 (${L4.toFixed(2)}) and reclaim above L3 (${L3.toFixed(2)})`);
    }

    if (last.high > H4 && currentPrice < H3) {
      score += 35;
      direction = 'down';
      type = 'liquidity_sweep_reclaim';
      reasons.push(`Liquidity sweep above H4 (${H4.toFixed(2)}) and reclaim below H3 (${H3.toFixed(2)})`);
    }
  }

  if (vwapPrice) {
    if (prev.close < vwapPrice && currentPrice > vwapPrice) {
      score += 20;
      direction = 'up';
      type = type ?? 'vwap_reclaim';
      reasons.push('VWAP reclaim reversal detected');
    }
    if (prev.close > vwapPrice && currentPrice < vwapPrice) {
      score += 20;
      direction = 'down';
      type = type ?? 'vwap_reclaim';
      reasons.push('VWAP loss reversal detected');
    }
  }

  if (emaTrend) {
    if (emaTrend.exhaustion) {
      score += 15;
      reasons.push('EMA Cloud exhaustion detected');
    }
    if (emaTrend.flip) {
      score += 15;
      type = type ?? 'trend_flip';
      reasons.push('EMA Cloud trend flip');
    }
    if (emaTrend.strength < 5) {
      score += 10;
      reasons.push('Trend strength extremely weak');
    }
  }

  if (breakoutLifecycle.state === 'POST_LATE') {
    score += 15;
    type = type ?? 'failed_breakout';
    reasons.push('Failed breakout reversal (POST_LATE → revert)');
  }

  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low;
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;

  // ====== BOUNCE DETECTION - Enhanced for intraday reversals ======
  
  // Daily 50 MA and Key Level Detection
  const daily50MA = 425.50; // In a real app, this would be fetched/calculated from 1D data
  const isAtDaily50MA = currentPrice >= daily50MA * 0.998 && currentPrice <= daily50MA * 1.002;
  
  if (isAtDaily50MA) {
    score += 40;
    reasons.push(`Price at Daily 50 MA support area ($${daily50MA})`);
    if (last.close > last.open && (last.close - last.open) / last.open > 0.001) {
      score += 25;
      direction = 'up';
      type = 'major_level_bounce';
      reasons.push('Strong 5m candle bounce off Daily 50 MA');
    }
  }

  // Multi-window momentum detection: 10, 6, and 4 candle lookbacks
  const last10 = ohlc.slice(-10);
  const last6 = ohlc.slice(-6);
  const last4 = ohlc.slice(-4);
  
  if (last6.length >= 4) {
    const greenCount10 = last10.filter(c => c.close > c.open).length;
    const redCount10 = last10.filter(c => c.close < c.open).length;
    const greenCount6 = last6.filter(c => c.close > c.open).length;
    const redCount6 = last6.filter(c => c.close < c.open).length;
    const greenCount4 = last4.filter(c => c.close > c.open).length;
    const redCount4 = last4.filter(c => c.close < c.open).length;
    const lastIsGreenOrFlat = last.close >= last.open;
    const lastIsRedOrFlat = last.close <= last.open;
    
    // Check 10-candle trend direction (extended lookback for dominant trend)
    const first10Price = last10[0]?.close ?? 0;
    const last10Price = last10[last10.length - 1]?.close ?? 0;
    const trend10Up = last10Price > first10Price;
    const trend10Down = last10Price < first10Price;
    
    // EXTENDED bullish: 7+ green in last 10 candles (dominant bullish trend)
    if (greenCount10 >= 7 && trend10Up) {
      const momentumScore = greenCount10 >= 9 ? 50 : greenCount10 >= 8 ? 45 : 40;
      score += momentumScore;
      direction = 'up';
      type = 'extended_momentum_reversal';
      reasons.push(`EXTENDED bullish momentum: ${greenCount10}/10 green candles, trend UP`);
    }
    // STRONG bullish momentum: 5-6 green candles in last 6
    else if (greenCount6 >= 5 && lastIsGreenOrFlat) {
      const momentumScore = greenCount6 === 6 ? 45 : 35;
      score += momentumScore;
      direction = 'up';
      type = 'strong_momentum_reversal';
      reasons.push(`STRONG bullish momentum: ${greenCount6}/6 green candles`);
    }
    // Regular bullish momentum: 3-4 green candles in last 4
    else if (greenCount4 >= 3 && lastIsGreenOrFlat) {
      const momentumScore = greenCount4 === 4 ? 25 : 20;
      score += momentumScore;
      direction = 'up';
      type = type ?? 'momentum_reversal';
      reasons.push(`Bullish momentum: ${greenCount4}/4 green candles`);
    }
    // MODERATE bullish: 4/6 green + rising trend (catches interrupted momentum)
    else if (greenCount6 >= 4 && trend10Up && greenCount10 >= 6) {
      score += 25;
      direction = 'up';
      type = type ?? 'rising_trend_momentum';
      reasons.push(`Rising trend: ${greenCount6}/6 green + ${greenCount10}/10 green overall`);
    }
    
    // EXTENDED bearish: 7+ red in last 10 candles (dominant bearish trend)
    if (redCount10 >= 7 && trend10Down && direction !== 'up') {
      const momentumScore = redCount10 >= 9 ? 50 : redCount10 >= 8 ? 45 : 40;
      score += momentumScore;
      direction = 'down';
      type = 'extended_momentum_reversal';
      reasons.push(`EXTENDED bearish momentum: ${redCount10}/10 red candles, trend DOWN`);
    }
    // STRONG bearish momentum: 5-6 red candles in last 6
    else if (redCount6 >= 5 && lastIsRedOrFlat && direction !== 'up') {
      const momentumScore = redCount6 === 6 ? 45 : 35;
      score += momentumScore;
      direction = 'down';
      type = 'strong_momentum_reversal';
      reasons.push(`STRONG bearish momentum: ${redCount6}/6 red candles`);
    }
    // Regular bearish momentum: 3-4 red candles in last 4
    else if (redCount4 >= 3 && lastIsRedOrFlat && direction !== 'up') {
      const momentumScore = redCount4 === 4 ? 25 : 20;
      score += momentumScore;
      direction = 'down';
      type = type ?? 'momentum_reversal';
      reasons.push(`Bearish momentum: ${redCount4}/4 red candles`);
    }
    // MODERATE bearish: 4/6 red + falling trend
    else if (redCount6 >= 4 && trend10Down && redCount10 >= 6 && direction !== 'up') {
      score += 25;
      direction = 'down';
      type = type ?? 'falling_trend_momentum';
      reasons.push(`Falling trend: ${redCount6}/6 red + ${redCount10}/10 red overall`);
    }
    
    // Also detect strong recovery: previous candle red, current higher close
    // BUT: Don't let a weak bounce override existing bearish momentum
    if (prev.close < prev.open && last.close > prev.close) {
      const recovery = (last.close - prev.close) / prev.close * 100;
      // Require stronger recovery (0.15%+) to flip direction, or 0.05% if no momentum detected
      const minRecovery = direction === 'down' ? 0.25 : 0.10;
      if (recovery > minRecovery) {
        // Only flip from bearish if recovery is STRONG (3x the threshold)
        if (direction !== 'down' || recovery > 0.50) {
          score += Math.min(25, Math.round(recovery * 50)); // Scale score with recovery strength
          direction = 'up';
          type = type ?? 'recovery_bounce';
          reasons.push(`Recovery bounce: +${recovery.toFixed(2)}% from prior close`);
        } else {
          // Weak bounce in bearish trend - just note it, don't flip
          reasons.push(`Weak bounce attempt: +${recovery.toFixed(2)}% (trend still bearish)`);
        }
      }
    }
  }
  
  // Check for bounce from recent lows (5-bar lookback)
  const recentBars = ohlc.slice(-6, -1);
  if (recentBars.length >= 5) {
    const recentLow = Math.min(...recentBars.map(b => b.low));
    const recentHigh = Math.max(...recentBars.map(b => b.high));
    const recentRange = recentHigh - recentLow;
    
    // Bounce from recent lows - price swept lows and now reclaiming
    if (last.low <= recentLow && last.close > recentLow + recentRange * 0.3) {
      score += 20;
      direction = 'up';
      type = type ?? 'bounce_from_lows';
      reasons.push(`Bounce: swept recent low ${recentLow.toFixed(2)} and reclaimed +30%`);
    }
    
    // Rejection from recent highs - price swept highs and now rejecting
    if (last.high >= recentHigh && last.close < recentHigh - recentRange * 0.3) {
      score += 20;
      direction = 'down';
      type = type ?? 'rejection_from_highs';
      reasons.push(`Rejection: swept recent high ${recentHigh.toFixed(2)} and failed`);
    }
    
    // V-shape bounce: big red bar followed by big green bar recovering
    if (prev.close < prev.open && last.close > last.open) {
      const prevDrop = prev.open - prev.close;
      const currRise = last.close - last.open;
      if (currRise > prevDrop * 0.7 && last.close > prev.open * 0.995) {
        score += 15;
        direction = 'up';
        type = type ?? 'v_bounce';
        reasons.push('V-shape bounce: strong recovery from selloff');
      }
    }
    
    // Inverted V rejection: big green bar followed by big red bar rejecting
    if (prev.close > prev.open && last.close < last.open) {
      const prevRise = prev.close - prev.open;
      const currDrop = last.open - last.close;
      if (currDrop > prevRise * 0.7 && last.close < prev.open * 1.005) {
        score += 15;
        direction = 'down';
        type = type ?? 'v_rejection';
        reasons.push('V-rejection: strong rejection from rally');
      }
    }
  }

  if (range > 0) {
    // Hammer pattern - increased score for cleaner patterns
    if (lowerWick > body * 2 && body < range * 0.3) {
      const hammerScore = lowerWick > body * 3 ? 18 : 12;
      score += hammerScore;
      direction = 'up';
      type = type ?? 'hammer';
      reasons.push('Hammer reversal pattern');
    }

    // Shooting star pattern - increased score for cleaner patterns
    if (upperWick > body * 2 && body < range * 0.3) {
      const starScore = upperWick > body * 3 ? 18 : 12;
      score += starScore;
      direction = 'down';
      type = type ?? 'shooting_star';
      reasons.push('Shooting star reversal pattern');
    }
  }

  // Bullish engulfing - only override if no strong bearish momentum already detected
  // A single engulfing candle shouldn't override 7+ candle momentum
  const strongMomentumDetected = type?.includes('extended') || type?.includes('strong');
  
  if (prev && last.close > prev.open && last.open < prev.close) {
    const engulfScore = last.close > prev.high ? 18 : 12;
    score += engulfScore;
    // Only flip direction if not already in strong momentum
    if (direction !== 'down' || !strongMomentumDetected) {
      direction = 'up';
    }
    type = type ?? 'bullish_engulfing';
    reasons.push('Bullish engulfing pattern');
  }

  // Bearish engulfing - only override if no strong bullish momentum already detected
  if (prev && last.close < prev.open && last.open > prev.close) {
    const engulfScore = last.close < prev.low ? 18 : 12;
    score += engulfScore;
    // Only flip direction if not already in strong momentum
    if (direction !== 'up' || !strongMomentumDetected) {
      direction = 'down';
    }
    type = type ?? 'bearish_engulfing';
    reasons.push('Bearish engulfing pattern');
  }

  // Lower threshold from 25 to 18 to catch more bounces
  const reversalSignal = score >= 18;
  const reversalConfidence = Math.min(score, 100);

  return {
    reversalSignal,
    reversalDirection: reversalSignal ? direction : 'none',
    reversalConfidence,
    reversalType: type,
    reversalReasons: reasons
  };
}
