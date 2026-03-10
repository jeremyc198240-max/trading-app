import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  TrendingUp, 
  TrendingDown, 
  Layers, 
  Target,
  Zap,
  Lock,
  Newspaper,
  Clock,
  Play,
  BarChart2,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import type { MetaEngineOutput } from "@shared/schema";
import { cn } from "@/lib/utils";

const regimeIcons: Record<string, typeof Zap> = {
  trend: TrendingUp,
  range: Layers,
  liquidity_hunt: Target,
  dealer_pinned: Lock,
  news_expansion: Newspaper,
};

const regimeLabels: Record<string, string> = {
  trend: 'Trending',
  range: 'Range',
  liquidity_hunt: 'Liquidity Hunt',
  dealer_pinned: 'Dealer Pin',
  news_expansion: 'Expansion',
};

const sessionLabels: Record<string, string> = {
  open: 'Market Open',
  midday: 'Midday',
  power_hour: 'Power Hour',
  after_hours: 'After Hours',
};

function MiniHudArc({ value, tone = 'cyan' }: { value: number; tone?: 'cyan' | 'emerald' | 'red' | 'amber' | 'violet' }) {
  const norm = Math.max(0, Math.min(1, value / 100));
  const r = 24;
  const arc = Math.PI * r;
  const needleAngle = norm * 180 - 180;
  const toneClass =
    tone === 'emerald'
      ? 'stroke-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.55)] text-emerald-300 border-emerald-400/25 bg-emerald-500/8'
      : tone === 'red'
      ? 'stroke-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.55)] text-red-300 border-red-400/25 bg-red-500/8'
      : tone === 'amber'
      ? 'stroke-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.55)] text-amber-300 border-amber-400/25 bg-amber-500/8'
      : tone === 'violet'
      ? 'stroke-violet-400 drop-shadow-[0_0_8px_rgba(167,139,250,0.55)] text-violet-300 border-violet-400/25 bg-violet-500/8'
      : 'stroke-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.55)] text-cyan-300 border-cyan-400/25 bg-cyan-500/8';

  return (
    <div className={cn('relative h-[76px] w-[120px] rounded-lg border bg-[linear-gradient(160deg,rgba(10,18,34,0.95),rgba(5,10,22,0.76))] shadow-[inset_0_10px_18px_rgba(255,255,255,0.05),inset_0_-12px_18px_rgba(0,0,0,0.45),0_0_18px_rgba(34,211,238,0.12)] overflow-hidden', toneClass)}>
      <div className="pointer-events-none absolute inset-x-3 top-2 h-[2px] rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-6 left-1/2 h-12 w-12 -translate-x-1/2 rounded-full bg-cyan-300/20 blur-2xl" />
      <div className="pointer-events-none absolute -inset-6 opacity-35 animate-gauge-sweep bg-[conic-gradient(from_0deg,transparent_0deg,rgba(34,211,238,0.45)_40deg,transparent_88deg)]" />
      <div className="pointer-events-none absolute left-1 top-1 h-2 w-2 border-l border-t border-cyan-200/60" />
      <div className="pointer-events-none absolute right-1 top-1 h-2 w-2 border-r border-t border-cyan-200/60" />
      <svg width="120" height="76" viewBox="0 0 120 76" className="relative z-10">
        <path d="M30 54 A24 24 0 0 1 78 54" className="fill-none stroke-[11] stroke-cyan-400/10" />
        <path d="M30 54 A24 24 0 0 1 78 54" className="fill-none stroke-[8] stroke-slate-900/80" />
        <path d="M30 54 A24 24 0 0 1 78 54" className="fill-none stroke-[6] stroke-slate-700/55" />
        <path d="M30 54 A24 24 0 0 1 78 54" className="fill-none stroke-[2] stroke-cyan-300/30" strokeDasharray="4 5" />
        <path
          d="M30 54 A24 24 0 0 1 78 54"
          className={cn('fill-none stroke-[8] opacity-45 transition-all duration-500', toneClass)}
          style={{
            strokeDasharray: arc * 1.4,
            strokeDashoffset: arc * 1.4 * (1 - norm),
          }}
        />
        <path
          d="M30 54 A24 24 0 0 1 78 54"
          className={cn('fill-none stroke-[5.4] transition-all duration-500', toneClass)}
          style={{
            strokeDasharray: arc,
            strokeDashoffset: arc * (1 - norm),
          }}
        />
        {[0, 1, 2, 3, 4].map((i) => {
          const angle = (-180 + i * 45) * (Math.PI / 180);
          const x1 = 54 + Math.cos(angle) * 19;
          const y1 = 54 + Math.sin(angle) * 19;
          const x2 = 54 + Math.cos(angle) * 24;
          const y2 = 54 + Math.sin(angle) * 24;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-cyan-100/45" strokeWidth="1" />;
        })}
        <g transform={`rotate(${needleAngle} 54 54)`}>
          <line x1="54" y1="54" x2="74" y2="54" className="stroke-cyan-100" strokeWidth="2" strokeLinecap="round" />
          <line x1="54" y1="54" x2="74" y2="54" className="stroke-cyan-300/35" strokeWidth="4" strokeLinecap="round" />
        </g>
        <circle cx="54" cy="54" r="3.2" className="fill-cyan-100" />
      </svg>
      <div className="absolute left-2.5 bottom-1 text-[9px] font-mono font-black text-slate-300/85">0</div>
      <div className="absolute right-2.5 bottom-1 text-[9px] font-mono font-black text-slate-300/85">100</div>
      <div className={cn('absolute inset-x-0 bottom-1 text-center text-[11px] font-mono font-black tracking-[0.12em]', toneClass)}>{Math.round(value)}%</div>
    </div>
  );
}

