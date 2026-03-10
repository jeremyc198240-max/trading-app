import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Activity,
  BarChart3,
  Gauge,
  Waves,
  Target,
  Zap
} from "lucide-react";

interface IndicatorValue {
  value: number;
  signal?: string;
  trend?: string;
  contribution: number;
}

interface MarketHealthData {
  rsi: { value: number; signal: string; contribution: number };
  macd: { value: number; signal: number; histogram: number; trend: string; contribution: number };
  adx: { value: number; plusDI: number; minusDI: number; trendStrength: string; contribution: number };
  obv: { value: number; trend: string; contribution: number };
  cmf: { value: number; signal: string; contribution: number };
  atr: { value: number; percent: number };
  bollingerBands: { upper: number; middle: number; lower: number; squeeze: boolean; percentB: number; contribution: number };
  keltnerChannel: { upper: number; middle: number; lower: number; breakout: string | null; contribution: number };
  stochastic: { k: number; d: number; signal: string; contribution: number };
  vwapSlope: { value: number; trend: string; contribution: number };
  ivChange: { value: number; signal: string; contribution: number };
  orderflow: { tickImbalance: number; volumeDelta: number; contribution: number };
  gamma: { maxAbsGammaStrike: number | null; contribution: number };
  breadth: { advanceDecline: number; newHighsLows: number; composite: number; contribution: number };
  overallHealth: number;
  healthGrade: string;
  contributors: { name: string; value: number }[];
}

interface MarketHealthProps {
  marketHealth: MarketHealthData;
}

function HealthArc({ value }: { value: number }) {
  const normalized = Math.max(0, Math.min(1, value / 100));
  const r = 34;
  const arc = Math.PI * r;
  const needleAngle = normalized * 180 - 180;

  return (
    <div className="relative h-[90px] w-[132px] rounded-lg border border-cyan-300/40 bg-[linear-gradient(145deg,rgba(7,16,30,0.92),rgba(4,10,22,0.78))] shadow-[inset_0_0_28px_rgba(34,211,238,0.12),0_0_28px_rgba(34,211,238,0.18)] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 rounded-lg bg-cyan-300/5 blur-[1px]" />
      <div className="pointer-events-none absolute -bottom-8 left-1/2 h-20 w-20 -translate-x-1/2 rounded-full bg-cyan-300/15 blur-2xl" />
      <div className="pointer-events-none absolute -inset-8 opacity-40 animate-gauge-sweep bg-[conic-gradient(from_0deg,transparent_0deg,rgba(34,211,238,0.4)_44deg,transparent_86deg)]" />
      <div className="pointer-events-none absolute left-1 top-1 h-2 w-2 border-l border-t border-cyan-300/70" />
      <div className="pointer-events-none absolute right-1 top-1 h-2 w-2 border-r border-t border-cyan-300/70" />
      <svg width="132" height="90" viewBox="0 0 132 90" className="relative z-10">
        <path d="M32 62 A34 34 0 0 1 100 62" className="fill-none stroke-[11] stroke-cyan-400/10" />
        <path d="M30 58 A34 34 0 0 1 98 58" className="fill-none stroke-[8] stroke-slate-700/50" />
        <path d="M30 58 A34 34 0 0 1 98 58" className="fill-none stroke-[2] stroke-cyan-300/35" strokeDasharray="5 5" />
        <path d="M30 58 A34 34 0 0 1 98 58" className="fill-none stroke-[4] stroke-cyan-300/28 blur-[0.2px]" />
        <path
          d="M30 58 A34 34 0 0 1 98 58"
          className={cn(
            "fill-none stroke-[7] transition-all duration-500",
            value >= 65
              ? "stroke-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.55)]"
              : value >= 45
              ? "stroke-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.55)]"
              : "stroke-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.55)]"
          )}
          style={{
            strokeDasharray: arc,
            strokeDashoffset: arc * (1 - normalized),
          }}
        />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const angle = (-180 + i * 30) * (Math.PI / 180);
          const x1 = 64 + Math.cos(angle) * 28;
          const y1 = 58 + Math.sin(angle) * 28;
          const x2 = 64 + Math.cos(angle) * 33;
          const y2 = 58 + Math.sin(angle) * 33;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-cyan-200/45" strokeWidth="1" />;
        })}
        <g transform={`rotate(${needleAngle} 64 58)`}>
          <line x1="64" y1="58" x2="93" y2="58" className="stroke-cyan-200" strokeWidth="2" strokeLinecap="round" />
        </g>
        <circle cx="64" cy="58" r="3.2" className="fill-cyan-200" />
      </svg>
      <div className="absolute inset-x-0 bottom-1 text-center text-[11px] font-mono font-black tracking-[0.14em] text-cyan-100">{value}%</div>
    </div>
  );
}

