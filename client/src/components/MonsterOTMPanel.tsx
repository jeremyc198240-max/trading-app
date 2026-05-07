import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Zap, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Clock,
  Flame,
  AlertTriangle,
  Activity,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ExpirationDate {
  label: string;
  date: string;
  daysToExpiry: number;
  type: '0DTE' | 'weekly' | 'monthly';
}

interface SyntheticGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
}

interface ContractScore {
  total: number;
  pceAlignment: number;
  monsterGate: number;
  deltaScore: number;
  rrScore: number;
  liquidityScore: number;
  reasons: string[];
}

interface PremiumExpansionModel {
  currentPremium: number;
  targetPremium: number;
  stopPremium: number;
  expansionPercent: number;
  expectedGain: number;
  riskAmount: number;
  rrRatio: number;
  confidence: number;
  notes: string[];
}

interface SyntheticContract {
  strike: number;
  side: 'call' | 'put';
  expiration: ExpirationDate;
  premium: number;
  greeks: SyntheticGreeks;
  score: ContractScore;
  expansion: PremiumExpansionModel;
  isRecommended: boolean;
  rank: number;
}

interface PCESignal {
  pullbackScore: number;
  compressionScore: number;
  expansionScore: number;
  pceRaw: number;
  pceScore: number;
  pceProb: number;
  quality: 'A' | 'B' | 'C' | 'none';
  direction: 'bullish' | 'bearish' | 'none';
  entryLevel: number | null;
  stopLevel: number | null;
  notes: string[];
  monster: boolean;
  monsterReasons: string[];
  ignition: boolean;
}

interface SyntheticOptionsChain {
  symbol: string;
  spotPrice: number;
  atmStrike: number;
  strikeInterval: number;
  expirations: ExpirationDate[];
  calls: SyntheticContract[];
  puts: SyntheticContract[];
  topPlays: SyntheticContract[];
  monsterPlay: SyntheticContract | null;
  pce: PCESignal;
  meta: {
    regime: string;
    bias: string;
    dominant: string;
    dominantProb: number;
    chop: number;
    confidence: number;
  };
}

import type { UnifiedOptionsPlay } from "@shared/schema";

interface MonsterOTMPanelData {
  chain: SyntheticOptionsChain;
  hasMonsterPlay: boolean;
  topPlay: SyntheticContract | null;
  direction: 'bullish' | 'bearish' | 'neutral';
  setupQuality: 'A' | 'B' | 'C' | 'none';
  summary: string;
  isSynthetic: boolean;
  disclaimer: string;
  unifiedOptionsPlay: UnifiedOptionsPlay | null;
  expectedMove: number;
}

interface MonsterOTMPanelProps {
  symbol: string;
  currentPriceOverride?: number;
}

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function getQualityStyles(quality: 'A' | 'B' | 'C' | 'none'): { text: string; bg: string; border: string; glow: string } {
  switch (quality) {
    case 'A': return { 
      text: 'text-emerald-400', 
      bg: 'bg-emerald-500/20', 
      border: 'border-emerald-500/50',
      glow: 'shadow-emerald-500/20'
    };
    case 'B': return { 
      text: 'text-amber-400', 
      bg: 'bg-amber-500/20', 
      border: 'border-amber-500/50',
      glow: 'shadow-amber-500/20'
    };
    case 'C': return { 
      text: 'text-orange-400', 
      bg: 'bg-orange-500/20', 
      border: 'border-orange-500/50',
      glow: 'shadow-orange-500/20'
    };
    default: return { 
      text: 'text-muted-foreground', 
      bg: 'bg-muted/20', 
      border: 'border-muted/50',
      glow: ''
    };
  }
}