function HudLineMeter({
  value,
  tone = 'cyan',
}: {
  value: number;
  tone?: 'cyan' | 'emerald' | 'red' | 'amber' | 'violet';
}) {
  const normalized = Math.max(0, Math.min(100, value));
  const activeSegments = Math.max(0, Math.min(12, Math.round((normalized / 100) * 12)));
  const barTone =
    tone === 'emerald'
      ? 'from-emerald-600 to-emerald-400'
      : tone === 'red'
      ? 'from-red-600 to-red-400'
      : tone === 'amber'
      ? 'from-amber-600 to-amber-400'
      : tone === 'violet'
      ? 'from-violet-600 to-violet-400'
      : 'from-cyan-600 to-cyan-400';

  return (
    <div className="relative rounded-md border border-cyan-400/22 bg-[linear-gradient(180deg,rgba(2,8,18,0.85),rgba(2,8,18,0.55))] p-1 overflow-hidden">
      <div className="pointer-events-none absolute inset-x-1 top-1 h-[1px] bg-white/15" />
      <div className="relative h-2.5 w-full rounded-[3px] border border-cyan-900/35 bg-slate-950/85 px-[3px] py-[2px] overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-[20%] bg-gradient-to-r from-transparent via-cyan-300/25 to-transparent animate-scan-sweep" />
        <div className="relative z-10 grid h-full grid-cols-12 gap-[2px]">
          {Array.from({ length: 12 }).map((_, idx) => (
            <div
              key={idx}
              className={cn(
                'h-full rounded-[1px] border transition-all duration-300',
                idx < activeSegments
                  ? cn('border-transparent bg-gradient-to-b shadow-[0_0_10px_rgba(34,211,238,0.35)]', barTone)
                  : 'border-cyan-900/35 bg-slate-800/55'
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function MetaEngineStrip({ metaEngine, currentPrice }: { metaEngine: MetaEngineOutput; currentPrice?: number }) {
  if (!metaEngine) {
    return null;
  }
  
  const { regime, timeOfDay, metaConfidence, recommendedPlay, probabilities } = metaEngine;
  
  if (!regime || !timeOfDay || !recommendedPlay || !probabilities) {
    return null;
  }
  
  const RegimeIcon = regimeIcons[regime.regime] || Zap;
  const isBullish = regime.bias === 'bullish';
  const isBearish = regime.bias === 'bearish';
  
  const biasConfig = {
    bullish: { color: "text-emerald-400", bg: "bg-emerald-500/20", border: "border-emerald-500/30" },
    bearish: { color: "text-red-400", bg: "bg-red-500/20", border: "border-red-500/30" },
    neutral: { color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border/50" }
  };
  const config = biasConfig[regime.bias as keyof typeof biasConfig] || biasConfig.neutral;
  const confidencePct = Math.round(metaConfidence * 100);
  const dominantValue = Math.round(((probabilities[probabilities.dominant as keyof typeof probabilities] as number) || 0) * 100);
  const sessionWeightPct = Math.round((timeOfDay.weight / 1.2) * 100);
  const playScore =
    recommendedPlay.aggressiveness === 'premium_sell'
      ? 72
      : recommendedPlay.aggressiveness === 'swing'
      ? 68
      : recommendedPlay.aggressiveness === 'scalp'
      ? 58
      : 42;

  return (
    <Card className="group relative overflow-hidden border border-amber-300/38 bg-[linear-gradient(155deg,rgba(6,12,24,0.94),rgba(4,10,20,0.78))] backdrop-blur-md shadow-[inset_0_0_34px_rgba(251,191,36,0.08),0_0_44px_rgba(251,191,36,0.14)]" data-testid="meta-engine-strip">
      <div className="pointer-events-none absolute inset-0 futuristic-grid-bg opacity-24" />
      <div className="pointer-events-none absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_10%_0%,rgba(251,191,36,0.18),transparent_44%),radial-gradient(circle_at_88%_100%,rgba(34,211,238,0.16),transparent_42%)]" />
      <div className="pointer-events-none absolute left-[-28%] top-0 h-[2px] w-[58%] bg-gradient-to-r from-amber-300/0 via-amber-300/75 to-cyan-300/0 animate-border-sweep" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[14%] bg-gradient-to-r from-cyan-300/0 via-cyan-300/10 to-transparent animate-scan-sweep" />
      <div className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t border-amber-200/70" />
      <div className="pointer-events-none absolute right-2 top-2 h-3 w-3 border-r border-t border-cyan-200/70" />
      <div className="pointer-events-none absolute left-2 bottom-2 h-3 w-3 border-l border-b border-amber-200/45" />
      <div className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b border-cyan-200/45" />
      <div className={cn(
        "h-1 bg-gradient-to-r",
        isBullish ? "from-emerald-600 via-teal-500 to-cyan-500" :
        isBearish ? "from-red-600 via-rose-500 to-orange-500" :
        "from-amber-600 via-orange-500 to-yellow-500"
      )} />
      
      <CardHeader className="relative py-3 px-4 border-b border-amber-300/25 bg-gradient-to-r from-amber-500/12 via-transparent to-orange-500/12">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
            <div className="p-1 rounded-md bg-amber-500/20">
              <Layers className="w-4 h-4 text-amber-400" />
            </div>
            <span className="text-amber-300 font-mono tracking-[0.14em]">Meta Engine</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <MiniHudArc
              value={confidencePct}
              tone={isBullish ? 'emerald' : isBearish ? 'red' : 'amber'}
            />
            <div className={cn(
              "px-2 py-0.5 rounded text-xs font-mono font-black tracking-[0.1em]",
              config.bg, config.color, "border", config.border
            )}>
              {confidencePct}%
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="relative z-10 p-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="group relative p-3 rounded-lg bg-[linear-gradient(145deg,rgba(9,17,32,0.62),rgba(5,10,22,0.34))] border border-cyan-400/30 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_16px_rgba(34,211,238,0.08)] space-y-2" data-testid="regime-display">
            <div className="pointer-events-none absolute left-0 right-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/55 to-transparent" />
            <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-[0.12em]">Regime</div>
            <div className="flex items-center gap-2">
              <div className={cn("p-1.5 rounded-md", config.bg)}>
                <RegimeIcon className={cn("w-4 h-4", config.color)} />
              </div>
              <span className="font-bold text-sm font-mono tracking-[0.06em]">{regimeLabels[regime.regime]}</span>
            </div>
            <div className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium font-mono tracking-[0.08em]",
              config.bg, config.color, "border", config.border
            )}>
              {regime.bias} · {Math.round(regime.confidence * 100)}%
            </div>
            <HudLineMeter value={Math.round(regime.confidence * 100)} tone={isBullish ? 'emerald' : isBearish ? 'red' : 'amber'} />
          </div>

          <div className="group relative p-3 rounded-lg bg-[linear-gradient(145deg,rgba(9,17,32,0.62),rgba(5,10,22,0.34))] border border-cyan-400/30 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_16px_rgba(34,211,238,0.08)] space-y-2" data-testid="session-display">
            <div className="pointer-events-none absolute left-0 right-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/45 to-transparent" />
            <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-[0.12em] flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Session
            </div>
            <div className="font-bold text-sm font-mono tracking-[0.06em]">{sessionLabels[timeOfDay.session]}</div>
            <div className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium font-mono tracking-[0.08em]",
              timeOfDay.volBias === 'high' ? "bg-red-500/20 text-red-400 border border-red-500/30" :
              timeOfDay.volBias === 'low' ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
              "bg-muted/30 text-muted-foreground"
            )}>
              Vol: {timeOfDay.volBias.toUpperCase()}
            </div>
            <HudLineMeter value={sessionWeightPct} tone={timeOfDay.volBias === 'high' ? 'red' : timeOfDay.volBias === 'low' ? 'emerald' : 'cyan'} />
          </div>

          <div className="group relative p-3 rounded-lg bg-[linear-gradient(145deg,rgba(9,17,32,0.62),rgba(5,10,22,0.34))] border border-cyan-400/30 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_16px_rgba(34,211,238,0.08)] space-y-2" data-testid="probability-display">
            <div className="pointer-events-none absolute left-0 right-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-violet-300/45 to-transparent" />
            <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-[0.12em]">Dominant</div>
            <div className="font-bold text-sm capitalize font-mono tracking-[0.06em]">
              {probabilities.dominant.replace(/([A-Z])/g, ' $1').trim()}
            </div>
            <div className="text-xs text-muted-foreground">
              {Math.round(probabilities[probabilities.dominant as keyof typeof probabilities] as number * 100)}% probability
            </div>
            <HudLineMeter value={dominantValue} tone={dominantValue >= 55 ? 'violet' : 'cyan'} />
          </div>

          <div className="group relative p-3 rounded-lg bg-[linear-gradient(145deg,rgba(69,34,112,0.2),rgba(38,19,67,0.12))] border border-purple-400/35 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_16px_rgba(168,85,247,0.12)] space-y-2" data-testid="play-display">
            <div className="pointer-events-none absolute left-0 right-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-purple-300/55 to-transparent" />
            <div className="text-[10px] text-purple-300 uppercase font-mono tracking-[0.12em] flex items-center gap-1">
              <Play className="w-3 h-3" />
              0DTE Play
            </div>
            <div className={cn(
              "font-bold text-sm",
              recommendedPlay.direction === 'bullish' ? 'text-emerald-400' : 
              recommendedPlay.direction === 'bearish' ? 'text-red-400' : ''
            )}>
              {recommendedPlay.structure.replace(/_/g, ' ')}
            </div>
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium font-mono tracking-[0.08em] bg-purple-500/20 text-purple-300 border border-purple-500/30 capitalize">
              {recommendedPlay.aggressiveness}
            </div>
            <HudLineMeter value={playScore} tone="violet" />
          </div>
        </div>

        {recommendedPlay.notes.length > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-[linear-gradient(120deg,rgba(9,17,32,0.55),rgba(3,9,18,0.28))] border border-cyan-400/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-xs text-slate-300/92 leading-relaxed">{recommendedPlay.notes[0]}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LiquidityLevelsCard({ metaEngine, currentPrice }: { metaEngine: MetaEngineOutput; currentPrice?: number }) {
  const liquidity = metaEngine?.liquidity;
  const price = currentPrice || 0;
  
  if (!liquidity?.levels) {
    return null;
  }
  
  const sortedLevels = [...liquidity.levels].sort((a, b) => b.price - a.price);
  const avgLiquidityScore = sortedLevels.length
    ? sortedLevels.slice(0, 6).reduce((sum, level) => sum + level.liquidityScore, 0) / Math.min(6, sortedLevels.length)
    : 0;

  const levelStyles: Record<string, { bg: string; text: string; border: string }> = {
    PDH: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/30" },
    PDL: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/30" },
    ONH: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/30" },
    ONL: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/30" },
    VWAP: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
    SWING_HIGH: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
    SWING_LOW: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30" },
    GAMMA: { bg: "bg-pink-500/10", text: "text-pink-400", border: "border-pink-500/30" },
  };

  return (
    <Card className="group relative overflow-hidden border border-cyan-300/35 bg-[linear-gradient(150deg,rgba(5,12,24,0.92),rgba(3,9,18,0.74))] backdrop-blur-md shadow-[inset_0_0_28px_rgba(34,211,238,0.06),0_0_36px_rgba(34,211,238,0.12)]" data-testid="liquidity-levels-card">
      <div className="pointer-events-none absolute inset-0 opacity-24 futuristic-grid-bg" />
      <div className="pointer-events-none absolute left-[-30%] top-0 h-[2px] w-[60%] bg-gradient-to-r from-cyan-300/0 via-cyan-300/75 to-violet-300/0 animate-border-sweep" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[12%] bg-gradient-to-r from-cyan-300/0 via-cyan-300/10 to-transparent animate-scan-sweep" />
      <div className="h-0.5 bg-gradient-to-r from-cyan-500/50 via-purple-500/50 to-pink-500/50" />
      <CardHeader className="relative py-3 px-4 border-b border-cyan-300/22 bg-gradient-to-r from-cyan-500/8 via-transparent to-purple-500/8">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 font-mono">
          <Target className="w-3.5 h-3.5 text-cyan-400" />
          Liquidity Levels
        </CardTitle>
      </CardHeader>
      <CardContent className="relative z-10 p-4">
        <div className="mb-3 flex items-center justify-between rounded-lg border border-cyan-400/25 bg-[linear-gradient(120deg,rgba(9,17,32,0.58),rgba(5,10,22,0.28))] px-3 py-2">
          <span className="text-[10px] uppercase tracking-[0.12em] font-mono text-muted-foreground">Liquidity Strength</span>
          <MiniHudArc value={Math.round(avgLiquidityScore * 100)} tone={avgLiquidityScore >= 0.6 ? 'emerald' : avgLiquidityScore >= 0.4 ? 'amber' : 'red'} />
        </div>
        <div className="space-y-2">
          {sortedLevels.slice(0, 6).map((level, i) => {
            const isAbove = level.price > price;
            const style = levelStyles[level.type] || { bg: "bg-muted/30", text: "text-muted-foreground", border: "border-border/50" };
            
            return (
              <div 
                key={`${level.type}-${i}`} 
                className="group relative text-xs py-2 px-3 rounded-lg bg-[linear-gradient(120deg,rgba(9,17,32,0.55),rgba(4,10,20,0.28))] border border-cyan-400/22 backdrop-blur-sm"
                data-testid={`level-${level.type.toLowerCase()}`}
              >
                <div className="pointer-events-none absolute left-0 right-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/35 to-transparent" />
                <div className="flex items-center justify-between gap-2">
                  <div className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-mono font-bold",
                    style.bg, style.text, "border", style.border
                  )}>
                    {level.type}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isAbove ? (
                      <ArrowUp className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-red-400" />
                    )}
                    <span className={cn(
                      "font-mono font-bold",
                      isAbove ? "text-emerald-400" : "text-red-400"
                    )}>
                      ${level.price.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="mt-2">
                  <HudLineMeter
                    value={Math.round(level.liquidityScore * 100)}
                    tone={level.liquidityScore >= 0.65 ? 'emerald' : level.liquidityScore >= 0.45 ? 'amber' : 'red'}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function ProbabilityBars({ probabilities }: { probabilities: MetaEngineOutput['probabilities'] }) {
  if (!probabilities) {
    return null;
  }

  const segmentCount = 18;
  
  const items = [
    { key: 'continuationUp', label: 'Continuation Up', value: probabilities.continuationUp || 0, gradient: 'from-emerald-600 to-emerald-400', text: 'text-emerald-400' },
    { key: 'continuationDown', label: 'Continuation Down', value: probabilities.continuationDown || 0, gradient: 'from-red-600 to-red-400', text: 'text-red-400' },
    { key: 'reversalUp', label: 'Reversal Up', value: probabilities.reversalUp || 0, gradient: 'from-teal-600 to-teal-400', text: 'text-teal-400' },
    { key: 'reversalDown', label: 'Reversal Down', value: probabilities.reversalDown || 0, gradient: 'from-rose-600 to-rose-400', text: 'text-rose-400' },
    { key: 'chop', label: 'Chop/Range', value: probabilities.chop || 0, gradient: 'from-gray-500 to-gray-400', text: 'text-gray-400' },
  ];

  return (
    <Card className="group relative overflow-hidden border border-emerald-300/30 bg-[linear-gradient(150deg,rgba(5,12,24,0.92),rgba(3,9,18,0.74))] backdrop-blur-md shadow-[inset_0_0_28px_rgba(16,185,129,0.06),0_0_36px_rgba(16,185,129,0.12)]" data-testid="probability-bars">
      <div className="pointer-events-none absolute inset-0 opacity-24 futuristic-grid-bg" />
      <div className="pointer-events-none absolute left-[-30%] top-0 h-[2px] w-[60%] bg-gradient-to-r from-emerald-300/0 via-emerald-300/75 to-red-300/0 animate-border-sweep" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[12%] bg-gradient-to-r from-emerald-300/0 via-emerald-300/10 to-transparent animate-scan-sweep" />
      <div className="h-0.5 bg-gradient-to-r from-emerald-500/50 via-amber-500/50 to-red-500/50" />
      <CardHeader className="relative py-3 px-4 border-b border-emerald-300/22 bg-gradient-to-r from-emerald-500/8 via-transparent to-amber-500/8">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 font-mono">
          <BarChart2 className="w-3.5 h-3.5 text-amber-400" />
          Probabilities
        </CardTitle>
      </CardHeader>
      <CardContent className="relative z-10 p-4 space-y-3">
        {items.map((item) => (
          <div key={item.key} className="grid grid-cols-[1fr_auto] gap-2 items-center" data-testid={`prob-${item.key}`}>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{item.label}</span>
              <span className={cn("font-mono font-bold", item.text)}>
                {Math.round(item.value * 100)}%
              </span>
              </div>
              <div className="relative rounded-lg border border-border/45 bg-muted/20 p-1.5">
                <div className="pointer-events-none absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_10%_0%,rgba(34,211,238,0.28),transparent_52%)]" />
                <div className="grid gap-1 [grid-template-columns:repeat(18,minmax(0,1fr))]">
                  {Array.from({ length: segmentCount }).map((_, segmentIndex) => {
                    const segmentThreshold = (segmentIndex + 1) / segmentCount;
                    const isLit = item.value >= segmentThreshold;
                    return (
                      <div
                        key={`${item.key}-${segmentIndex}`}
                        className={cn(
                          "h-2 rounded-[2px] border transition-all duration-300",
                          isLit
                            ? cn(
                                "bg-gradient-to-r border-transparent",
                                item.gradient,
                                item.key === 'continuationUp' || item.key === 'reversalUp'
                                  ? "shadow-[0_0_8px_rgba(52,211,153,0.55)]"
                                  : item.key === 'continuationDown' || item.key === 'reversalDown'
                                  ? "shadow-[0_0_8px_rgba(251,113,133,0.55)]"
                                  : "shadow-[0_0_8px_rgba(156,163,175,0.45)]"
                              )
                            : "bg-slate-900/70 border-slate-700/55"
                        )}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
            <MiniHudArc value={Math.round(item.value * 100)} tone={item.key === 'continuationUp' || item.key === 'reversalUp' ? 'emerald' : item.key === 'continuationDown' || item.key === 'reversalDown' ? 'red' : 'amber'} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function MetaEngineSection({ metaEngine, currentPrice }: { metaEngine: MetaEngineOutput; currentPrice?: number }) {
  return (
    <div className="space-y-4" data-testid="meta-engine-section">
      <MetaEngineStrip metaEngine={metaEngine} currentPrice={currentPrice} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LiquidityLevelsCard metaEngine={metaEngine} currentPrice={currentPrice} />
        <ProbabilityBars probabilities={metaEngine.probabilities} />
      </div>
    </div>
  );
}
