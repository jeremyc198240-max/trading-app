import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, TrendingUp, TrendingDown, Activity, AlertCircle, Clock, Target, ShieldAlert, ArrowUpRight, ArrowDownRight, Minus, Zap, Radio, Radar, BarChart2, Flame, Volume2, ArrowUp, ArrowDown, Gauge, Crosshair, Timer, Bomb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface PatternResult {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  category: string;
  confidence: number;
  description: string;
  priceTarget?: number;
  stopLoss?: number;
}

interface ScannerResult {
  symbol: string;
  patterns: PatternResult[];
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  scanTime: number;
  healthScore: number;
  healthGrade: string;
  hasMonsterPlay: boolean;
  // Enhanced breakout signals
  volumeSpike?: number;
  breakoutScore?: number;
  isNewHigh?: boolean;
  isNewLow?: boolean;
  momentumStrength?: number;
  rsiValue?: number;
  breakoutSignal?: 'BREAKOUT' | 'BREAKDOWN' | 'SQUEEZE' | 'CONSOLIDATING' | 'EXPANSION' | 'BUILDING' | 'MOMENTUM' | null;
  // Squeeze-to-expansion tracking
  wasInSqueeze?: boolean;
  squeezeCandles?: number;
  expansionDirection?: 'bullish' | 'bearish' | null;
  // Warning flags for signal quality
  warnings?: string[];
  signalQuality?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRELIABLE';
  // Compression analysis
  compression?: {
    sparkScore: number;
    phase: 'WAIT' | 'PREPARE' | 'READY' | 'NOW';
    triggers: string[];
    bbWidth: string;
    rangePct: string;
    volRatio: string;
  };
}

interface ScannerStatus {
  isScanning: boolean;
  lastScanTime: number;
  watchlistCount: number;
  resultCount: number;
}

interface ScannerPanelProps { 
  onSelectSymbol?: (symbol: string) => void;
  selectedSymbol?: string;
}