function TinyArc({ value, tone = 'cyan' }: { value: number; tone?: 'cyan' | 'emerald' | 'red' | 'amber' }) {
  const normalized = Math.max(0, Math.min(1, value / 100));
  const r = 18;
  const arc = Math.PI * r;
  const needleAngle = normalized * 180 - 180;
  const colorClass =
    tone === 'emerald'
      ? 'text-emerald-300'
      : tone === 'red'
      ? 'text-red-300'
      : tone === 'amber'
      ? 'text-amber-300'
      : 'text-cyan-300';
  const stroke =
    tone === 'emerald'
      ? 'stroke-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.55)]'
      : tone === 'red'
      ? 'stroke-red-400 drop-shadow-[0_0_6px_rgba(248,113,113,0.55)]'
      : tone === 'amber'
      ? 'stroke-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.55)]'
      : 'stroke-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.55)]';

  return (
    <div className="relative h-[70px] w-[120px] rounded-lg border border-cyan-300/35 bg-[linear-gradient(160deg,rgba(8,16,30,0.95)_0%,rgba(6,13,26,0.92)_42%,rgba(3,8,18,0.78)_100%)] shadow-[inset_0_10px_18px_rgba(255,255,255,0.05),inset_0_-12px_18px_rgba(0,0,0,0.45),0_0_18px_rgba(34,211,238,0.12)] overflow-hidden">
      <div className="pointer-events-none absolute inset-x-4 top-2 h-[2px] rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-6 left-1/2 h-12 w-12 -translate-x-1/2 rounded-full bg-cyan-300/18 blur-2xl" />
      <div className="pointer-events-none absolute -inset-4 opacity-30 animate-gauge-sweep bg-[conic-gradient(from_0deg,transparent_0deg,rgba(34,211,238,0.35)_44deg,transparent_84deg)]" />
      <svg width="120" height="70" viewBox="0 0 120 70" className="relative z-10">
        <path d="M24 50 A26 26 0 0 1 96 50" className="fill-none stroke-[14] stroke-cyan-400/10" />
        <path d="M24 50 A26 26 0 0 1 96 50" className="fill-none stroke-[9] stroke-slate-900/80" />
        <path d="M24 50 A26 26 0 0 1 96 50" className="fill-none stroke-[7] stroke-slate-700/55" />
        <path d="M24 50 A26 26 0 0 1 96 50" className="fill-none stroke-[2] stroke-cyan-200/28" strokeDasharray="4 5" />
        <path
          d="M24 50 A26 26 0 0 1 96 50"
          className={cn('fill-none stroke-[8.5] opacity-45 transition-all duration-500', stroke)}
          style={{ strokeDasharray: arc * 1.45, strokeDashoffset: arc * 1.45 * (1 - normalized) }}
        />
        <path
          d="M24 50 A26 26 0 0 1 96 50"
          className={cn('fill-none stroke-[5.5] transition-all duration-500', stroke)}
          style={{ strokeDasharray: arc, strokeDashoffset: arc * (1 - normalized) }}
        />
        {[0, 1, 2, 3, 4].map((i) => {
          const angle = (-180 + i * 45) * (Math.PI / 180);
          const x1 = 60 + Math.cos(angle) * 20;
          const y1 = 50 + Math.sin(angle) * 20;
          const x2 = 60 + Math.cos(angle) * 25;
          const y2 = 50 + Math.sin(angle) * 25;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-cyan-200/50" strokeWidth="1.2" />;
        })}
        <g transform={`rotate(${needleAngle} 60 50)`}>
          <line x1="60" y1="50" x2="84" y2="50" className="stroke-cyan-100" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="60" y1="50" x2="84" y2="50" className="stroke-cyan-300/35" strokeWidth="4.6" strokeLinecap="round" />
        </g>
        <circle cx="60" cy="50" r="4" className="fill-cyan-100" />
        <circle cx="60" cy="50" r="7" className="fill-cyan-300/20" />
      </svg>
      <div className="absolute left-2.5 bottom-1.5 text-[9px] font-mono font-black tracking-[0.1em] text-slate-300/85">0</div>
      <div className="absolute right-2.5 bottom-1.5 text-[9px] font-mono font-black tracking-[0.1em] text-slate-300/85">100</div>
      <div className={cn("absolute inset-x-0 bottom-1.5 text-center text-[11px] font-mono font-black tracking-[0.14em]", colorClass)}>{Math.round(value)}%</div>
    </div>
  );
}

