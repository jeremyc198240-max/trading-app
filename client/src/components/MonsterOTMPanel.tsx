import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Crosshair, Flame, Sparkles, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { UnifiedOptionsPlay } from "@shared/schema";

interface ExpirationDate {
  label: string;
  date: string;
  daysToExpiry: number;
  type: "0DTE" | "weekly" | "monthly";
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
  side: "call" | "put";
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
  quality: "A" | "B" | "C" | "none";
  direction: "bullish" | "bearish" | "none";
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

interface MonsterOTMPanelData {
  chain: SyntheticOptionsChain;
  hasMonsterPlay: boolean;
  topPlay: SyntheticContract | null;
  direction: "bullish" | "bearish" | "neutral";
  setupQuality: "A" | "B" | "C" | "none";
  summary: string;
  probability: number;
  intentScore: number;
  vixLevel?: number;
  vixRegime?: "calm" | "balanced" | "elevated" | "chaotic" | "unknown";
  targetPremium?: number;
  stopPremium?: number;
  isSynthetic: boolean;
  disclaimer: string;
  unifiedOptionsPlay: UnifiedOptionsPlay | null;
  expectedMove: number;
  breakoutAlert?: string;
  breakoutTriggered?: boolean;
  hitProbability?: number;
  supportLevel?: number;
  resistanceLevel?: number;
  liveMonster?: {
    hasPlay: boolean;
    play?: {
      side?: "call" | "put";
      strike?: number;
      hitProbability?: number;
      supportLevel?: number;
      resistanceLevel?: number;
    };
    breakout?: {
      triggered?: boolean;
      type?: "breakout_up" | "breakout_down" | "none";
      alert?: string;
      hitProbability?: number;
      supportLevel?: number;
      resistanceLevel?: number;
    };
  };
}

interface MonsterOTMPanelProps {
  symbol: string;
  currentPriceOverride?: number;
}

function px(n?: number): string {
  return typeof n === "number" && Number.isFinite(n) ? `$${n.toFixed(2)}` : "--";
}

function pct(n?: number): string {
  return typeof n === "number" && Number.isFinite(n) ? `${Math.round(n)}%` : "--";
}

export function MonsterOTMPanel({ symbol, currentPriceOverride }: MonsterOTMPanelProps) {
  const { data, isLoading, error } = useQuery<MonsterOTMPanelData>({
    queryKey: ["/api/monster-panel", symbol],
    enabled: Boolean(symbol),
    refetchInterval: 30000,
    staleTime: 10000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <Card className="monster-compact-panel" data-testid="card-monster-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-[0.15em] text-cyan-200/80">Monster OTM Command</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 animate-pulse">
          <div className="h-8 rounded bg-white/5" />
          <div className="h-20 rounded bg-white/5" />
          <div className="h-14 rounded bg-white/5" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="monster-compact-panel border-rose-500/40" data-testid="card-monster-panel-error">
        <CardContent className="py-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-rose-400" />
          <p className="text-sm text-rose-200/80">Monster OTM unavailable</p>
        </CardContent>
      </Card>
    );
  }

  const displaySpot =
    typeof currentPriceOverride === "number" && Number.isFinite(currentPriceOverride) && currentPriceOverride > 0
      ? currentPriceOverride
      : data.chain.spotPrice;

  const breakoutTriggered = Boolean(data.breakoutTriggered ?? data.liveMonster?.breakout?.triggered);
  const hitProbability = data.hitProbability ?? data.liveMonster?.play?.hitProbability ?? data.liveMonster?.breakout?.hitProbability;
  const support = data.supportLevel ?? data.liveMonster?.play?.supportLevel ?? data.liveMonster?.breakout?.supportLevel;
  const resistance = data.resistanceLevel ?? data.liveMonster?.play?.resistanceLevel ?? data.liveMonster?.breakout?.resistanceLevel;
  const expectedMovePct = displaySpot > 0 ? (data.expectedMove / displaySpot) * 100 : 0;
  const side = data.direction === "bullish" ? "CALL" : data.direction === "bearish" ? "PUT" : "WAIT";
  const unified = data.unifiedOptionsPlay;
  const topRows = [...(data.chain.monsterPlay ? [data.chain.monsterPlay] : []), ...data.chain.topPlays].slice(0, 2);

  return (
    <Card className="monster-compact-panel" data-testid="card-monster-panel">
      <div className="monster-compact-panel__scan" />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-cyan-200/90">
            <Zap className="h-4 w-4 text-fuchsia-300" />
            Monster OTM Command
          </CardTitle>
          <div className={cn("monster-compact-panel__state", breakoutTriggered ? "is-hot" : "is-wait")}>
            {breakoutTriggered ? "EXPANSION" : "STANDBY"}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2.5">
        <section className="monster-grid-top">
          <Metric label="Spot" value={px(displaySpot)} />
          <Metric label="Bias" value={side} tone={side === "CALL" ? "up" : side === "PUT" ? "down" : "neutral"} />
          <Metric label="Hit" value={pct(hitProbability)} />
          <Metric label="Move" value={`${expectedMovePct.toFixed(2)}%`} />
          <Metric label="PCE" value={pct(data.chain.pce.pceProb * 100)} />
          <Metric label="VIX" value={typeof data.vixLevel === "number" ? data.vixLevel.toFixed(2) : "--"} />
        </section>

        <section className="monster-breakout-strip">
          <div className="monster-breakout-strip__head">
            <span><Crosshair className="h-3.5 w-3.5" /> Breakout Lane</span>
            <strong>{breakoutTriggered ? "EXPANSION DETECTED" : "Await trigger"}</strong>
          </div>
          <div className="monster-breakout-strip__grid">
            <div><span>Support</span><strong>{px(support)}</strong></div>
            <div><span>Resistance</span><strong>{px(resistance)}</strong></div>
            <div><span>Alert</span><strong className="truncate">{data.breakoutAlert ?? data.liveMonster?.breakout?.alert ?? "Standby"}</strong></div>
          </div>
        </section>

        {unified && (
          <section className="monster-unified-row" data-testid="unified-options-play">
            <div className="monster-unified-row__title"><Sparkles className="h-3.5 w-3.5" /> Unified Play</div>
            <div className="monster-unified-row__vals">
              <span>{unified.direction === "CALLS" ? "CALL" : "PUT"} {unified.strike.toFixed(0)}</span>
              <span>Δ {Math.round(unified.delta * 100)}</span>
              <span>R:R {unified.rr.toFixed(2)}</span>
              <span>{unified.confidence}%</span>
            </div>
          </section>
        )}

        <section className="monster-contract-grid">
          {topRows.map((row, idx) => {
            const isCall = row.side === "call";
            return (
              <div className="monster-contract" key={`${row.side}-${row.strike}-${idx}`} data-testid={`top-play-${idx + 1}`}>
                <div className="monster-contract__head">
                  <span className={cn("monster-contract__side", isCall ? "up" : "down")}>
                    {isCall ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {isCall ? "CALL" : "PUT"} {row.strike}
                  </span>
                  <strong>S{row.score.total}</strong>
                </div>
                <div className="monster-contract__meta">
                  <span>{row.expiration.label}</span>
                  <span>{px(row.premium)}</span>
                  <span>Δ {Math.round(row.greeks.delta * 100)}</span>
                  <span>{row.expansion.confidence.toFixed(0)}%</span>
                </div>
              </div>
            );
          })}
        </section>

        <div className="monster-footer-row">
          <div className="monster-footer-row__summary">
            {data.hasMonsterPlay ? <Flame className="h-3.5 w-3.5 text-fuchsia-300" /> : <Zap className="h-3.5 w-3.5 text-cyan-300" />}
            <span>{data.summary}</span>
          </div>
          <div className="monster-footer-row__exp">
            {data.chain.expirations.slice(0, 2).map((exp) => (
              <span key={exp.label} className={cn(exp.type === "0DTE" ? "is-0dte" : "")}>{exp.label}</span>
            ))}
          </div>
        </div>

        {data.isSynthetic && (
          <div className="monster-note">
            <AlertTriangle className="h-3.5 w-3.5" />
            {data.disclaimer}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "up" | "down" | "neutral" }) {
  return (
    <div className={cn("monster-metric", `tone-${tone}`)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