export function ScannerPanel({ onSelectSymbol, selectedSymbol }: ScannerPanelProps) {
  const { data: results, isLoading } = useQuery<ScannerResult[]>({
    queryKey: ["/api/scanner/results"],
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const { data: status } = useQuery<ScannerStatus>({
    queryKey: ["/api/scanner/status"],
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const formatTime = (timestamp: number) => {
    if (!timestamp) return "Never";
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  // Sort results to keep selected symbol at top if it's in the results
  // Otherwise, just show the standard watchlist
  const sortedResults = results ? [...results].sort((a, b) => {
    if (selectedSymbol) {
      if (a.symbol === selectedSymbol) return -1;
      if (b.symbol === selectedSymbol) return 1;
    }
    // SPY and QQQ always near top
    if (a.symbol === 'SPY') return -1;
    if (b.symbol === 'SPY') return 1;
    if (a.symbol === 'QQQ') return -1;
    if (b.symbol === 'QQQ') return 1;
    return 0;
  }) : [];

  // Filter out non-watchlist items that aren't the selected symbol to prevent "sticking"
  // The backend state.watchlist contains the 8 originals
  const filteredResults = sortedResults.filter(r => {
    const isOriginal = ["SPY", "QQQ", "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA"].includes(r.symbol);
    return isOriginal || r.symbol === selectedSymbol;
  });

  return (
    <Card className="relative overflow-hidden border-cyan-500/30">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-blue-500/5" />
      <div className="h-0.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500" />
      
      <CardHeader className="relative py-3 px-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-gradient-to-br from-cyan-500/30 to-blue-500/20 border border-cyan-500/30 shadow-lg shadow-cyan-500/20">
              <Radar className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.5)]" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]">
                Market Scanner
              </span>
              <span className="text-[9px] text-muted-foreground">
                Live Watchlist
              </span>
            </div>
          </div>
          {status?.isScanning && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 border border-emerald-500/30 shadow-sm shadow-emerald-500/20">
              <Radio className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-400 tracking-wider">LIVE</span>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="relative p-3 space-y-3">
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/20">
            <Activity className="w-3 h-3 text-cyan-400" />
            <span className="font-mono font-bold text-cyan-400">8</span>
            <span className="text-muted-foreground text-[10px]">active</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20">
            <AlertCircle className="w-3 h-3 text-amber-400" />
            <span className="font-mono font-bold text-amber-400">{results?.reduce((sum, r) => sum + r.patterns.length, 0) || 0}</span>
            <span className="text-muted-foreground text-[10px]">patterns</span>
          </div>
          <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span className="font-mono">{formatTime(status?.lastScanTime || 0)}</span>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-gradient-to-r from-muted/30 via-muted/20 to-muted/30 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
            {filteredResults.map((result) => (
              <ScannerRow
                key={result.symbol}
                result={result}
                isSelected={selectedSymbol === result.symbol}
                onClick={() => onSelectSymbol?.(result.symbol)}
              />
            ))}
            {(!results || results.length === 0) && (
              <div className="text-center py-8">
                <div className="relative inline-block">
                  <div className="absolute inset-0 rounded-full bg-cyan-500/20 animate-ping" />
                  <Radar className="relative w-10 h-10 mx-auto mb-3 text-cyan-400/50" />
                </div>
                <p className="text-sm text-muted-foreground">Scanning market...</p>
                <p className="text-[10px] text-muted-foreground/50 mt-1">Detecting patterns across watchlist</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScannerRow({ result, onClick, isSelected }: { result: ScannerResult; onClick: () => void; isSelected?: boolean }) {
  const isPositive = result.priceChangePercent >= 0;
  const topPattern = result.patterns[0];
  const absChange = Math.abs(result.priceChangePercent);
  
  const isHighConfidence = topPattern && topPattern.confidence >= 70;
  const isTopGrade = result.healthGrade === 'A' || result.healthGrade === 'B';
  const hasBreakoutSignal = result.breakoutSignal === 'BREAKOUT' || result.breakoutSignal === 'BREAKDOWN';
  const hasExpansion = result.breakoutSignal === 'EXPANSION';
  const hasMomentum = result.breakoutSignal === 'MOMENTUM';
  const hasBuilding = result.breakoutSignal === 'BUILDING';
  const hasVolumeSpike = (result.volumeSpike || 0) >= 1.5;
  const hasCriticalSqueeze = result.breakoutSignal === 'SQUEEZE' && (result.squeezeCandles || 0) >= 5;
  
  // Calculate Trade Quality Score (0-100)
  const momentum = result.momentumStrength || 0;
  const rsi = result.rsiValue || 50;
  const isBullish = momentum > 0;
  
  let tradeQuality = 0;
  const qualityFactors: string[] = [];
  
  // Health Grade contribution (0-25)
  if (result.healthGrade === 'A') { tradeQuality += 25; qualityFactors.push('Strong health (A)'); }
  else if (result.healthGrade === 'B') { tradeQuality += 20; qualityFactors.push('Good health (B)'); }
  else if (result.healthGrade === 'C') { tradeQuality += 10; qualityFactors.push('Fair health (C)'); }
  
  // RSI alignment (0-20) - bullish should have room to run, bearish should be overbought
  if (isBullish && rsi < 60) { tradeQuality += 20; qualityFactors.push('RSI has room to run'); }
  else if (isBullish && rsi < 70) { tradeQuality += 10; qualityFactors.push('RSI acceptable'); }
  else if (!isBullish && rsi > 40) { tradeQuality += 20; qualityFactors.push('RSI has room to fall'); }
  else if (!isBullish && rsi > 30) { tradeQuality += 10; qualityFactors.push('RSI acceptable'); }
  else if (isBullish && rsi >= 70) { qualityFactors.push('[!] RSI overbought'); }
  else if (!isBullish && rsi <= 30) { qualityFactors.push('[!] RSI oversold'); }
  
  // Momentum strength (0-20)
  const absMomentum = Math.abs(momentum);
  if (absMomentum >= 50) { tradeQuality += 20; qualityFactors.push('Strong momentum'); }
  else if (absMomentum >= 30) { tradeQuality += 15; qualityFactors.push('Good momentum'); }
  else if (absMomentum >= 15) { tradeQuality += 10; qualityFactors.push('Mild momentum'); }
  
  // Volume confirmation (0-15)
  if (hasVolumeSpike) { tradeQuality += 15; qualityFactors.push('Volume confirmed'); }
  else if ((result.volumeSpike || 0) >= 1.2) { tradeQuality += 8; qualityFactors.push('Decent volume'); }
  
  // Breakout/Expansion signal (0-20)
  if (hasExpansion) { tradeQuality += 20; qualityFactors.push('Squeeze released!'); }
  else if (hasBreakoutSignal) { tradeQuality += 18; qualityFactors.push('Breakout confirmed'); }
  else if (hasCriticalSqueeze) { tradeQuality += 12; qualityFactors.push('Critical squeeze'); }
  else if ((result.squeezeCandles || 0) >= 3) { tradeQuality += 8; qualityFactors.push('Building pressure'); }
  
  // Determine trade direction
  const tradeDirection: 'LONG' | 'SHORT' | 'WAIT' = 
    hasExpansion ? (result.expansionDirection === 'bullish' ? 'LONG' : 'SHORT') :
    hasBreakoutSignal ? (result.breakoutSignal === 'BREAKOUT' ? 'LONG' : 'SHORT') :
    hasMomentum ? (result.expansionDirection === 'bullish' ? 'LONG' : 'SHORT') :
    hasBuilding ? (result.expansionDirection === 'bullish' ? 'LONG' : 'SHORT') :
    result.breakoutSignal === 'SQUEEZE' ? 'WAIT' :
    isBullish && tradeQuality >= 50 ? 'LONG' :
    !isBullish && tradeQuality >= 50 ? 'SHORT' : 'WAIT';
  
  const tradeQualityLabel = 
    tradeQuality >= 70 ? 'A+' :
    tradeQuality >= 55 ? 'A' :
    tradeQuality >= 40 ? 'B' :
    tradeQuality >= 25 ? 'C' : 'D';
  
  // Hot play detection - VERY selective - only exceptional setups get gold
  // Requirements: Must have VOLUME + MOMENTUM confirmation, not just patterns
  const hasRealVolume = hasVolumeSpike; // Volume must be 1.5x+ average
  const hasStrongMomentum = Math.abs(momentum) >= 40;
  const isHighQuality = tradeQuality >= 60; // A or A+ only
  
  // Only gold for truly exceptional plays:
  // 1. Monster play (already validated)
  // 2. EXPANSION with volume OR momentum
  // 3. BREAKOUT/BREAKDOWN with strong signals
  // 4. MOMENTUM signals (strong directional move)
  // 5. Critical squeeze (5+) with high quality AND strong momentum
  const isHotPlay = result.hasMonsterPlay || 
    hasMomentum ||
    (hasExpansion && (hasRealVolume || hasStrongMomentum)) ||
    (hasBreakoutSignal && hasRealVolume && hasStrongMomentum) ||
    (hasCriticalSqueeze && isHighQuality && hasStrongMomentum);
  
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border cursor-pointer transition-all duration-200",
        "hover-elevate active-elevate-2",
        isSelected && "ring-2 ring-cyan-500 border-cyan-500/50 bg-cyan-500/5",
        isHotPlay && !result.hasMonsterPlay
          ? "border-amber-500/50 shadow-lg shadow-amber-500/20"
          : result.hasMonsterPlay 
            ? "border-purple-500/40 shadow-lg shadow-purple-500/20" 
            : isPositive 
              ? "border-border/50 hover:border-emerald-500/40" 
              : "border-border/50 hover:border-red-500/40"
      )}
      onClick={onClick}
      data-testid={`scanner-row-${result.symbol}`}
    >
      {isHotPlay && !result.hasMonsterPlay && (
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-orange-500/5" />
      )}
      {result.hasMonsterPlay && (
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-transparent to-fuchsia-500/5" />
      )}
      <div className={cn(
        "h-0.5",
        isHotPlay && !result.hasMonsterPlay
          ? "bg-gradient-to-r from-amber-400 via-yellow-500 to-orange-500"
          : result.hasMonsterPlay 
            ? "bg-gradient-to-r from-purple-500 via-fuchsia-500 to-purple-500"
            : isPositive 
              ? "bg-gradient-to-r from-emerald-500/50 to-emerald-500/20"
              : "bg-gradient-to-r from-red-500/50 to-red-500/20"
      )} />
      
      <div className="relative p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                {isHotPlay && !result.hasMonsterPlay && (
                  <Flame className="w-3.5 h-3.5 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.6)] animate-pulse" />
                )}
                {result.hasMonsterPlay && (
                  <Zap className="w-3.5 h-3.5 text-purple-400 drop-shadow-[0_0_4px_rgba(168,85,247,0.5)] animate-pulse" />
                )}
                <span className={cn(
                  "font-mono font-bold text-sm tracking-wide",
                  isHotPlay && !result.hasMonsterPlay
                    ? "text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.5)]"
                    : result.hasMonsterPlay 
                      ? "text-purple-400 drop-shadow-[0_0_4px_rgba(168,85,247,0.4)]" 
                      : ""
                )}>{result.symbol}</span>
              </div>
              {isHotPlay && (
                <Badge 
                  variant="outline" 
                  className="text-[7px] font-bold px-1 py-0 mt-0.5 w-fit bg-gradient-to-r from-amber-500/30 to-orange-500/30 text-amber-300 border-amber-400/60 shadow-sm shadow-amber-500/20"
                >
                  HOT
                </Badge>
              )}
            </div>
            <GradeBadge grade={result.healthGrade} />
            
            {/* Signal Quality / Warning Indicator */}
            {result.signalQuality && result.signalQuality !== 'HIGH' && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge 
                    variant="outline"
                    data-testid={`badge-signal-quality-${result.symbol}`}
                    className={cn(
                      "text-[7px] font-bold px-1 py-0",
                      result.signalQuality === 'UNRELIABLE' && "bg-red-500/20 text-red-400 border-red-500/40 animate-pulse",
                      result.signalQuality === 'LOW' && "bg-orange-500/20 text-orange-400 border-orange-500/40",
                      result.signalQuality === 'MEDIUM' && "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                    )}
                  >
                    <AlertCircle className="w-2 h-2 mr-0.5" />
                    {result.signalQuality === 'UNRELIABLE' ? '!' : result.signalQuality === 'LOW' ? '?' : '~'}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-[250px]">
                  <div className="space-y-1">
                    <div className="font-semibold text-amber-400">Signal Quality: {result.signalQuality}</div>
                    {result.warnings?.map((warning, i) => (
                      <div key={i} className="text-muted-foreground text-[10px] flex items-center gap-1" data-testid={`warning-item-${i}`}>
                        {warning.includes('LOW_VOLUME') && <AlertCircle className="w-2.5 h-2.5 text-orange-400 flex-shrink-0" />}
                        {warning.includes('CONFLICT') && <AlertCircle className="w-2.5 h-2.5 text-red-400 flex-shrink-0" />}
                        {warning.includes('CMF_DIVERGE') && <AlertCircle className="w-2.5 h-2.5 text-yellow-400 flex-shrink-0" />}
                        {warning.includes('CONSOLIDATION') && <Clock className="w-2.5 h-2.5 text-blue-400 flex-shrink-0" />}
                        {warning.includes('BUILDING') && <Timer className="w-2.5 h-2.5 text-cyan-400 flex-shrink-0" />}
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            
            {/* Trade Quality + Direction Badge */}
            <Tooltip>
              <TooltipTrigger>
                <Badge 
                  variant="outline"
                  className={cn(
                    "text-[8px] font-bold px-1.5 py-0",
                    tradeDirection === 'LONG' && tradeQuality >= 55 
                      ? "bg-gradient-to-r from-emerald-500/25 to-cyan-500/25 text-emerald-400 border-emerald-500/50"
                      : tradeDirection === 'SHORT' && tradeQuality >= 55
                        ? "bg-gradient-to-r from-red-500/25 to-orange-500/25 text-red-400 border-red-500/50"
                        : tradeDirection === 'WAIT'
                          ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                          : tradeDirection === 'LONG'
                            ? "bg-emerald-500/10 text-emerald-400/70 border-emerald-500/30"
                            : "bg-red-500/10 text-red-400/70 border-red-500/30"
                  )}
                >
                  {tradeDirection === 'LONG' && <ArrowUp className="w-2 h-2 mr-0.5" />}
                  {tradeDirection === 'SHORT' && <ArrowDown className="w-2 h-2 mr-0.5" />}
                  {tradeDirection === 'WAIT' && <Clock className="w-2 h-2 mr-0.5" />}
                  {tradeQualityLabel}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[220px]">
                <div className="space-y-1.5">
                  <div className="font-semibold flex items-center gap-1">
                    Trade Quality: {tradeQualityLabel} ({tradeQuality}/100)
                    {tradeDirection !== 'WAIT' && (
                      <span className={tradeDirection === 'LONG' ? 'text-emerald-400' : 'text-red-400'}>
                        → {tradeDirection}
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {qualityFactors.map((factor, i) => (
                      <div key={i} className="text-muted-foreground">{factor}</div>
                    ))}
                  </div>
                  {tradeDirection === 'WAIT' && (
                    <div className="text-yellow-400 text-[10px]">Wait for breakout confirmation</div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className={cn(
                "font-mono text-sm font-bold tabular-nums",
                isHotPlay && !result.hasMonsterPlay
                  ? "text-amber-400 drop-shadow-[0_0_3px_rgba(251,191,36,0.4)]"
                  : isPositive ? "text-emerald-400" : "text-red-400"
              )}>
                ${result.lastPrice.toFixed(2)}
              </div>
              <div className={cn(
                "text-[10px] font-mono flex items-center justify-end gap-0.5",
                isHotPlay && !result.hasMonsterPlay
                  ? "text-amber-400/80"
                  : isPositive ? "text-emerald-400/80" : "text-red-400/80"
              )}>
                {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {isPositive ? "+" : ""}{result.priceChangePercent.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>

        {/* Breakout Signals Row */}
        <div className="mt-2 pt-2 border-t border-border/30">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              {/* Breakout Signal Badge */}
              {result.breakoutSignal && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge 
                      variant="outline"
                      className={cn(
                        "text-[8px] font-bold px-1.5 py-0",
                        result.breakoutSignal === 'EXPANSION' && "bg-gradient-to-r from-cyan-500/30 via-blue-500/30 to-purple-500/30 text-cyan-300 border-cyan-400/60 shadow-md shadow-cyan-500/40 animate-pulse",
                        result.breakoutSignal === 'BREAKOUT' && "bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-emerald-400 border-emerald-500/40 shadow-sm shadow-emerald-500/30 animate-pulse",
                        result.breakoutSignal === 'BREAKDOWN' && "bg-gradient-to-r from-red-500/20 to-orange-500/20 text-red-400 border-red-500/40 shadow-sm shadow-red-500/30 animate-pulse",
                        result.breakoutSignal === 'MOMENTUM' && "bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-400 border-purple-500/40 shadow-sm shadow-purple-500/30 animate-pulse",
                        result.breakoutSignal === 'BUILDING' && "bg-gradient-to-r from-blue-500/20 to-indigo-500/20 text-blue-400 border-blue-500/40",
                        result.breakoutSignal === 'SQUEEZE' && "bg-gradient-to-r from-yellow-500/20 to-amber-500/20 text-yellow-400 border-yellow-500/40",
                        result.breakoutSignal === 'CONSOLIDATING' && "bg-muted/50 text-muted-foreground border-muted"
                      )}
                    >
                      {result.breakoutSignal === 'EXPANSION' && <Zap className="w-2.5 h-2.5 mr-0.5" />}
                      {result.breakoutSignal === 'BREAKOUT' && <ArrowUp className="w-2.5 h-2.5 mr-0.5" />}
                      {result.breakoutSignal === 'BREAKDOWN' && <ArrowDown className="w-2.5 h-2.5 mr-0.5" />}
                      {result.breakoutSignal === 'MOMENTUM' && <Flame className="w-2.5 h-2.5 mr-0.5" />}
                      {result.breakoutSignal === 'BUILDING' && <Activity className="w-2.5 h-2.5 mr-0.5" />}
                      {result.breakoutSignal === 'SQUEEZE' && <Crosshair className="w-2.5 h-2.5 mr-0.5" />}
                      {result.breakoutSignal === 'EXPANSION' ? (
                        <span className="flex items-center gap-0.5">
                          EXPAND
                          {result.expansionDirection === 'bullish' && <ArrowUp className="w-2 h-2" />}
                          {result.expansionDirection === 'bearish' && <ArrowDown className="w-2 h-2" />}
                        </span>
                      ) : result.breakoutSignal === 'MOMENTUM' ? (
                        <span className="flex items-center gap-0.5">
                          MOVE
                          {result.expansionDirection === 'bullish' && <ArrowUp className="w-2 h-2" />}
                          {result.expansionDirection === 'bearish' && <ArrowDown className="w-2 h-2" />}
                        </span>
                      ) : result.breakoutSignal === 'BUILDING' ? (
                        <span className="flex items-center gap-0.5">
                          SETUP
                          {result.expansionDirection === 'bullish' && <ArrowUp className="w-2 h-2" />}
                          {result.expansionDirection === 'bearish' && <ArrowDown className="w-2 h-2" />}
                        </span>
                      ) : result.breakoutSignal}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[200px]">
                    {result.breakoutSignal === 'EXPANSION' && (
                      <span>Squeeze released! {result.wasInSqueeze && `Was compressed for ${result.squeezeCandles} scans.`} Direction: {result.expansionDirection || 'undetermined'}</span>
                    )}
                    {result.breakoutSignal === 'SQUEEZE' && (
                      <span>Volatility compressed - building energy for expansion. {(result.squeezeCandles || 0) > 0 && `In squeeze for ${result.squeezeCandles} scans.`}</span>
                    )}
                    {result.breakoutSignal === 'BREAKOUT' && "Price breaking higher with volume + momentum confirmation"}
                    {result.breakoutSignal === 'BREAKDOWN' && "Price breaking lower with volume + momentum confirmation"}
                    {result.breakoutSignal === 'MOMENTUM' && `Strong ${result.expansionDirection} momentum detected - catching the move!`}
                    {result.breakoutSignal === 'BUILDING' && `Setup developing - ${result.expansionDirection} pressure building`}
                    {result.breakoutSignal === 'CONSOLIDATING' && "Price ranging, waiting for direction"}
                  </TooltipContent>
                </Tooltip>
              )}
              
              {/* Squeeze Pressure Indicator */}
              {result.breakoutSignal === 'SQUEEZE' && (result.squeezeCandles || 0) >= 2 && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge 
                      variant="outline"
                      className={cn(
                        "text-[8px] px-1 py-0 font-bold",
                        (result.squeezeCandles || 0) >= 5 
                          ? "bg-gradient-to-r from-red-500/30 to-orange-500/30 text-red-400 border-red-500/50 shadow-sm shadow-red-500/30 animate-pulse"
                          : (result.squeezeCandles || 0) >= 3
                            ? "bg-gradient-to-r from-orange-500/25 to-amber-500/25 text-orange-400 border-orange-500/40"
                            : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                      )}
                    >
                      {(result.squeezeCandles || 0) >= 5 ? (
                        <Bomb className="w-2.5 h-2.5 mr-0.5" />
                      ) : (
                        <Timer className="w-2.5 h-2.5 mr-0.5" />
                      )}
                      {(result.squeezeCandles || 0) >= 5 ? 'CRITICAL' : 
                       (result.squeezeCandles || 0) >= 3 ? 'HOT' : 'BUILDING'}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[180px]">
                    <div className="space-y-1">
                      <div className="font-semibold">
                        {(result.squeezeCandles || 0) >= 5 ? '🔥 Critical Pressure!' : 
                         (result.squeezeCandles || 0) >= 3 ? '⚠️ Building Heat' : 'Warming Up'}
                      </div>
                      <div>Compressed for {result.squeezeCandles} scans</div>
                      <div className="text-muted-foreground">
                        {(result.squeezeCandles || 0) >= 5 
                          ? 'Ready to explode - watch for volume spike!' 
                          : 'Energy building, watch for expansion'}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
              
              {/* Volume Spike Indicator */}
              {hasVolumeSpike && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge 
                      variant="outline"
                      className="text-[8px] px-1 py-0 bg-cyan-500/15 text-cyan-400 border-cyan-500/40"
                    >
                      <Volume2 className="w-2.5 h-2.5 mr-0.5" />
                      {(result.volumeSpike || 0).toFixed(1)}x
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Volume {((result.volumeSpike || 1) * 100).toFixed(0)}% of daily avg
                  </TooltipContent>
                </Tooltip>
              )}
              
              {/* New High/Low Badge */}
              {result.isNewHigh && (
                <Badge variant="outline" className="text-[8px] px-1 py-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/40">
                  <TrendingUp className="w-2.5 h-2.5 mr-0.5" />
                  NEW HIGH
                </Badge>
              )}
              {result.isNewLow && (
                <Badge variant="outline" className="text-[8px] px-1 py-0 bg-red-500/15 text-red-400 border-red-500/40">
                  <TrendingDown className="w-2.5 h-2.5 mr-0.5" />
                  NEW LOW
                </Badge>
              )}
            </div>
            
            {/* Momentum & RSI Indicators */}
            <div className="flex items-center gap-2">
              {result.momentumStrength !== undefined && (
                <Tooltip>
                  <TooltipTrigger>
                    <div className="flex items-center gap-1">
                      <Gauge className={cn(
                        "w-3 h-3",
                        result.momentumStrength > 30 ? "text-emerald-400" :
                        result.momentumStrength < -30 ? "text-red-400" : "text-muted-foreground"
                      )} />
                      <span className={cn(
                        "text-[9px] font-mono",
                        result.momentumStrength > 30 ? "text-emerald-400" :
                        result.momentumStrength < -30 ? "text-red-400" : "text-muted-foreground"
                      )}>
                        {result.momentumStrength > 0 ? '+' : ''}{result.momentumStrength}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Momentum: {result.momentumStrength > 30 ? 'Strong Bullish' : 
                               result.momentumStrength > 0 ? 'Weak Bullish' :
                               result.momentumStrength < -30 ? 'Strong Bearish' : 'Weak Bearish'}
                  </TooltipContent>
                </Tooltip>
              )}
              
              {result.rsiValue !== undefined && (
                <Tooltip>
                  <TooltipTrigger>
                    <span className={cn(
                      "text-[9px] font-mono px-1 rounded",
                      result.rsiValue >= 70 ? "bg-red-500/20 text-red-400" :
                      result.rsiValue <= 30 ? "bg-emerald-500/20 text-emerald-400" :
                      "text-muted-foreground"
                    )}>
                      RSI {result.rsiValue}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {result.rsiValue >= 70 ? 'Overbought' : 
                     result.rsiValue <= 30 ? 'Oversold' : 'Neutral'}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>

        {topPattern && (
          <div className="mt-2 pt-2 border-t border-border/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge 
                  variant="outline"
                  className={cn(
                    "text-[9px] font-semibold px-1.5 py-0",
                    topPattern.type === 'bullish' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                    topPattern.type === 'bearish' && "bg-red-500/10 text-red-400 border-red-500/30",
                    topPattern.type === 'neutral' && "bg-muted text-muted-foreground border-muted"
                  )}
                >
                  {topPattern.type === 'bullish' && <TrendingUp className="w-2.5 h-2.5 mr-0.5" />}
                  {topPattern.type === 'bearish' && <TrendingDown className="w-2.5 h-2.5 mr-0.5" />}
                  {topPattern.type === 'neutral' && <Minus className="w-2.5 h-2.5 mr-0.5" />}
                  {topPattern.name.slice(0, 15)}
                </Badge>
                <span className="text-[9px] text-muted-foreground">
                  {Math.round(topPattern.confidence)}% conf
                </span>
              </div>
              {result.patterns.length > 1 && (
                <span className="text-[9px] text-muted-foreground/60">
                  +{result.patterns.length - 1} more
                </span>
              )}
            </div>
          </div>
        )}

        {result.compression && result.compression.sparkScore > 0 && (
          <div className="mt-2 pt-2 border-t border-border/30">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Zap className={cn(
                  "w-3 h-3",
                  result.compression.phase === 'NOW' && "text-amber-400 animate-pulse",
                  result.compression.phase === 'READY' && "text-purple-400",
                  result.compression.phase === 'PREPARE' && "text-cyan-400",
                  result.compression.phase === 'WAIT' && "text-muted-foreground"
                )} />
                <span className={cn(
                  "text-[9px] font-bold uppercase tracking-wider",
                  result.compression.phase === 'NOW' && "text-amber-400",
                  result.compression.phase === 'READY' && "text-purple-400",
                  result.compression.phase === 'PREPARE' && "text-cyan-400",
                  result.compression.phase === 'WAIT' && "text-muted-foreground"
                )}>
                  {result.compression.phase}
                </span>
                <span className="text-[9px] text-muted-foreground font-mono">
                  {result.compression.sparkScore}/100
                </span>
              </div>
              <Tooltip>
                <TooltipTrigger>
                  <div className="flex items-center gap-1">
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          result.compression.sparkScore >= 70 && "bg-gradient-to-r from-amber-500 to-orange-500",
                          result.compression.sparkScore >= 50 && result.compression.sparkScore < 70 && "bg-gradient-to-r from-purple-500 to-fuchsia-500",
                          result.compression.sparkScore >= 30 && result.compression.sparkScore < 50 && "bg-gradient-to-r from-cyan-500 to-blue-500",
                          result.compression.sparkScore < 30 && "bg-muted-foreground/30"
                        )}
                        style={{ width: `${Math.min(100, result.compression.sparkScore)}%` }}
                      />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[200px]">
                  <div className="font-semibold mb-1">Compression Analysis</div>
                  <div className="text-muted-foreground">BB: {result.compression.bbWidth}% | Range: {result.compression.rangePct}%</div>
                  {result.compression.triggers.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {result.compression.triggers.map((t, i) => (
                        <div key={i} className="text-[10px]">{t}</div>
                      ))}
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GradeBadge({ grade }: { grade: string }) {
  const gradeColors: Record<string, string> = {
    'A': 'bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-emerald-500/20',
    'B': 'bg-gradient-to-r from-cyan-500/20 to-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-cyan-500/20',
    'C': 'bg-gradient-to-r from-amber-500/20 to-amber-500/10 text-amber-400 border-amber-500/30 shadow-amber-500/20',
    'D': 'bg-gradient-to-r from-orange-500/20 to-orange-500/10 text-orange-400 border-orange-500/30 shadow-orange-500/20',
    'F': 'bg-gradient-to-r from-red-500/20 to-red-500/10 text-red-400 border-red-500/30 shadow-red-500/20',
  };
  
  return (
    <Badge 
      variant="outline"
      className={cn(
        "text-[10px] font-bold px-1.5 py-0 shadow-sm",
        gradeColors[grade] || gradeColors['C']
      )}
    >
      {grade}
    </Badge>
  );
}

interface PatternResponse {
  symbol: string;
  patterns: PatternResult[];
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  scanTime: number;
  healthScore: number;
  healthGrade: string;
  hasMonsterPlay: boolean;
}

function CandlestickPattern({ pattern, type }: { pattern: string; type: 'bullish' | 'bearish' | 'neutral' }) {
  const bullishColor = "bg-emerald-400";
  const bearishColor = "bg-red-400";
  const bullishGlow = "shadow-[0_0_8px_rgba(52,211,153,0.6)]";
  const bearishGlow = "shadow-[0_0_8px_rgba(248,113,113,0.6)]";
  const wickColor = type === 'bullish' ? "bg-emerald-300/80" : type === 'bearish' ? "bg-red-300/80" : "bg-cyan-300/60";
  const bodyGlow = type === 'bullish' ? bullishGlow : type === 'bearish' ? bearishGlow : "";
  
  const patternLower = pattern.toLowerCase();
  
  if (patternLower.includes('hammer') || patternLower.includes('pin bar')) {
    return (
      <div className="flex items-end justify-center gap-0.5 h-10 w-8">
        <div className="flex flex-col items-center">
          <div className={cn("w-[2px] h-1", wickColor)} />
          <div className={cn("w-3 h-2.5 rounded-sm", bullishColor, bullishGlow)} />
          <div className={cn("w-[2px] h-5", wickColor)} />
        </div>
      </div>
    );
  }
  
  if (patternLower.includes('shooting star') || patternLower.includes('inverted')) {
    return (
      <div className="flex items-end justify-center gap-0.5 h-10 w-8">
        <div className="flex flex-col items-center">
          <div className={cn("w-[2px] h-5", wickColor)} />
          <div className={cn("w-3 h-2.5 rounded-sm", bearishColor, bearishGlow)} />
          <div className={cn("w-[2px] h-1", wickColor)} />
        </div>
      </div>
    );
  }
  
  if (patternLower.includes('engulfing')) {
    return (
      <div className="flex items-end justify-center gap-1 h-10 w-12">
        <div className="flex flex-col items-center">
          <div className={cn("w-[2px] h-1", wickColor)} />
          <div className={cn("w-2 h-3.5 rounded-sm opacity-70", type === 'bullish' ? bearishColor : bullishColor)} />
          <div className={cn("w-[2px] h-0.5", wickColor)} />
        </div>
        <div className="flex flex-col items-center">
          <div className={cn("w-[2px] h-0.5", wickColor)} />
          <div className={cn("w-3.5 h-6 rounded-sm", type === 'bullish' ? bullishColor : bearishColor, bodyGlow)} />
          <div className={cn("w-[2px] h-1", wickColor)} />
        </div>
      </div>
    );
  }
  
  if (patternLower.includes('doji')) {
    return (
      <div className="flex items-center justify-center gap-0.5 h-10 w-8">
        <div className="flex flex-col items-center">
          <div className={cn("w-[2px] h-4", wickColor)} />
          <div className="w-3 h-[3px] rounded-sm bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]" />
          <div className={cn("w-[2px] h-4", wickColor)} />
        </div>
      </div>
    );
  }
  
  if (patternLower.includes('morning star') || patternLower.includes('three white')) {
    return (
      <div className="flex items-end justify-center gap-0.5 h-10 w-14">
        <div className="flex flex-col items-center">
          <div className={cn("w-[2px] h-1", wickColor)} />
          <div className={cn("w-2 h-5 rounded-sm opacity-70", bearishColor)} />
        </div>
        <div className="flex flex-col items-center justify-end mb-1">
          <div className={cn("w-1.5 h-2 rounded-sm", bullishColor)} />
          <div className={cn("w-[2px] h-0.5", wickColor)} />
        </div>
        <div className="flex flex-col items-center">
          <div className={cn("w-2 h-6 rounded-sm", bullishColor, bullishGlow)} />
          <div className={cn("w-[2px] h-0.5", wickColor)} />
        </div>
      </div>
    );
  }
  
  if (patternLower.includes('evening star') || patternLower.includes('three black')) {
    return (
      <div className="flex items-end justify-center gap-0.5 h-10 w-14">
        <div className="flex flex-col items-center">
          <div className={cn("w-2 h-6 rounded-sm opacity-70", bullishColor)} />
          <div className={cn("w-[2px] h-0.5", wickColor)} />
        </div>
        <div className="flex flex-col items-center justify-start mt-1">
          <div className={cn("w-[2px] h-0.5", wickColor)} />
          <div className={cn("w-1.5 h-2 rounded-sm", bearishColor)} />
        </div>
        <div className="flex flex-col items-center">
          <div className={cn("w-[2px] h-1", wickColor)} />
          <div className={cn("w-2 h-5 rounded-sm", bearishColor, bearishGlow)} />
        </div>
      </div>
    );
  }
  
  if (patternLower.includes('marubozu') || patternLower.includes('strong')) {
    return (
      <div className="flex items-end justify-center gap-0.5 h-10 w-8">
        <div className="flex flex-col items-center">
          <div className={cn("w-3.5 h-8 rounded-sm", type === 'bullish' ? bullishColor : bearishColor, bodyGlow)} />
        </div>
      </div>
    );
  }
  
  if (patternLower.includes('harami')) {
    return (
      <div className="flex items-end justify-center gap-0.5 h-10 w-10">
        <div className="flex flex-col items-center">
          <div className={cn("w-[2px] h-0.5", wickColor)} />
          <div className={cn("w-3.5 h-6 rounded-sm opacity-70", type === 'bullish' ? bearishColor : bullishColor)} />
          <div className={cn("w-[2px] h-0.5", wickColor)} />
        </div>
        <div className="flex flex-col items-center justify-center -ml-2">
          <div className={cn("w-[2px] h-0.5", wickColor)} />
          <div className={cn("w-2 h-2.5 rounded-sm", type === 'bullish' ? bullishColor : bearishColor, bodyGlow)} />
          <div className={cn("w-[2px] h-0.5", wickColor)} />
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex items-end justify-center gap-0.5 h-10 w-8">
      <div className="flex flex-col items-center">
        <div className={cn("w-[2px] h-2", wickColor)} />
        <div className={cn("w-3 h-5 rounded-sm", type === 'bullish' ? bullishColor : type === 'bearish' ? bearishColor : "bg-cyan-400", bodyGlow)} />
        <div className={cn("w-[2px] h-1.5", wickColor)} />
      </div>
    </div>
  );
}

function ConfidenceRing({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence > 1 ? confidence : confidence * 100);
  const circumference = 2 * Math.PI * 18;
  const strokeDashoffset = circumference - (percent / 100) * circumference;
  
  const getColor = () => {
    if (percent >= 80) return { stroke: "#10b981", glow: "drop-shadow(0 0 6px rgba(16,185,129,0.8))", text: "text-emerald-400" };
    if (percent >= 60) return { stroke: "#22d3ee", glow: "drop-shadow(0 0 6px rgba(34,211,238,0.7))", text: "text-cyan-400" };
    if (percent >= 40) return { stroke: "#f59e0b", glow: "drop-shadow(0 0 6px rgba(245,158,11,0.7))", text: "text-amber-400" };
    return { stroke: "#6b7280", glow: "", text: "text-muted-foreground" };
  };
  
  const color = getColor();
  
  return (
    <div className="relative w-12 h-12 flex-shrink-0">
      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 40 40" style={{ filter: color.glow }}>
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted/20"
        />
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          stroke={color.stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("text-[11px] font-mono font-black", color.text)}>{percent}</span>
      </div>
    </div>
  );
}

// Calculate pattern success rate and grade based on pattern characteristics
// IMPORTANT: These are THEORETICAL estimates, not guaranteed outcomes
// Real backtest on SPY 5m data shows ~52% overall win rate
function getPatternStats(pattern: PatternResult) {
  const baseRate = pattern.confidence > 1 ? pattern.confidence : pattern.confidence * 100;
  const patternName = pattern.name.toLowerCase();
  
  // REALISTIC success rates based on actual market behavior
  // Note: All patterns have inherent uncertainty - use proper risk management
  let successBonus = 0;
  let historicalWinRate = 50; // Base 50% - coin flip baseline
  let tradeInstruction = '';
  
  if (patternName.includes('engulfing')) { 
    historicalWinRate = 55; successBonus = 5;
    tradeInstruction = pattern.type === 'bullish' 
      ? 'BULLISH ENGULFING detected. Wait for the candle to close, then enter LONG on a break above the engulfing candle high. Place stop loss below the engulfing candle low. Target minimum 2:1 reward-to-risk. Best at key support levels with above-average volume. RISK WARNING: Even the best patterns fail ~45% of the time. Use strict position sizing.'
      : 'BEARISH ENGULFING detected. Wait for candle close, then enter SHORT on a break below the engulfing candle low. Stop loss above the high. Target minimum 2:1 R:R. Look for this at resistance levels with volume confirmation. RISK WARNING: Patterns are not guarantees. Always use stop losses.';
  }
  else if (patternName.includes('hammer')) { 
    historicalWinRate = 52; successBonus = 3;
    tradeInstruction = 'HAMMER pattern detected. Enter LONG when price breaks above the hammer high. Stop loss below the hammer low. Target nearest resistance with minimum 2:1 R:R. Most reliable at key support levels with volume confirmation. RISK WARNING: Hammer patterns fail frequently in choppy markets.';
  }
  else if (patternName.includes('morning star')) { 
    historicalWinRate = 56; successBonus = 6;
    tradeInstruction = 'MORNING STAR - A three-candle bullish reversal pattern. Enter LONG on the close of the third candle. Stop below the star candle low. Target 2:1 R:R minimum. Best when star gaps down. RISK WARNING: No pattern guarantees profits. Use proper position sizing.';
  }
  else if (patternName.includes('evening star')) { 
    historicalWinRate = 55; successBonus = 5;
    tradeInstruction = 'EVENING STAR - A three-candle bearish reversal pattern. Enter SHORT on the close of the third candle. Stop above the star candle high. Target 2:1 R:R. Best at resistance levels. RISK WARNING: Patterns fail regularly. Never risk more than you can afford to lose.';
  }
  else if (patternName.includes('doji')) { 
    historicalWinRate = 48; successBonus = -2;
    tradeInstruction = 'DOJI detected - Market indecision. DO NOT trade the doji alone. Wait for a confirmation candle. If next candle is bullish, LONG with stop below doji. If bearish, SHORT with stop above. Use small position size. RISK WARNING: Doji alone is not a reliable signal.';
  }
  else if (patternName.includes('shooting star')) { 
    historicalWinRate = 51; successBonus = 2;
    tradeInstruction = 'SHOOTING STAR detected. Enter SHORT when price breaks below the shooting star low. Stop above the upper wick. Target nearest support with 2:1 R:R. Most reliable after uptrend at resistance. RISK WARNING: Pattern success varies greatly by market conditions.';
  }
  else if (patternName.includes('harami')) { 
    historicalWinRate = 50; successBonus = 0;
    tradeInstruction = pattern.type === 'bullish'
      ? 'BULLISH HARAMI - Wait for volume confirmation. Enter LONG on break above harami high. Stop below harami low. Target 2:1 R:R. Consider waiting for next candle confirmation. RISK WARNING: Harami patterns have lower reliability than other reversals.'
      : 'BEARISH HARAMI - Wait for confirmation. Enter SHORT on break below harami low. Stop above high. Target 2:1 R:R. Best at resistance levels. RISK WARNING: Always use stops and proper sizing.';
  }
  else if (patternName.includes('marubozu')) { 
    historicalWinRate = 53; successBonus = 3;
    tradeInstruction = pattern.type === 'bullish'
      ? 'BULLISH MARUBOZU - Strong momentum candle. Best entry on pullback to 50% of body. Enter LONG, stop below low. Target next resistance. RISK WARNING: Even strong momentum can reverse. Use trailing stops.'
      : 'BEARISH MARUBOZU - Strong selling pressure. Enter SHORT on pullback to 50% level. Stop above high. Target next support. RISK WARNING: Momentum reversals are common.';
  }
  else if (patternName.includes('three white') || patternName.includes('three black')) { 
    historicalWinRate = 54; successBonus = 4;
    tradeInstruction = patternName.includes('white')
      ? 'THREE WHITE SOLDIERS - Bullish continuation. Enter LONG on pullback or break of third candle high. Stop below first candle low. Use trailing stops. RISK WARNING: Extended moves often reverse sharply.'
      : 'THREE BLACK CROWS - Bearish continuation. Enter SHORT on pullback or break of third candle low. Stop above first candle high. Use trailing stops. RISK WARNING: Oversold bounces are common.';
  }
  else if (patternName.includes('piercing') || patternName.includes('dark cloud')) { 
    historicalWinRate = 51; successBonus = 1;
    tradeInstruction = patternName.includes('piercing')
      ? 'PIERCING LINE - Bullish reversal. Enter LONG above pattern high. Stop below pattern low. Target prior swing high with 2:1 R:R. RISK WARNING: Volume confirmation critical for reliability.'
      : 'DARK CLOUD COVER - Bearish reversal. Enter SHORT below pattern low. Stop above high. Target prior swing low. RISK WARNING: Confirmation reduces but does not eliminate risk.';
  }
  else if (patternName.includes('inside')) {
    historicalWinRate = 50; successBonus = 0;
    tradeInstruction = 'INSIDE BAR - Consolidation pattern. Trade the breakout: LONG on break above mother candle high, SHORT on break below low. Stop on opposite side. Target 1.5-2:1 R:R. RISK WARNING: False breakouts are common. Wait for confirmation.';
  }
  else {
    tradeInstruction = pattern.type === 'bullish'
      ? 'BULLISH PATTERN detected. Wait for confirmation. Enter LONG on break above pattern high. Stop below low. Target 2:1 R:R. RISK WARNING: All patterns can fail. Use proper risk management.'
      : pattern.type === 'bearish'
      ? 'BEARISH PATTERN detected. Wait for confirmation. Enter SHORT on break below pattern low. Stop above high. Target 2:1 R:R. RISK WARNING: Always use stops and proper sizing.'
      : 'NEUTRAL PATTERN - Market undecided. Wait for directional confirmation before trading. RISK WARNING: Choppy markets eat option premium.';
  }
  
  // More conservative success rate calculation
  const successRate = Math.min(65, Math.max(40, historicalWinRate + (baseRate - 60) * 0.2));
  
  // Calculate grade - more realistic thresholds
  let grade: 'S' | 'A' | 'B' | 'C' | 'D' = 'C';
  let gradeColor = 'text-slate-400';
  let gradeBg = 'bg-slate-500/20 border-slate-500/30';
  
  // Grades based on REALISTIC success rates (not inflated)
  if (successRate >= 60 && pattern.confidence >= 0.75) {
    grade = 'S'; gradeColor = 'text-amber-300'; gradeBg = 'bg-gradient-to-r from-amber-500/30 to-yellow-500/20 border-amber-400/50';
  } else if (successRate >= 55 && pattern.confidence >= 0.65) {
    grade = 'A'; gradeColor = 'text-emerald-300'; gradeBg = 'bg-emerald-500/20 border-emerald-400/40';
  } else if (successRate >= 52 && pattern.confidence >= 0.55) {
    grade = 'B'; gradeColor = 'text-cyan-300'; gradeBg = 'bg-cyan-500/20 border-cyan-400/40';
  } else if (successRate >= 48) {
    grade = 'C'; gradeColor = 'text-slate-300'; gradeBg = 'bg-slate-500/20 border-slate-400/30';
  } else {
    grade = 'D'; gradeColor = 'text-red-300'; gradeBg = 'bg-red-500/20 border-red-400/30';
  }
  
  return { successRate: Math.round(successRate), grade, gradeColor, gradeBg, historicalWinRate, tradeInstruction };
}

export function PatternMatrix({ symbol, timeframe = "15m" }: { symbol: string; timeframe?: string }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const { data } = useQuery<PatternResponse>({
    queryKey: ["/api/patterns", symbol, timeframe],
    enabled: !!symbol,
  });

  const patterns = data?.patterns;

  if (!patterns || patterns.length === 0) return null;

  // Get selected pattern for hero display
  const heroPattern = patterns[selectedIndex] || patterns[0];
  const heroStats = getPatternStats(heroPattern);
  // Keep track of original indices for click-to-swap
  const otherPatterns = patterns
    .map((p, i) => ({ pattern: p, originalIndex: i }))
    .filter(({ originalIndex }) => originalIndex !== selectedIndex)
    .slice(0, 4);

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-b from-slate-900/95 to-black/95">
      {/* Animated background effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.15),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(168,85,247,0.1),transparent_50%)]" />
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-conic from-cyan-500/10 via-transparent to-purple-500/10 animate-spin" style={{ animationDuration: '20s' }} />
      </div>
      
      {/* Top glow bar */}
      <div className="h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-fuchsia-500 shadow-[0_0_30px_rgba(34,211,238,0.8),0_0_60px_rgba(168,85,247,0.4)]" />
      
      {/* Header */}
      <div className="relative px-4 py-3 border-b border-cyan-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-xl bg-cyan-500/30 blur-xl animate-pulse" />
              <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/30 to-purple-500/20 border border-cyan-400/50 shadow-[0_0_20px_rgba(34,211,238,0.3)]">
                <BarChart2 className="w-5 h-5 text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,1)]" />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-purple-300">
                PATTERN ENGINE
              </h3>
              <p className="text-[10px] text-cyan-400/70 font-mono tracking-wider">
                {patterns.length} PATTERNS DETECTED
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500/30 to-fuchsia-500/20 border border-purple-400/40 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
              <div className="flex items-center gap-1.5">
                <Timer className="w-3.5 h-3.5 text-purple-300" />
                <span className="text-xs font-mono font-black text-purple-200 tracking-wider">{timeframe.toUpperCase()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CardContent className="relative p-4 space-y-4">
        {/* Hero Pattern Card */}
        <div className={cn(
          "relative rounded-2xl border-2 p-5 overflow-hidden",
          heroPattern.type === 'bullish' && "border-emerald-400/50 shadow-[0_0_40px_rgba(52,211,153,0.3),inset_0_0_60px_rgba(52,211,153,0.1)]",
          heroPattern.type === 'bearish' && "border-red-400/50 shadow-[0_0_40px_rgba(248,113,113,0.3),inset_0_0_60px_rgba(248,113,113,0.1)]",
          heroPattern.type === 'neutral' && "border-cyan-400/50 shadow-[0_0_40px_rgba(34,211,238,0.3),inset_0_0_60px_rgba(34,211,238,0.1)]"
        )}>
          {/* Background gradient */}
          <div className={cn(
            "absolute inset-0",
            heroPattern.type === 'bullish' && "bg-gradient-to-br from-emerald-500/20 via-emerald-500/5 to-transparent",
            heroPattern.type === 'bearish' && "bg-gradient-to-br from-red-500/20 via-red-500/5 to-transparent",
            heroPattern.type === 'neutral' && "bg-gradient-to-br from-cyan-500/20 via-cyan-500/5 to-transparent"
          )} />
          
          {/* Tech grid */}
          <div className="absolute inset-0 opacity-[0.05] bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:20px_20px]" />
          
          <div className="relative space-y-4">
            {/* Header Row */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Candlestick Visual */}
                <div className={cn(
                  "flex-shrink-0 p-3 rounded-xl border-2",
                  "bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-sm",
                  heroPattern.type === 'bullish' && "border-emerald-400/40 shadow-[0_0_20px_rgba(52,211,153,0.2)]",
                  heroPattern.type === 'bearish' && "border-red-400/40 shadow-[0_0_20px_rgba(248,113,113,0.2)]",
                  heroPattern.type === 'neutral' && "border-cyan-400/40 shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                )}>
                  <div className="transform scale-110">
                    <CandlestickPattern pattern={heroPattern.name} type={heroPattern.type} />
                  </div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <div className={cn(
                      "p-1.5 rounded-lg",
                      heroPattern.type === 'bullish' && "bg-emerald-500/30",
                      heroPattern.type === 'bearish' && "bg-red-500/30",
                      heroPattern.type === 'neutral' && "bg-cyan-500/30"
                    )}>
                      {heroPattern.type === 'bullish' && <TrendingUp className="w-4 h-4 text-emerald-300" />}
                      {heroPattern.type === 'bearish' && <TrendingDown className="w-4 h-4 text-red-300" />}
                      {heroPattern.type === 'neutral' && <Minus className="w-4 h-4 text-cyan-300" />}
                    </div>
                    <h4 className={cn(
                      "text-sm font-black tracking-wide",
                      heroPattern.type === 'bullish' && "text-emerald-200",
                      heroPattern.type === 'bearish' && "text-red-200",
                      heroPattern.type === 'neutral' && "text-cyan-200"
                    )}>
                      {heroPattern.name}
                    </h4>
                    <div className={cn(
                      "px-2 py-0.5 rounded-md border text-[10px] font-black",
                      heroStats.gradeBg, heroStats.gradeColor
                    )}>
                      {heroStats.grade === 'S' && '★ '}GRADE {heroStats.grade}
                    </div>
                  </div>
                  <p className="text-[10px] text-white/50 capitalize">{heroPattern.category} Pattern</p>
                </div>
              </div>
              
              {/* Success Rate Circle - Top Right */}
              <div className="flex-shrink-0">
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 -rotate-90" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/10" />
                    <circle
                      cx="20" cy="20" r="16" fill="none"
                      stroke={heroStats.successRate >= 80 ? "#10b981" : heroStats.successRate >= 65 ? "#22d3ee" : "#f59e0b"}
                      strokeWidth="2.5" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 16}
                      strokeDashoffset={2 * Math.PI * 16 * (1 - heroStats.successRate / 100)}
                      style={{ filter: `drop-shadow(0 0 8px ${heroStats.successRate >= 80 ? "rgba(16,185,129,0.8)" : heroStats.successRate >= 65 ? "rgba(34,211,238,0.8)" : "rgba(245,158,11,0.8)"})` }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={cn(
                      "text-sm font-black font-mono",
                      heroStats.successRate >= 80 ? "text-emerald-300" : heroStats.successRate >= 65 ? "text-cyan-300" : "text-amber-300"
                    )}>
                      {heroStats.successRate}%
                    </span>
                    <span className="text-[6px] text-white/40 uppercase">WIN</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-black/40 border border-emerald-500/20 p-2 text-center">
                <div className="text-base font-black text-emerald-400 font-mono">{heroStats.successRate}%</div>
                <div className="text-[7px] text-white/40 uppercase tracking-wider">WIN RATE</div>
              </div>
              <div className="rounded-lg bg-black/40 border border-purple-500/20 p-2 text-center">
                <div className="text-base font-black text-purple-400 font-mono">{timeframe}</div>
                <div className="text-[7px] text-white/40 uppercase tracking-wider">TIMEFRAME</div>
              </div>
              <div className="rounded-lg bg-black/40 border border-cyan-500/20 p-2 text-center">
                <div className="text-base font-black text-cyan-400 font-mono">{heroStats.historicalWinRate}%</div>
                <div className="text-[7px] text-white/40 uppercase tracking-wider">HISTORICAL</div>
              </div>
            </div>
            
            {/* Trade Instruction */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-500/10 via-purple-500/5 to-cyan-500/10 border border-cyan-500/30">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex-shrink-0">
                  <Crosshair className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-cyan-400 font-black uppercase tracking-wider mb-2">HOW TO TRADE THIS SETUP</div>
                  <p className="text-sm text-white/90 leading-relaxed">{heroStats.tradeInstruction}</p>
                </div>
              </div>
            </div>
            
            {/* Price Targets Row */}
            <div className="flex items-center gap-2 flex-wrap">
              {heroPattern.priceTarget && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40">
                  <Target className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[10px] text-white/50">TARGET</span>
                  <span className="text-sm font-mono font-bold text-emerald-300">${heroPattern.priceTarget.toFixed(2)}</span>
                </div>
              )}
              {heroPattern.stopLoss && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/40">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-[10px] text-white/50">STOP</span>
                  <span className="text-sm font-mono font-bold text-red-300">${heroPattern.stopLoss.toFixed(2)}</span>
                </div>
              )}
              <div className={cn(
                "ml-auto px-3 py-1.5 rounded-lg border text-xs font-black tracking-wider",
                heroStats.gradeBg, heroStats.gradeColor
              )}>
                {heroStats.grade === 'S' ? 'ELITE SETUP' : heroStats.grade === 'A' ? 'HIGH QUALITY' : heroStats.grade === 'B' ? 'SOLID SETUP' : 'STANDARD'}
              </div>
            </div>
          </div>
        </div>
        
        {/* Other Patterns Grid - Click to swap with hero */}
        {otherPatterns.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {otherPatterns.map(({ pattern, originalIndex }, i) => {
              const stats = getPatternStats(pattern);
              return (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <div 
                      onClick={() => setSelectedIndex(originalIndex)}
                      className={cn(
                        "relative rounded-xl border p-3 cursor-pointer transition-all duration-300",
                        "hover:scale-[1.02] hover:shadow-lg backdrop-blur-sm",
                        "active:scale-[0.98]",
                        pattern.type === 'bullish' && "border-emerald-500/30 hover:border-emerald-400/50 bg-emerald-500/5",
                        pattern.type === 'bearish' && "border-red-500/30 hover:border-red-400/50 bg-red-500/5",
                        pattern.type === 'neutral' && "border-cyan-500/20 hover:border-cyan-400/40 bg-cyan-500/5"
                      )}
                    >
                      {/* Click hint */}
                      <div className="absolute top-1 right-1 text-[8px] text-white/30 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                        Click to view
                      </div>
                      
                      {/* Top bar with grade */}
                      <div className={cn(
                        "absolute top-0 left-0 right-0 h-0.5",
                        pattern.type === 'bullish' && "bg-gradient-to-r from-emerald-500/30 via-emerald-400 to-emerald-500/30",
                        pattern.type === 'bearish' && "bg-gradient-to-r from-red-500/30 via-red-400 to-red-500/30",
                        pattern.type === 'neutral' && "bg-gradient-to-r from-cyan-500/30 via-cyan-400 to-cyan-500/30"
                      )} />
                      
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "flex-shrink-0 p-1.5 rounded-lg border bg-black/40",
                          pattern.type === 'bullish' && "border-emerald-500/30",
                          pattern.type === 'bearish' && "border-red-500/30",
                          pattern.type === 'neutral' && "border-cyan-500/30"
                        )}>
                          <CandlestickPattern pattern={pattern.name} type={pattern.type} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {pattern.type === 'bullish' && <TrendingUp className="w-3 h-3 text-emerald-400" />}
                            {pattern.type === 'bearish' && <TrendingDown className="w-3 h-3 text-red-400" />}
                            {pattern.type === 'neutral' && <Minus className="w-3 h-3 text-cyan-400" />}
                            <span className={cn(
                              "text-[10px] font-bold truncate",
                              pattern.type === 'bullish' && "text-emerald-300",
                              pattern.type === 'bearish' && "text-red-300",
                              pattern.type === 'neutral' && "text-cyan-300"
                            )}>
                              {pattern.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={cn(
                              "text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border",
                              stats.gradeBg, stats.gradeColor
                            )}>
                              {stats.grade}
                            </span>
                            <span className="text-[9px] font-mono font-bold text-emerald-400">
                              {stats.successRate}%
                            </span>
                            <span className="text-[9px] text-white/30 font-mono">{timeframe}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-sm bg-black/95 border-cyan-500/30 p-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{pattern.name}</span>
                        <span className={cn("text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border", stats.gradeBg, stats.gradeColor)}>
                          {stats.grade}
                        </span>
                      </div>
                      <p className="text-[10px] text-white/60">{pattern.description}</p>
                      <div className="flex items-center gap-3 pt-2 border-t border-white/10">
                        <div className="text-center">
                          <div className="text-xs font-bold text-emerald-400">{stats.successRate}%</div>
                          <div className="text-[8px] text-white/40">WIN RATE</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs font-bold text-purple-400">{timeframe}</div>
                          <div className="text-[8px] text-white/40">TF</div>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-white/10">
                        <div className="flex items-start gap-1.5">
                          <Crosshair className="w-3 h-3 text-cyan-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <div className="text-[9px] text-cyan-400 font-bold uppercase mb-0.5">CLICK TO VIEW DETAILS</div>
                            <p className="text-[10px] text-white/70 leading-relaxed">{stats.tradeInstruction.slice(0, 100)}...</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