function getSignalColor(signal: string | undefined): string {
  if (!signal) return "text-muted-foreground";
  if (signal === "bullish" || signal === "accumulation" || signal === "oversold") return "text-emerald-400";
  if (signal === "bearish" || signal === "distribution" || signal === "overbought") return "text-red-400";
  return "text-muted-foreground";
}

function getContributionIcon(contribution: number) {
  if (contribution > 2) return <TrendingUp className="w-3 h-3 text-emerald-400" />;
  if (contribution < -2) return <TrendingDown className="w-3 h-3 text-red-400" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

function getHealthGradeStyles(grade: string) {
  switch (grade) {
    case "A": return { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30", gradient: "from-emerald-500 to-teal-400" };
    case "B": return { bg: "bg-cyan-500/20", text: "text-cyan-400", border: "border-cyan-500/30", gradient: "from-cyan-500 to-blue-400" };
    case "C": return { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/30", gradient: "from-amber-500 to-yellow-400" };
    case "D": return { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30", gradient: "from-orange-500 to-red-400" };
    case "F": return { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30", gradient: "from-red-500 to-rose-400" };
    default: return { bg: "bg-muted/50", text: "text-muted-foreground", border: "border-border", gradient: "from-muted to-muted-foreground" };
  }
}

function IndicatorRow({ 
  label, 
  value, 
  signal, 
  contribution,
  icon: Icon,
  format = "number"
}: { 
  label: string; 
  value: number | string; 
  signal?: string; 
  contribution: number;
  icon: React.ElementType;
  format?: "number" | "percent" | "text";
}) {
  const numeric = typeof value === "number" ? value : null;
  const prettyNumber = numeric === null ? value : Number.isFinite(numeric) ? (Math.abs(numeric) >= 100 ? numeric.toFixed(0) : numeric.toFixed(2)) : value;
  const formattedValue = format === "percent" ? `${prettyNumber}%` : prettyNumber;
  const contributionStrength = Math.max(0, Math.min(100, Math.abs(contribution) * 14));
  const activeSegments = Math.max(0, Math.min(12, Math.round((contributionStrength / 100) * 12)));
  const signalLower = (signal || "").toLowerCase();
  const signalBull = signalLower === "bullish" || signalLower === "accumulation" || signalLower === "oversold";
  const signalBear = signalLower === "bearish" || signalLower === "distribution" || signalLower === "overbought";
  const isBull = signalBull || (!signalBull && !signalBear && contribution > 0);
  const isBear = signalBear || (!signalBull && !signalBear && contribution < 0);
  const meterTone = isBull ? "from-emerald-500 via-emerald-400 to-emerald-300" : isBear ? "from-red-500 via-red-400 to-red-300" : "from-cyan-500 via-cyan-400 to-cyan-300";
  const meterGlow = isBull ? "shadow-[0_0_12px_rgba(16,185,129,0.5)]" : isBear ? "shadow-[0_0_12px_rgba(248,113,113,0.5)]" : "shadow-[0_0_12px_rgba(34,211,238,0.45)]";
  const meterBorder = isBull ? "border-emerald-400/35" : isBear ? "border-red-400/35" : "border-cyan-400/30";
  
  return (
    <div className="relative py-2.5 px-2 rounded-md border border-cyan-400/20 bg-[linear-gradient(155deg,rgba(11,19,35,0.7),rgba(4,10,22,0.4))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-8px_18px_rgba(0,0,0,0.35)] mb-1.5 last:mb-0">
      <div className="pointer-events-none absolute left-1 top-1 h-1.5 w-1.5 border-l border-t border-cyan-200/40" />
      <div className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 border-r border-t border-cyan-200/40" />
      <div className="pointer-events-none absolute left-0 right-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/30 to-transparent" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-cyan-300/80" />
          <span className="text-[12px] font-mono uppercase tracking-[0.1em] text-slate-200">{label}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-bold tracking-[0.08em] text-cyan-100">{formattedValue}</span>
          {signal && (
            <Badge variant="outline" className={`text-[10px] font-mono uppercase tracking-[0.08em] border-cyan-400/20 bg-cyan-500/5 ${getSignalColor(signal)}`}>
              {signal}
            </Badge>
          )}
          <div className="inline-flex items-center gap-1 rounded-md border border-cyan-400/20 bg-background/40 px-1.5 py-0.5 shadow-[inset_0_0_8px_rgba(34,211,238,0.05)]">
            <span className={cn("text-[10px] font-mono font-bold tracking-[0.08em]", contribution > 0 ? "text-emerald-300" : contribution < 0 ? "text-red-300" : "text-slate-300")}>{contribution > 0 ? "+" : ""}{contribution.toFixed(1)}</span>
            {getContributionIcon(contribution)}
          </div>
        </div>
      </div>
      <div className={cn("relative mt-2 rounded-md border bg-[linear-gradient(180deg,rgba(2,8,18,0.88),rgba(2,8,18,0.58))] p-1.5 overflow-hidden", meterBorder)}>
        <div className="pointer-events-none absolute inset-x-1.5 top-1 h-[1px] bg-white/15" />
        <div className="pointer-events-none absolute inset-x-1.5 bottom-1 h-[1px] bg-black/40" />
        <div className="pointer-events-none absolute inset-y-1.5 left-1/2 w-px bg-cyan-200/20" />
        <div className="relative h-3.5 w-full rounded-[4px] border border-cyan-900/45 bg-slate-950/90 px-1 py-[3px] overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[18%] bg-gradient-to-r from-transparent via-cyan-300/35 to-transparent animate-scan-sweep" />
          <div className="relative z-10 grid h-full grid-cols-12 gap-[2px]">
            {Array.from({ length: 12 }).map((_, index) => {
              const active = index < activeSegments;
              return (
                <div
                  key={index}
                  className={cn(
                    "h-full rounded-[1px] border transition-all duration-300",
                    active
                      ? cn("border-transparent bg-gradient-to-b", meterTone, meterGlow)
                      : "border-cyan-900/40 bg-slate-800/55"
                  )}
                />
              );
            })}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between text-[9px] font-mono font-black tracking-[0.12em] text-slate-400/90">
          <span>NEG</span>
          <span>POWER {Math.round(contributionStrength)}</span>
          <span>POS</span>
        </div>
      </div>
    </div>
  );
}

function MetricBlock({
  children,
  tone = 'cyan',
}: {
  children: React.ReactNode;
  tone?: 'cyan' | 'emerald' | 'red' | 'amber';
}) {
  const borderTone = tone === 'emerald' ? 'border-emerald-400/25' : tone === 'red' ? 'border-red-400/25' : tone === 'amber' ? 'border-amber-400/25' : 'border-cyan-400/25';
  const lineTone = tone === 'emerald' ? 'via-emerald-300/35' : tone === 'red' ? 'via-red-300/35' : tone === 'amber' ? 'via-amber-300/35' : 'via-cyan-300/35';

  return (
    <div className={cn("relative rounded-lg border bg-[linear-gradient(125deg,rgba(7,15,28,0.55),rgba(6,10,20,0.22))] p-2 overflow-hidden", borderTone)}>
      <div className={cn("pointer-events-none absolute left-0 right-0 top-0 h-[1px] bg-gradient-to-r from-transparent to-transparent", lineTone)} />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[18%] bg-gradient-to-r from-transparent via-cyan-300/10 to-transparent animate-scan-sweep" />
      {children}
    </div>
  );
}

function IndicatorCard({
  title,
  children,
  icon: Icon,
  sentiment
}: {
  title: string;
  children: React.ReactNode;
  icon: React.ElementType;
  sentiment?: "bullish" | "bearish" | "neutral";
}) {
  const gradients = {
    bullish: "from-emerald-500/10 via-transparent to-transparent",
    bearish: "from-red-500/10 via-transparent to-transparent",
    neutral: "from-muted/30 via-transparent to-transparent",
  };
  
  const borders = {
    bullish: "border-emerald-500/30",
    bearish: "border-red-500/30",
    neutral: "border-border/50",
  };
  
  const iconColors = {
    bullish: "text-emerald-400",
    bearish: "text-red-400",
    neutral: "text-muted-foreground",
  };
  
  const s = sentiment || "neutral";
  const sentimentGlyph = s === "bullish" ? "▲" : s === "bearish" ? "▼" : "◆";
  const sentimentLabel = s === "bullish" ? "LONG" : s === "bearish" ? "SHORT" : "HOLD";
  
  return (
    <Card className={cn("group relative h-full overflow-hidden bg-[linear-gradient(145deg,rgba(5,12,24,0.88),rgba(2,8,18,0.7))] backdrop-blur-md shadow-[inset_0_0_24px_rgba(34,211,238,0.05),0_0_26px_rgba(34,211,238,0.08)]", borders[s])}>
      <div className={cn("pointer-events-none absolute left-[-32%] top-0 h-[2px] w-[60%] animate-border-sweep bg-gradient-to-r", s === "bullish" ? "from-emerald-300/0 via-emerald-300/75 to-cyan-300/0" : s === "bearish" ? "from-rose-300/0 via-rose-300/75 to-red-300/0" : "from-slate-300/0 via-slate-300/55 to-slate-300/0")} />
      <div className="pointer-events-none absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.2),transparent_44%),radial-gradient(circle_at_88%_100%,rgba(168,85,247,0.14),transparent_42%)]" />
      <div className="pointer-events-none absolute inset-0 futuristic-grid-bg opacity-15" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[16%] bg-gradient-to-r from-cyan-300/0 via-cyan-300/8 to-transparent animate-scan-sweep" />
      <div className="pointer-events-none absolute left-2 top-2 h-2.5 w-2.5 border-l border-t border-cyan-300/80" />
      <div className="pointer-events-none absolute right-2 top-2 h-2.5 w-2.5 border-r border-t border-cyan-300/80" />
      <div className="pointer-events-none absolute left-2 bottom-2 h-2.5 w-2.5 border-l border-b border-cyan-300/45" />
      <div className="pointer-events-none absolute right-2 bottom-2 h-2.5 w-2.5 border-r border-b border-cyan-300/45" />
      <div className={`h-0.5 ${
        s === "bullish" ? "bg-gradient-to-r from-emerald-500 to-teal-400" :
        s === "bearish" ? "bg-gradient-to-r from-red-500 to-rose-400" :
        "bg-gradient-to-r from-muted to-muted-foreground/30"
      }`} />
      <div className={`bg-gradient-to-br ${gradients[s]}`}>
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className={`p-1 rounded-md ${
              s === "bullish" ? "bg-emerald-500/20" :
              s === "bearish" ? "bg-red-500/20" :
              "bg-muted/30"
            }`}>
              <Icon className={`w-4 h-4 ${iconColors[s]}`} />
            </div>
            <span className="font-mono uppercase tracking-[0.12em] text-cyan-100/95">{title}</span>
            <div className={cn("ml-auto inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-mono font-black tracking-[0.12em]", s === "bullish" ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-300" : s === "bearish" ? "border-red-400/35 bg-red-500/10 text-red-300" : "border-cyan-400/25 bg-cyan-500/8 text-cyan-200")}> 
              <span>{sentimentGlyph}</span>
              <span>{sentimentLabel}</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="relative pt-0 pb-3 flex h-full flex-col">
          {children}
        </CardContent>
      </div>
    </Card>
  );
}

export function MarketHealth({ marketHealth }: MarketHealthProps) {
  const {
    rsi,
    macd,
    adx,
    obv,
    cmf,
    atr,
    bollingerBands,
    keltnerChannel,
    stochastic,
    vwapSlope,
    ivChange,
    orderflow,
    gamma,
    breadth,
    overallHealth,
    healthGrade,
    contributors
  } = marketHealth;

  // Calculate sentiment for each indicator card
  const momentumScore = (rsi.contribution ?? 0) + (stochastic.contribution ?? 0) + (macd.contribution ?? 0);
  const momentumSentiment: "bullish" | "bearish" | "neutral" = momentumScore > 1.5 ? "bullish" : momentumScore < -1.5 ? "bearish" : "neutral";
  
  const trendSentiment: "bullish" | "bearish" | "neutral" = 
    vwapSlope.trend === "bullish" || (adx.plusDI - adx.minusDI) > 1 ? "bullish" :
    vwapSlope.trend === "bearish" || (adx.minusDI - adx.plusDI) > 1 ? "bearish" : "neutral";
  
  const volumeFlowSentiment: "bullish" | "bearish" | "neutral" = 
    obv.trend === "bullish" || cmf.value > 0.05 ? "bullish" :
    obv.trend === "bearish" || cmf.value < -0.05 ? "bearish" : "neutral";
  
  const volatilitySentiment: "bullish" | "bearish" | "neutral" = 
    ivChange.signal === "low" || atr.percent < 1.5 ? "bullish" : 
    ivChange.signal === "elevated" || atr.percent > 3.5 ? "bearish" : "neutral";
  
  const bollingerSentiment: "bullish" | "bearish" | "neutral" = 
    bollingerBands.percentB > 55 ? "bullish" : bollingerBands.percentB < 45 ? "bearish" : "neutral";
  
  const keltnerSentiment: "bullish" | "bearish" | "neutral" = 
    keltnerChannel.breakout === "upper" ? "bullish" : 
    keltnerChannel.breakout === "lower" ? "bearish" : 
    (keltnerChannel.contribution > 0.5 ? "bullish" : keltnerChannel.contribution < -0.5 ? "bearish" : "neutral");
  
  const orderflowSentiment: "bullish" | "bearish" | "neutral" = 
    (orderflow.tickImbalance > 0.5 || orderflow.volumeDelta > 0.15) ? "bullish" :
    (orderflow.tickImbalance < -0.5 || orderflow.volumeDelta < -0.15) ? "bearish" : "neutral";
  
  const breadthSentiment: "bullish" | "bearish" | "neutral" = 
    breadth.advanceDecline > 0.05 || breadth.composite > 55 ? "bullish" :
    breadth.advanceDecline < -0.05 || breadth.composite < 45 ? "bearish" : "neutral";

  const gradeStyles = getHealthGradeStyles(healthGrade);

  return (
    <Card className="group relative overflow-hidden border border-cyan-300/40 bg-[linear-gradient(150deg,rgba(4,10,22,0.92),rgba(3,8,18,0.75))] backdrop-blur-md shadow-[inset_0_0_34px_rgba(34,211,238,0.07),0_0_42px_rgba(34,211,238,0.12)]" data-testid="market-health-section">
      <div className="pointer-events-none absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_8%_0%,rgba(34,211,238,0.18),transparent_42%),radial-gradient(circle_at_90%_100%,rgba(168,85,247,0.14),transparent_44%)]" />
      <div className="pointer-events-none absolute inset-0 futuristic-grid-bg opacity-25" />
      <div className="pointer-events-none absolute left-[-25%] top-0 h-[2px] w-[60%] bg-gradient-to-r from-cyan-300/0 via-cyan-300/70 to-fuchsia-300/0 animate-border-sweep" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[15%] bg-gradient-to-r from-cyan-300/0 via-cyan-300/10 to-transparent animate-scan-sweep" />
      <div className={`h-1 bg-gradient-to-r ${gradeStyles.gradient}`} />
      <CardHeader className="relative py-3 px-4 border-b border-cyan-400/25 bg-gradient-to-r from-teal-500/12 via-transparent to-cyan-500/12">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-teal-400 flex items-center gap-2">
            <div className="p-1 rounded-md bg-teal-500/20">
              <Activity className="w-4 h-4" />
            </div>
            <span className="font-mono tracking-[0.15em] text-cyan-100">Market Health</span>
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-cyan-500/5 border border-cyan-400/25 shadow-[inset_0_0_10px_rgba(34,211,238,0.06)]">
              <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-[0.12em]">Score</span>
              <span className="font-mono font-black tracking-[0.08em] text-sm text-cyan-100">{overallHealth}%</span>
            </div>
            <div className={`px-2 py-1 rounded-md font-mono font-black tracking-[0.12em] text-sm ${gradeStyles.bg} ${gradeStyles.text} border ${gradeStyles.border}`} data-testid="badge-health-grade">
              {healthGrade}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative z-10 p-4 space-y-4">
        <div className="p-4 rounded-lg bg-muted/15 border border-cyan-400/25 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Overall Health</span>
            <span className={`font-mono font-bold ${overallHealth >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{overallHealth}%</span>
          </div>
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted/30">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-[18%] bg-gradient-to-r from-cyan-300/0 via-cyan-300/35 to-cyan-300/0 animate-scan-sweep" />
            <div 
              className={`h-full rounded-full transition-all duration-500 ${overallHealth >= 50 ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-gradient-to-r from-red-600 to-red-400'}`}
              style={{ width: `${Math.min(100, overallHealth)}%` }}
            />
          </div>
          <div className="pt-2 flex justify-end">
            <HealthArc value={overallHealth} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <IndicatorCard title="Momentum" icon={Zap} sentiment={momentumSentiment}>
          <IndicatorRow 
            label="RSI (14)" 
            value={rsi.value} 
            signal={rsi.signal}
            contribution={rsi.contribution}
            icon={Gauge}
          />
          <IndicatorRow 
            label="Stochastic %K" 
            value={stochastic.k} 
            signal={stochastic.signal}
            contribution={stochastic.contribution}
            icon={Gauge}
          />
          <IndicatorRow 
            label="MACD Hist" 
            value={macd.histogram} 
            signal={macd.trend}
            contribution={macd.contribution}
            icon={BarChart3}
          />
          <div className="mt-auto pt-2 flex justify-center">
            <TinyArc value={Math.max(0, Math.min(100, 50 + momentumScore * 7))} tone={momentumSentiment === 'bullish' ? 'emerald' : momentumSentiment === 'bearish' ? 'red' : 'cyan'} />
          </div>
        </IndicatorCard>

        <IndicatorCard title="Trend" icon={TrendingUp} sentiment={trendSentiment}>
          <IndicatorRow 
            label="ADX" 
            value={adx.value} 
            signal={adx.trendStrength}
            contribution={adx.contribution}
            icon={Activity}
          />
          <IndicatorRow 
            label="VWAP Slope" 
            value={vwapSlope.value} 
            signal={vwapSlope.trend}
            contribution={vwapSlope.contribution}
            icon={TrendingUp}
          />
          <MetricBlock tone={trendSentiment === 'bullish' ? 'emerald' : trendSentiment === 'bearish' ? 'red' : 'cyan'}>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>+DI: {adx.plusDI}</span>
              <span>-DI: {adx.minusDI}</span>
            </div>
          </MetricBlock>
          <div className="mt-auto pt-2 flex justify-center">
            <TinyArc value={Math.max(0, Math.min(100, adx.value * 2))} tone={trendSentiment === 'bullish' ? 'emerald' : trendSentiment === 'bearish' ? 'red' : 'cyan'} />
          </div>
        </IndicatorCard>

        <IndicatorCard title="Volume Flow" icon={BarChart3} sentiment={volumeFlowSentiment}>
          <IndicatorRow 
            label="OBV Trend" 
            value={obv.trend} 
            signal={obv.trend}
            contribution={obv.contribution}
            icon={BarChart3}
            format="text"
          />
          <IndicatorRow 
            label="CMF (20)" 
            value={cmf.value} 
            signal={cmf.signal}
            contribution={cmf.contribution}
            icon={Waves}
          />
          <div className="mt-auto pt-2 flex justify-center">
            <TinyArc value={Math.max(0, Math.min(100, 50 + (obv.contribution + cmf.contribution) * 7))} tone={volumeFlowSentiment === 'bullish' ? 'emerald' : volumeFlowSentiment === 'bearish' ? 'red' : 'cyan'} />
          </div>
        </IndicatorCard>

        <IndicatorCard title="Volatility" icon={Waves} sentiment={volatilitySentiment}>
          <IndicatorRow 
            label="ATR %" 
            value={atr.percent}
            contribution={0}
            icon={Activity}
            format="percent"
          />
          <IndicatorRow 
            label="IV Change" 
            value={ivChange.value} 
            signal={ivChange.signal}
            contribution={ivChange.contribution}
            icon={Gauge}
            format="percent"
          />
          <MetricBlock tone={volatilitySentiment === 'bullish' ? 'emerald' : volatilitySentiment === 'bearish' ? 'red' : 'amber'}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">BB Squeeze:</span>
              <Badge variant={bollingerBands.squeeze ? "default" : "outline"} className="text-xs">
                {bollingerBands.squeeze ? "Active" : "None"}
              </Badge>
            </div>
          </MetricBlock>
          <div className="mt-auto pt-2 flex justify-center">
            <TinyArc value={Math.max(0, Math.min(100, (atr.percent / 4) * 100))} tone={volatilitySentiment === 'bullish' ? 'emerald' : volatilitySentiment === 'bearish' ? 'red' : 'cyan'} />
          </div>
        </IndicatorCard>

        <IndicatorCard title="Bollinger Bands" icon={Target} sentiment={bollingerSentiment}>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Upper</span>
              <span className="font-mono">{bollingerBands.upper.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Middle</span>
              <span className="font-mono">{bollingerBands.middle.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lower</span>
              <span className="font-mono">{bollingerBands.lower.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-border/50">
              <span className="text-muted-foreground">%B</span>
              <span className="font-mono">{bollingerBands.percentB.toFixed(1)}%</span>
            </div>
          </div>
          <div className="mt-auto pt-2 flex justify-center">
            <TinyArc value={Math.max(0, Math.min(100, bollingerBands.percentB))} tone={bollingerSentiment === 'bullish' ? 'emerald' : bollingerSentiment === 'bearish' ? 'red' : 'cyan'} />
          </div>
        </IndicatorCard>

        <IndicatorCard title="Keltner Channel" icon={Target} sentiment={keltnerSentiment}>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Upper</span>
              <span className="font-mono">{keltnerChannel.upper.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Middle</span>
              <span className="font-mono">{keltnerChannel.middle.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lower</span>
              <span className="font-mono">{keltnerChannel.lower.toFixed(2)}</span>
            </div>
            {keltnerChannel.breakout && (
              <div className="pt-1 border-t border-border/50">
                <Badge variant="outline" className={keltnerChannel.breakout === 'upper' ? 'text-emerald-400 border-emerald-500/30' : 'text-red-400 border-red-500/30'}>
                  {keltnerChannel.breakout} breakout
                </Badge>
              </div>
            )}
          </div>
          <div className="mt-auto pt-2 flex justify-center">
            <TinyArc value={keltnerChannel.breakout ? 82 : 48} tone={keltnerChannel.breakout === 'upper' ? 'emerald' : keltnerChannel.breakout === 'lower' ? 'red' : 'cyan'} />
          </div>
        </IndicatorCard>

        <IndicatorCard title="Orderflow" icon={Activity} sentiment={orderflowSentiment}>
          <IndicatorRow 
            label="Tick Imbalance" 
            value={orderflow.tickImbalance} 
            signal={orderflow.tickImbalance > 0 ? 'bullish' : orderflow.tickImbalance < 0 ? 'bearish' : 'neutral'}
            contribution={orderflow.contribution}
            icon={BarChart3}
          />
          <IndicatorRow 
            label="Volume Delta" 
            value={orderflow.volumeDelta} 
            signal={orderflow.volumeDelta > 0 ? 'bullish' : orderflow.volumeDelta < 0 ? 'bearish' : 'neutral'}
            contribution={orderflow.contribution}
            icon={Waves}
          />
          <div className="mt-auto pt-2 flex justify-center">
            <TinyArc value={Math.max(0, Math.min(100, 50 + orderflow.contribution * 8 + Math.abs(orderflow.tickImbalance) * 4))} tone={orderflowSentiment === 'bullish' ? 'emerald' : orderflowSentiment === 'bearish' ? 'red' : 'cyan'} />
          </div>
        </IndicatorCard>

        <IndicatorCard title="Market Breadth" icon={Activity} sentiment={breadthSentiment}>
          <IndicatorRow 
            label="Adv/Dec Ratio" 
            value={breadth.advanceDecline} 
            signal={breadth.advanceDecline > 0 ? 'bullish' : breadth.advanceDecline < 0 ? 'bearish' : 'neutral'}
            contribution={breadth.contribution}
            icon={TrendingUp}
          />
          <MetricBlock tone={breadthSentiment === 'bullish' ? 'emerald' : breadthSentiment === 'bearish' ? 'red' : 'amber'}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Breadth Composite</span>
              <span className="font-mono">{breadth.composite}</span>
            </div>
          </MetricBlock>
          <div className="mt-auto pt-2 flex justify-center">
            <TinyArc value={Math.max(0, Math.min(100, breadth.composite))} tone={breadthSentiment === 'bullish' ? 'emerald' : breadthSentiment === 'bearish' ? 'red' : 'cyan'} />
          </div>
        </IndicatorCard>
        </div>

        {contributors && contributors.length > 0 && (
          <div className="p-4 rounded-lg bg-muted/10 border border-cyan-400/25 space-y-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Top Contributors</div>
            <div className="flex flex-wrap gap-2">
              {contributors.slice(0, 8).map((contributor) => (
                <div 
                  key={contributor.name}
                  className={`px-2 py-1 rounded text-xs font-medium backdrop-blur-sm ${
                    contributor.value > 0 
                      ? 'bg-emerald-500/12 text-emerald-300 border border-emerald-500/35 shadow-[0_0_10px_rgba(16,185,129,0.15)]' 
                      : 'bg-red-500/12 text-red-300 border border-red-500/35 shadow-[0_0_10px_rgba(239,68,68,0.15)]'
                  }`}
                  data-testid={`badge-contributor-${contributor.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {contributor.name}: {contributor.value > 0 ? '+' : ''}{contributor.value.toFixed(1)}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
