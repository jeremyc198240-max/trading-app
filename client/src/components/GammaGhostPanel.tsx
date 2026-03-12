import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Ghost, 
  TrendingUp, 
  TrendingDown,
  Target,
  Zap,
  ArrowUp,
  ArrowDown,
  Activity,
  Shield,
  Crosshair,
  Flame,
  Snowflake,
  AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LiquidityLevel {
  strike: number;
  gammaScore: number;
  gammaExposure?: number;
  oi: number;
  volume: number;
  distance: number;
  distancePct?: number;
  sideBias: "call" | "put" | "mixed";
  withinExpectedMove?: boolean;
}

interface GammaFlipZone {
  strike: number;
  flipType: 'positive_to_negative' | 'negative_to_positive';
  significance: number;
}

interface NetGexAnalysis {
  totalNetGex: number;
  callGex: number;
  putGex: number;
  dealerPositioning: 'long_gamma' | 'short_gamma' | 'neutral';
  flipZone: GammaFlipZone | null;
  gexTilt: number;
}

interface LiquidityMap {
  nearestAbove: LiquidityLevel | null;
  nearestBelow: LiquidityLevel | null;
  wallsAbove: LiquidityLevel[];
  wallsBelow: LiquidityLevel[];
  magnets: LiquidityLevel[];
  voidZones: { from: number; to: number; gapPct?: number; type?: 'minor' | 'major' }[];
  liquidityBias: "bullish" | "bearish" | "neutral";
  confidence: number;
  expectedMoveRange?: { low: number; high: number };
  pinning?: { isPinned: boolean; pinStrike: number | null; pinStrength: number };
  netGex?: NetGexAnalysis;
  volatilityRegime?: 'low' | 'normal' | 'high' | 'extreme';
  actionableInsight?: string;
  dataQuality?: { validContracts: number; totalContracts: number; qualityScore: number };
}

interface UnderlyingSnapshot {
  symbol: string;
  spot: number;
  timestamp: string;
}

interface GammaGhostOutput {
  liquidityMap: LiquidityMap;
  underlying: UnderlyingSnapshot;
  timestamp: string;
  computeTimeMs: number;
}

interface GammaGhostPanelProps {
  data: GammaGhostOutput | null;
  symbol: string;
  isLoading?: boolean;
  error?: unknown;
  currentPriceOverride?: number;
}