export function MonsterOTMPanel({ symbol, currentPriceOverride }: MonsterOTMPanelProps) {
  const { data, isLoading, error } = useQuery<MonsterOTMPanelData>({
    queryKey: ['/api/monster-panel', symbol],
    enabled: !!symbol,
    refetchInterval: 30000,
    staleTime: 10000,
    refetchOnWindowFocus: false
  });
  
  if (isLoading) {
    return (
      <Card className="relative overflow-hidden rounded-xl border border-cyan-500/30 bg-gradient-to-b from-[#040816]/95 via-[#060d1e]/90 to-[#070f24]/85 shadow-[0_0_30px_rgba(34,211,238,0.16)]" data-testid="card-monster-panel">
        <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(34,211,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(129,140,248,0.14)_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="h-1 bg-gradient-to-r from-cyan-500 via-violet-400 to-fuchsia-400" />
        <CardHeader className="relative py-3 px-4 border-b border-cyan-500/25 bg-gradient-to-r from-cyan-500/10 via-transparent to-violet-500/10">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-cyan-200/75 flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-400" />
            Monster OTM Engine
          </CardTitle>
        </CardHeader>
        <CardContent className="relative p-4">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted/50 rounded w-3/4"></div>
            <div className="h-4 bg-muted/50 rounded w-1/2"></div>
            <div className="h-24 bg-muted/30 rounded-lg"></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="h-32 bg-muted/30 rounded-lg"></div>
              <div className="h-32 bg-muted/30 rounded-lg"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="relative overflow-hidden rounded-xl border border-red-500/35 bg-gradient-to-b from-[#14060a]/95 via-[#17070d]/90 to-[#1b0b13]/85" data-testid="card-monster-panel-error">
        <div className="h-1 bg-gradient-to-r from-red-600 via-red-500 to-orange-500" />
        <CardHeader className="py-3 px-4 border-b border-red-500/25">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-red-100/75 flex items-center gap-2">
            <Zap className="w-4 h-4 text-red-400" />
            Monster OTM Engine
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-red-400" />
          <p className="text-sm text-muted-foreground">Failed to load options data</p>
        </CardContent>
      </Card>
    );
  }

  const { chain, hasMonsterPlay, setupQuality, summary } = data;
  const displaySpot =
    typeof currentPriceOverride === "number" && Number.isFinite(currentPriceOverride) && currentPriceOverride > 0
      ? currentPriceOverride
      : chain.spotPrice;
  const qualityStyles = getQualityStyles(setupQuality);
  const directionColor = data.direction === 'bullish' ? 'text-emerald-300' : data.direction === 'bearish' ? 'text-rose-300' : 'text-slate-300';
  const metaConfidencePct = Math.round((chain.meta.confidence || 0) * 100);
  const chopPct = Math.round((chain.meta.chop || 0) * 100);
  const domPct = Math.round((chain.meta.dominantProb || 0) * 100);
  const expectedMovePct = displaySpot > 0 ? (data.expectedMove / displaySpot) * 100 : 0;
  const topRows = [
    ...(chain.monsterPlay ? [chain.monsterPlay] : []),
    ...chain.topPlays
  ].slice(0, 3);

  return (
    <Card className="relative overflow-hidden border border-amber-500/28 bg-gradient-to-b from-[#120e03]/96 via-[#151106]/90 to-[#120f08]/86 shadow-[0_0_30px_rgba(251,191,36,0.14)]" data-testid="card-monster-panel">
      <div className={`h-1 ${
        hasMonsterPlay 
          ? 'bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 animate-pulse' 
          : 'bg-gradient-to-r from-amber-400/60 via-orange-400/60 to-rose-400/60'
      }`} />
      
      <CardHeader className="relative py-3 px-4 border-b border-amber-500/20 bg-gradient-to-r from-amber-500/12 via-transparent to-orange-500/12">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
            <div className="p-1 rounded-md border border-amber-400/35 bg-amber-500/12">
              <Zap className="w-4 h-4 text-amber-300" />
            </div>
            <span className="text-amber-100">Monster OTM</span>
            <span className="text-[10px] font-normal text-cyan-100/55">Engine</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {data.isSynthetic ? 'MODELED' : 'LIVE'}
            </span>
            {hasMonsterPlay && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/40">
                <Flame className="w-3 h-3 text-purple-400 animate-pulse" />
                <span className="text-[10px] font-bold text-purple-400">MONSTER</span>
              </div>
            )}
            <div className={`px-2 py-0.5 rounded ${qualityStyles.bg} border ${qualityStyles.border}`}>
              <span className={`text-xs font-bold ${qualityStyles.text}`}>{setupQuality}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="relative p-3 space-y-3">
        {data.unifiedOptionsPlay && (
          <div className="rounded-lg border border-amber-500/24 bg-amber-500/8 p-2.5" data-testid="unified-options-play">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-amber-300">
                <Sparkles className="w-3.5 h-3.5" /> Unified Play
              </div>
              <div className="text-xs font-mono text-amber-100">{data.unifiedOptionsPlay.confidence}%</div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-[11px]">
              <div className="rounded border border-amber-500/20 bg-black/20 p-1.5">
                <div className="text-[10px] text-amber-200/60">Side</div>
                <div className={cn("font-semibold", data.unifiedOptionsPlay.direction === 'CALLS' ? 'text-emerald-300' : 'text-rose-300')}>
                  {data.unifiedOptionsPlay.direction === 'CALLS' ? 'CALL' : 'PUT'}
                </div>
              </div>
              <div className="rounded border border-amber-500/20 bg-black/20 p-1.5">
                <div className="text-[10px] text-amber-200/60">Strike</div>
                <div className="font-mono text-amber-100">${data.unifiedOptionsPlay.strike.toFixed(0)}</div>
              </div>
              <div className="rounded border border-amber-500/20 bg-black/20 p-1.5">
                <div className="text-[10px] text-amber-200/60">Delta</div>
                <div className="font-mono text-cyan-300">{Math.round(data.unifiedOptionsPlay.delta * 100)}</div>
              </div>
              <div className="rounded border border-amber-500/20 bg-black/20 p-1.5">
                <div className="text-[10px] text-amber-200/60">Premium</div>
                <div className="font-mono text-amber-100">${data.unifiedOptionsPlay.premium.toFixed(2)}</div>
              </div>
              <div className="rounded border border-amber-500/20 bg-black/20 p-1.5">
                <div className="text-[10px] text-amber-200/60">R:R</div>
                <div className="font-mono text-emerald-300">{data.unifiedOptionsPlay.rr.toFixed(2)}:1</div>
              </div>
              <div className="rounded border border-amber-500/20 bg-black/20 p-1.5">
                <div className="text-[10px] text-amber-200/60">Target</div>
                <div className="font-mono text-emerald-300">${data.unifiedOptionsPlay.target.toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}

        <div className={`relative p-2.5 rounded-lg overflow-hidden ${
          hasMonsterPlay 
            ? 'bg-violet-500/10 border border-violet-500/25' 
            : 'bg-cyan-500/6 border border-cyan-500/20'
        }`} data-testid="monster-summary">
          <div className="flex items-center gap-2">
            {hasMonsterPlay ? (
              <Flame className="w-4 h-4 text-purple-300 flex-shrink-0" />
            ) : (
              <Activity className="w-4 h-4 text-slate-400 flex-shrink-0" />
            )}
            <div>
              <div className={`text-sm font-semibold ${hasMonsterPlay ? 'text-purple-200' : 'text-cyan-100'}`}>
                {summary}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Direction: <span className={directionColor}>{data.direction.toUpperCase()}</span>
                <span className="ml-2">Expected Move: <span className="text-cyan-300">{expectedMovePct.toFixed(2)}%</span></span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div className="rounded-lg border border-amber-500/22 bg-black/20 p-2">
            <div className="text-amber-200/65 text-[10px] uppercase">Spot</div>
            <div className="font-mono text-amber-100">{formatPrice(displaySpot)}</div>
          </div>
          <div className="rounded-lg border border-cyan-500/22 bg-black/20 p-2">
            <div className="text-cyan-200/65 text-[10px] uppercase">ATM</div>
            <div className="font-mono text-cyan-100">${chain.atmStrike}</div>
          </div>
          <div className="rounded-lg border border-violet-500/22 bg-black/20 p-2">
            <div className="text-violet-200/65 text-[10px] uppercase">Delta Lane</div>
            <div className="font-mono text-violet-100">10-32</div>
          </div>
          <div className="rounded-lg border border-emerald-500/22 bg-black/20 p-2">
            <div className="text-emerald-200/65 text-[10px] uppercase">Move</div>
            <div className="font-mono text-emerald-100">{expectedMovePct.toFixed(2)}%</div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
          <div className="rounded-lg border border-cyan-500/22 bg-cyan-500/6 p-2">
            <div className="text-[10px] text-cyan-200/70 uppercase">PCE</div>
            <div className={`font-mono ${qualityStyles.text}`}>{chain.pce.quality}</div>
          </div>
          <div className="rounded-lg border border-violet-500/22 bg-violet-500/6 p-2">
            <div className="text-[10px] text-violet-200/70 uppercase">PCE Prob</div>
            <div className="font-mono text-violet-100">{Math.round(chain.pce.pceProb * 100)}%</div>
          </div>
          <div className="rounded-lg border border-emerald-500/22 bg-emerald-500/6 p-2">
            <div className="text-[10px] text-emerald-200/70 uppercase">Meta Conf</div>
            <div className="font-mono text-emerald-100">{metaConfidencePct}%</div>
          </div>
          <div className="rounded-lg border border-fuchsia-500/22 bg-fuchsia-500/6 p-2">
            <div className="text-[10px] text-fuchsia-200/70 uppercase">Dominant</div>
            <div className="font-mono text-fuchsia-100">{domPct}%</div>
          </div>
          <div className="rounded-lg border border-rose-500/22 bg-rose-500/6 p-2">
            <div className="text-[10px] text-rose-200/70 uppercase">Chop</div>
            <div className="font-mono text-rose-100">{chopPct}%</div>
          </div>
        </div>

        {topRows.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-amber-200/80">
              <Target className="w-3.5 h-3.5 text-amber-300" /> Top Contracts
            </div>
            <div className="space-y-1.5">
              {topRows.map((play, i) => {
                const isCall = play.side === 'call';
                return (
                  <div
                    key={`${play.side}-${play.strike}-${play.expiration.label}-${i}`}
                    className="rounded-md border border-amber-500/18 bg-black/20 px-2.5 py-1.5"
                    data-testid={`top-play-${i + 1}`}
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        {isCall ? <TrendingUp className="w-3.5 h-3.5 text-emerald-300" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-300" />}
                        <span className={cn("font-semibold", isCall ? 'text-emerald-300' : 'text-rose-300')}>
                          {isCall ? 'CALL' : 'PUT'} {play.strike}
                        </span>
                        <span className="text-muted-foreground">{play.expiration.label}</span>
                      </div>
                      <div className="font-mono text-amber-100">S {play.score.total}</div>
                    </div>
                    <div className="mt-1 grid grid-cols-4 gap-1 text-[10px] text-muted-foreground">
                      <span>Delta {Math.round(play.greeks.delta * 100)}</span>
                      <span>Prem {formatPrice(play.premium)}</span>
                      <span>R:R {play.expansion.rrRatio.toFixed(2)}</span>
                      <span>Conf {Math.round(play.expansion.confidence)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap text-xs pt-1 border-t border-amber-500/15">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">Expirations:</span>
          {chain.expirations.map((exp, i) => (
            <span 
              key={i} 
              className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                exp.type === '0DTE' 
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                  : 'bg-muted/50 text-muted-foreground'
              }`}
            >
              {exp.label} ({exp.daysToExpiry}d)
            </span>
          ))}
        </div>

        {data.isSynthetic && (
          <div className="pt-1">
            <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/8 border border-amber-500/22">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
              <span className="text-[10px] text-muted-foreground leading-relaxed">{data.disclaimer}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