function formatGex(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return (value / 1e12).toFixed(1) + 'T';
  if (abs >= 1e9) return (value / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return (value / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return (value / 1e3).toFixed(1) + 'K';
  return value.toFixed(0);
}

function MeterCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'red' | 'cyan' | 'amber';
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const startX = 18;
  const endX = 82;
  const cx = 50;
  const cy = 42;
  const r = 32;
  const arc = Math.PI * r;
  const norm = pct / 100;
  const dotX = startX + (endX - startX) * norm;
  const dotY = cy - Math.sqrt(Math.max(0, r * r - Math.pow(dotX - cx, 2)));

  const stroke =
    tone === 'emerald' ? '#4ade80' :
    tone === 'red' ? '#f87171' :
    tone === 'amber' ? '#fbbf24' : '#22d3ee';

  return (
    <div className="rounded-lg border border-cyan-400/35 bg-[#061022]/88 p-1.5 shadow-[inset_0_0_18px_rgba(34,211,238,0.12),0_0_14px_rgba(56,189,248,0.12)]">
      <svg width="100" height="50" viewBox="0 0 100 50" className="mx-auto">
        <path d="M 18 42 A 32 32 0 0 1 82 42" stroke="currentColor" strokeWidth="4" className="text-muted/35" fill="none" strokeLinecap="round" />
        <path
          d="M 18 42 A 32 32 0 0 1 82 42"
          stroke={stroke}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={arc}
          strokeDashoffset={arc * (1 - norm)}
          style={{ filter: `drop-shadow(0 0 8px ${stroke})` }}
        />
        <circle cx={dotX} cy={dotY} r="2.2" fill={stroke} style={{ filter: `drop-shadow(0 0 8px ${stroke})` }} />
        <text x="50" y="22" textAnchor="middle" fill={stroke} className="text-[13px] font-mono font-black">
          {Math.round(pct)}
        </text>
      </svg>
      <div className="-mt-0.5 text-center text-[8px] uppercase tracking-wider text-cyan-100/80">{label}</div>
    </div>
  );
}

export function GammaGhostPanel({ data, symbol, isLoading = false, error, currentPriceOverride }: GammaGhostPanelProps) {
  if (error) {
    const errorText = error instanceof Error ? error.message : "Gamma Ghost unavailable";
    return (
      <Card data-testid="panel-gamma-ghost-error" className="border border-red-500/35 bg-gradient-to-b from-[#14060a]/95 via-[#17070d]/90 to-[#1b0b13]/85 shadow-xl overflow-hidden">
        <CardHeader className="py-2.5 px-4 bg-gradient-to-r from-red-600/20 via-orange-600/15 to-transparent border-b border-red-500/20">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Gamma Ghost
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 text-sm text-red-100/85">
          <div>Disabled for strict live-only mode.</div>
          <div className="mt-1 text-xs text-red-200/70">{errorText}</div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card data-testid="panel-gamma-ghost" className="border-0 bg-gradient-to-b from-card to-card/80 shadow-xl overflow-hidden">
        <CardHeader className="py-2.5 px-4 bg-gradient-to-r from-purple-600/20 via-cyan-600/15 to-transparent border-b border-purple-500/20">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-purple-300 flex items-center gap-2">
            <Ghost className="w-4 h-4" />
            <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Gamma Ghost v5
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-4 h-4 border-2 border-purple-500/50 border-t-purple-500 rounded-full animate-spin" />
            <span className="text-sm">Loading liquidity analysis...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.liquidityMap) {
    return (
      <Card data-testid="panel-gamma-ghost-empty" className="border border-border/60 bg-card/70 shadow-xl overflow-hidden">
        <CardHeader className="py-2.5 px-4 border-b border-border/60">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Ghost className="w-4 h-4" />
            Gamma Ghost
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 text-sm text-muted-foreground">
          No live gamma data available for {symbol.toUpperCase()}.
        </CardContent>
      </Card>
    );
  }

  const { liquidityMap, underlying } = data;
  const displaySpot =
    typeof currentPriceOverride === "number" && Number.isFinite(currentPriceOverride) && currentPriceOverride > 0
      ? currentPriceOverride
      : underlying.spot;
  const { 
    nearestAbove, nearestBelow, wallsAbove, wallsBelow, 
    magnets, voidZones, liquidityBias, confidence,
    pinning, netGex, volatilityRegime, actionableInsight
  } = liquidityMap;
  
  const isBullish = liquidityBias === "bullish";
  const isBearish = liquidityBias === "bearish";
  const confPct = Math.round(confidence * 100);
  const gexTiltPct = Math.round((netGex?.gexTilt || 0) * 100);
  const gexAbsPct = Math.min(100, Math.abs(gexTiltPct) * 4);
  const pinStrengthPct = Math.round((pinning?.pinStrength || 0) * 100);
  const qualityPct = liquidityMap.dataQuality?.qualityScore ?? 0;

  return (
    <Card 
      data-testid="panel-gamma-ghost" 
      className={cn(
        "relative overflow-hidden border rounded-xl bg-gradient-to-b from-[#040816]/95 via-[#060d1e]/92 to-[#071028]/88 backdrop-blur-sm",
        "shadow-[0_0_38px_rgba(34,211,238,0.16)] border-cyan-500/35",
        isBullish && "ring-1 ring-emerald-500/35",
        isBearish && "ring-1 ring-red-500/35"
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(34,211,238,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(129,140,248,0.14)_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(34,211,238,0.18),transparent_48%),radial-gradient(circle_at_88%_100%,rgba(168,85,247,0.14),transparent_44%)]" />
      <div className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t border-cyan-300/45" />
      <div className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b border-violet-300/35" />

      <CardHeader className="relative py-2.5 px-4 bg-gradient-to-r from-cyan-500/14 via-indigo-500/10 to-violet-500/12 border-b border-cyan-500/25">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            <div className={cn(
              "p-1.5 rounded-lg border",
              isBullish ? "bg-emerald-500/20" : isBearish ? "bg-red-500/20" : "bg-purple-500/20"
            )}>
              <Ghost className={cn(
                "w-4 h-4",
                isBullish ? "text-emerald-400" : isBearish ? "text-red-400" : "text-purple-400"
              )} />
            </div>
            <span className="bg-gradient-to-r from-cyan-300 via-violet-300 to-cyan-200 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(56,189,248,0.45)]">
              Gamma Ghost
            </span>
            <span className="text-muted-foreground/60 text-[10px] font-normal">v5</span>
            <Badge variant="outline" className="text-[8px] border-cyan-400/40 bg-cyan-500/10 text-cyan-200">ENGINE ON</Badge>
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge 
              data-testid="badge-vol-regime" 
              variant="outline" 
              className={cn(
                "text-[9px] px-1.5 py-0.5 gap-1 border-0 font-medium",
                volatilityRegime === 'low' && "bg-blue-500/15 text-blue-400",
                volatilityRegime === 'normal' && "bg-slate-500/15 text-slate-400",
                volatilityRegime === 'high' && "bg-orange-500/15 text-orange-400",
                volatilityRegime === 'extreme' && "bg-red-500/15 text-red-400"
              )}
            >
              {volatilityRegime === 'low' && <Snowflake className="w-2.5 h-2.5" />}
              {volatilityRegime === 'normal' && <Activity className="w-2.5 h-2.5" />}
              {(volatilityRegime === 'high' || volatilityRegime === 'extreme') && <Flame className="w-2.5 h-2.5" />}
              {(volatilityRegime || 'normal').toUpperCase()}
            </Badge>
            <Badge 
              data-testid="badge-gamma-bias" 
              className={cn(
                "text-[9px] px-2 py-0.5 font-bold border-0",
                isBullish && "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/25",
                isBearish && "bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg shadow-red-500/25",
                !isBullish && !isBearish && "bg-slate-600/50 text-slate-300"
              )}
            >
              {liquidityBias.toUpperCase()}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative p-0">
        <div className="p-3 bg-gradient-to-b from-cyan-900/18 via-slate-900/25 to-transparent border-b border-cyan-500/20">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Spot Price</div>
              <div data-testid="text-gamma-spot-price" className={cn(
                "font-mono text-2xl font-black tracking-tight",
                isBullish && "text-emerald-400",
                isBearish && "text-red-400",
                !isBullish && !isBearish && "text-foreground"
              )}>
                ${displaySpot.toFixed(2)}
              </div>
              <div className="text-[9px] text-cyan-200/65 mt-0.5">{symbol.toUpperCase()} live liquidity map</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Expected Move</div>
              {liquidityMap.expectedMoveRange && (
                <div className="font-mono text-sm font-bold">
                  <span className="text-red-400">${liquidityMap.expectedMoveRange.low.toFixed(0)}</span>
                  <span className="text-muted-foreground/50 mx-1.5">—</span>
                  <span className="text-emerald-400">${liquidityMap.expectedMoveRange.high.toFixed(0)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-1.5 mb-2.5">
              <MeterCard label="Confidence" value={confPct} tone={confPct >= 55 ? 'emerald' : confPct >= 35 ? 'amber' : 'red'} />
              <MeterCard label="GEX Tilt" value={gexAbsPct} tone={gexTiltPct >= 0 ? 'emerald' : 'red'} />
              <MeterCard label="Pin Strength" value={pinStrengthPct} tone={pinning?.isPinned ? 'amber' : 'cyan'} />
              <MeterCard label="Data Quality" value={qualityPct} tone={qualityPct >= 80 ? 'emerald' : qualityPct >= 60 ? 'amber' : 'red'} />
            </div>
            <div className="flex items-center justify-between text-[10px] mb-1.5">
              <span className="text-muted-foreground uppercase tracking-wider">Confidence</span>
              <span data-testid="text-gamma-confidence" className={cn(
                "font-mono font-bold",
                confPct >= 70 ? "text-emerald-400" : confPct >= 50 ? "text-yellow-400" : "text-red-400"
              )}>{confPct}%</span>
            </div>
            <div className="h-2 bg-black/30 rounded-full overflow-hidden">
              <div 
                data-testid="progress-confidence"
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  isBullish && "bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-lg shadow-emerald-500/30",
                  isBearish && "bg-gradient-to-r from-red-600 to-red-400 shadow-lg shadow-red-500/30",
                  !isBullish && !isBearish && "bg-gradient-to-r from-purple-600 to-cyan-500"
                )}
                style={{ width: `${confPct}%` }}
              />
            </div>
              {liquidityMap.dataQuality && (
                <div className="mt-1 text-[9px] text-cyan-200/70 font-mono text-right">
                  {liquidityMap.dataQuality.validContracts}/{liquidityMap.dataQuality.totalContracts} contracts valid
                </div>
              )}
          </div>
        </div>

        {pinning?.isPinned && (
          <div className="px-3 py-2 bg-gradient-to-r from-yellow-500/15 to-transparent border-b border-yellow-500/20 flex items-center gap-2">
            <div className="p-1 rounded bg-yellow-500/20">
              <Crosshair className="w-3.5 h-3.5 text-yellow-400" />
            </div>
            <span className="text-xs font-bold text-yellow-400">
              PINNED @ ${pinning.pinStrike}
            </span>
            <span className="text-[10px] text-yellow-500/70">
              ({Math.round(pinning.pinStrength * 100)}% strength)
            </span>
          </div>
        )}

        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {nearestAbove && (
              <div data-testid="level-nearest-above" className="p-2.5 rounded-lg bg-gradient-to-br from-emerald-950/46 to-emerald-900/18 border border-emerald-400/35 shadow-[0_0_18px_rgba(74,222,128,0.14)] hover:border-emerald-400/55 transition-colors">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="p-0.5 rounded bg-emerald-500/20">
                    <ArrowUp className="w-3 h-3 text-emerald-400" />
                  </div>
                  <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Resistance</span>
                </div>
                <div className="font-mono font-black text-xl text-emerald-300">${nearestAbove.strike}</div>
                <div className="text-[9px] text-emerald-400/60 mt-1 font-medium">
                  {(nearestAbove.oi / 1000).toFixed(1)}K OI • {nearestAbove.sideBias}
                </div>
              </div>
            )}

            {nearestBelow && (
              <div data-testid="level-nearest-below" className="p-2.5 rounded-lg bg-gradient-to-br from-red-950/46 to-red-900/18 border border-red-400/35 shadow-[0_0_18px_rgba(248,113,113,0.14)] hover:border-red-400/55 transition-colors">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="p-0.5 rounded bg-red-500/20">
                    <ArrowDown className="w-3 h-3 text-red-400" />
                  </div>
                  <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">Support</span>
                </div>
                <div className="font-mono font-black text-xl text-red-300">${nearestBelow.strike}</div>
                <div className="text-[9px] text-red-400/60 mt-1 font-medium">
                  {(nearestBelow.oi / 1000).toFixed(1)}K OI • {nearestBelow.sideBias}
                </div>
              </div>
            )}
          </div>

          {netGex && (
            <div className="space-y-2.5 p-2.5 rounded-lg bg-[#081124]/82 border border-cyan-500/25 shadow-[inset_0_0_18px_rgba(34,211,238,0.12)]">
              <div className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3 h-3" />
                Net GEX Analysis
              </div>
              
              <div className="grid grid-cols-3 gap-1.5">
                <div className={cn(
                  "p-2 rounded-lg text-center border",
                  netGex.dealerPositioning === 'long_gamma' && "bg-emerald-950/30 border-emerald-500/30",
                  netGex.dealerPositioning === 'short_gamma' && "bg-red-950/30 border-red-500/30",
                  netGex.dealerPositioning === 'neutral' && "bg-slate-900/30 border-slate-500/30"
                )}>
                  <div className="text-[8px] text-muted-foreground uppercase tracking-wider">Dealer</div>
                  <div className={cn(
                    "text-xs font-black mt-0.5",
                    netGex.dealerPositioning === 'long_gamma' && "text-emerald-400",
                    netGex.dealerPositioning === 'short_gamma' && "text-red-400",
                    netGex.dealerPositioning === 'neutral' && "text-slate-400"
                  )}>
                    {netGex.dealerPositioning === 'long_gamma' ? 'LONG γ' : 
                     netGex.dealerPositioning === 'short_gamma' ? 'SHORT γ' : 'NEUTRAL'}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-black/30 text-center border border-border/20">
                  <div className="text-[8px] text-muted-foreground uppercase tracking-wider">GEX Tilt</div>
                  <div className={cn(
                    "text-xs font-mono font-black mt-0.5",
                    gexTiltPct > 2 && "text-emerald-400",
                    gexTiltPct < -2 && "text-red-400",
                    gexTiltPct >= -2 && gexTiltPct <= 2 && "text-slate-400"
                  )}>
                    {gexTiltPct > 0 ? '+' : ''}{gexTiltPct}%
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-black/30 text-center border border-border/20">
                  <div className="text-[8px] text-muted-foreground uppercase tracking-wider">Net GEX</div>
                  <div className={cn(
                    "text-xs font-mono font-black mt-0.5",
                    netGex.totalNetGex > 0 ? "text-emerald-400" : netGex.totalNetGex < 0 ? "text-red-400" : "text-slate-400"
                  )}>{formatGex(netGex.totalNetGex)}</div>
                </div>
              </div>

              <div className="relative h-3 bg-black/40 rounded-full overflow-hidden border border-cyan-500/20">
                <div className="absolute inset-0 flex">
                  <div className="flex-1 bg-gradient-to-r from-red-600/60 to-red-500/30" />
                  <div className="w-px bg-muted-foreground/30" />
                  <div className="flex-1 bg-gradient-to-r from-emerald-500/30 to-emerald-600/60" />
                </div>
                <div 
                  className={cn(
                    "absolute top-0 bottom-0 w-1.5 rounded-full transition-all duration-300",
                    gexTiltPct > 0 ? "bg-emerald-400 shadow-lg shadow-emerald-500/50" : "bg-red-400 shadow-lg shadow-red-500/50"
                  )}
                  style={{ 
                    left: `calc(50% + ${Math.max(-45, Math.min(45, gexTiltPct))}% - 3px)`
                  }}
                />
              </div>
              <div className="flex justify-between text-[8px] text-muted-foreground/60">
                <span>PUT HEAVY</span>
                <span>CALL HEAVY</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 gap-1.5">
            <div className="p-2 rounded-lg bg-gradient-to-b from-emerald-950/35 to-transparent border border-emerald-500/28 text-center">
              <div className="text-[8px] text-emerald-400/60 uppercase tracking-wider">Walls ↑</div>
              <div data-testid="text-walls-above" className="font-mono font-black text-emerald-400 text-lg">{wallsAbove.length}</div>
            </div>
            <div className="p-2 rounded-lg bg-gradient-to-b from-red-950/35 to-transparent border border-red-500/28 text-center">
              <div className="text-[8px] text-red-400/60 uppercase tracking-wider">Walls ↓</div>
              <div data-testid="text-walls-below" className="font-mono font-black text-red-400 text-lg">{wallsBelow.length}</div>
            </div>
            <div className="p-2 rounded-lg bg-gradient-to-b from-yellow-950/35 to-transparent border border-yellow-500/28 text-center">
              <div className="text-[8px] text-yellow-400/60 uppercase tracking-wider">Magnets</div>
              <div data-testid="text-magnets" className="font-mono font-black text-yellow-400 text-lg">{magnets.length}</div>
            </div>
            <div className="p-2 rounded-lg bg-gradient-to-b from-slate-800/35 to-transparent border border-slate-500/28 text-center">
              <div className="text-[8px] text-slate-400/60 uppercase tracking-wider">Voids</div>
              <div data-testid="text-voids" className="font-mono font-black text-slate-400 text-lg">{voidZones.length}</div>
            </div>
          </div>

          {magnets.length > 0 && (
            <div className="space-y-2 p-2.5 rounded-lg bg-gradient-to-b from-yellow-950/24 to-transparent border border-yellow-500/28 shadow-[0_0_14px_rgba(250,204,21,0.12)]">
              <div className="text-[9px] font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-3 h-3" />
                Top Magnets
              </div>
              <div data-testid="list-magnets" className="space-y-1.5">
                {magnets.slice(0, 3).map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-black/20 border border-yellow-500/10 hover:border-yellow-500/30 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-yellow-300">${m.strike}</span>
                      <Badge variant="outline" className="text-[8px] h-4 px-1.5 border-yellow-500/30 text-yellow-400/80">
                        {m.sideBias}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 bg-black/40 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 rounded-full" 
                          style={{ width: `${Math.min(100, m.gammaScore * 100)}%` }}
                        />
                      </div>
                      <span className="text-yellow-400/70 font-mono text-[9px] w-8 text-right font-bold">
                        {(m.gammaScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {netGex?.flipZone && (
            <div className="p-2.5 rounded-lg bg-gradient-to-r from-purple-950/45 to-transparent border border-purple-400/35 shadow-[0_0_14px_rgba(168,85,247,0.14)] flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-500/20">
                <Shield className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="text-xs">
                <span className="text-purple-400 font-bold uppercase tracking-wider">GEX Flip Zone</span>
                <span className="font-mono font-black text-purple-300 ml-2">${netGex.flipZone.strike.toFixed(0)}</span>
              </div>
            </div>
          )}

          {actionableInsight && (
            <div data-testid="text-gamma-insight" className={cn(
              "p-2.5 rounded-lg text-xs border shadow-[inset_0_0_16px_rgba(34,211,238,0.08)]",
              isBullish && "bg-gradient-to-r from-emerald-950/30 to-transparent border-emerald-500/30",
              isBearish && "bg-gradient-to-r from-red-950/30 to-transparent border-red-500/30",
              !isBullish && !isBearish && "bg-gradient-to-r from-cyan-950/30 to-transparent border-cyan-500/30"
            )}>
              <div className="flex items-start gap-2">
                <div className={cn(
                  "p-1 rounded mt-0.5",
                  isBullish && "bg-emerald-500/20",
                  isBearish && "bg-red-500/20",
                  !isBullish && !isBearish && "bg-cyan-500/20"
                )}>
                  <Activity className={cn(
                    "w-3 h-3",
                    isBullish && "text-emerald-400",
                    isBearish && "text-red-400",
                    !isBullish && !isBearish && "text-cyan-400"
                  )} />
                </div>
                <span className={cn(
                  "leading-relaxed font-medium",
                  isBullish && "text-emerald-300",
                  isBearish && "text-red-300",
                  !isBullish && !isBearish && "text-cyan-300"
                )}>{actionableInsight}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
