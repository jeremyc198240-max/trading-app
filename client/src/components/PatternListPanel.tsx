import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Layers,
  Target,
  Shield,
  ChevronDown,
  ChevronUp,
  Zap,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Crosshair,
  ArrowUpRight,
  ArrowDownRight,
  Pause,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NormalizedPattern, FusionPatternSignal, PatternCategory, PatternLifecycle } from "@shared/schema";
import { PATTERN_REGISTRY } from "@shared/patternRegistry";

type UICategory = "smc" | "volatility" | "classical" | "candlestick";

const uiCategoryMap: Record<PatternCategory, UICategory> = {
  liquidity: "smc",
  structure: "smc",
  volatility: "volatility",
  classical: "classical",
  reversal: "classical",
  breakout: "classical",
  continuation: "classical",
  candlestick: "candlestick",
  gap: "candlestick",
};

const uiCategoryLabels: Record<UICategory, string> = {
  smc: "SMC",
  volatility: "Volatility",
  classical: "Classical",
  candlestick: "Candlestick",
};

const uiCategoryColors: Record<UICategory, string> = {
  smc: "text-cyan-400",
  volatility: "text-rose-400",
  classical: "text-blue-400",
  candlestick: "text-amber-400",
};

const uiCategoryOrder: UICategory[] = ["smc", "volatility", "classical", "candlestick"];

const categoryLabels: Record<PatternCategory, string> = {
  candlestick: "Candlestick",
  classical: "Classical",
  continuation: "Continuation",
  reversal: "Reversal",
  breakout: "Breakout",
  structure: "Structure",
  volatility: "Volatility",
  gap: "Gap",
  liquidity: "Liquidity",
};

const categoryColors: Record<PatternCategory, string> = {
  candlestick: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  classical: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  continuation: "text-teal-400 border-teal-500/30 bg-teal-500/10",
  reversal: "text-purple-400 border-purple-500/30 bg-purple-500/10",
  breakout: "text-orange-400 border-orange-500/30 bg-orange-500/10",
  structure: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
  volatility: "text-rose-400 border-rose-500/30 bg-rose-500/10",
  gap: "text-indigo-400 border-indigo-500/30 bg-indigo-500/10",
  liquidity: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
};

const lifecycleConfig: Record<PatternLifecycle, { label: string; icon: typeof CheckCircle; color: string }> = {
  forming: { label: "Forming", icon: Clock, color: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  valid: { label: "Valid", icon: CheckCircle, color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  breaking: { label: "Breaking", icon: Zap, color: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10" },
  failed: { label: "Failed", icon: XCircle, color: "text-red-400 border-red-500/30 bg-red-500/10" },
  expired: { label: "Expired", icon: AlertTriangle, color: "text-muted-foreground border-border bg-muted/30" },
};

function qualityGrade(q: number): { grade: string; color: string } {
  if (q >= 0.9) return { grade: "S", color: "text-amber-300 border-amber-400/40 bg-amber-500/15" };
  if (q >= 0.75) return { grade: "A", color: "text-emerald-300 border-emerald-400/40 bg-emerald-500/15" };
  if (q >= 0.6) return { grade: "B", color: "text-blue-300 border-blue-400/40 bg-blue-500/15" };
  if (q >= 0.45) return { grade: "C", color: "text-purple-300 border-purple-400/40 bg-purple-500/15" };
  return { grade: "D", color: "text-muted-foreground border-border bg-muted/30" };
}

function PatternRow({
  pattern,
  index,
  isSelected,
  onSelect,
}: {
  pattern: NormalizedPattern;
  index: number;
  isSelected: boolean;
  onSelect?: (pattern: NormalizedPattern) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const qg = qualityGrade(pattern.quality);
  const lc = lifecycleConfig[pattern.state];
  const LcIcon = lc.icon;

  const handleClick = () => {
    setExpanded(!expanded);
    onSelect?.(pattern);
  };

  return (
    <div
      className={cn(
        "border rounded-md transition-all duration-150 bg-slate-950/45 backdrop-blur-sm",
        isSelected
          ? "border-cyan-300/70 bg-cyan-500/12 shadow-[0_0_16px_rgba(34,211,238,0.24)]"
          : pattern.direction === "bullish"
            ? "border-emerald-400/40 hover:border-emerald-300/60"
            : pattern.direction === "bearish"
              ? "border-red-400/40 hover:border-red-300/60"
              : "border-cyan-500/25 hover:border-cyan-400/45"
      )}
      data-testid={`pattern-row-${index}`}
    >
      <button
        onClick={handleClick}
        className="w-full flex items-center gap-2 p-2.5 text-left rounded-md hover:bg-cyan-500/5"
        data-testid={`button-expand-pattern-${index}`}
      >
        <div className="flex-shrink-0">
          {pattern.direction === "bullish" && <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
          {pattern.direction === "bearish" && <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
          {pattern.direction === "neutral" && <Minus className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>

        <span className={cn(
          "text-xs font-semibold truncate flex-1",
          pattern.direction === "bullish" && "text-emerald-300",
          pattern.direction === "bearish" && "text-red-300",
          pattern.direction === "neutral" && "text-foreground"
        )}>
          {pattern.name}
        </span>

        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-5", categoryColors[pattern.category])}>
          {categoryLabels[pattern.category]}
        </Badge>

        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-5", lc.color)}>
          <LcIcon className="w-2.5 h-2.5 mr-0.5" />
          {lc.label}
        </Badge>

        <Badge variant="outline" className={cn("text-[9px] font-mono px-1.5 py-0 h-5", qg.color)}>
          {qg.grade}
        </Badge>

        <span className="text-[10px] font-mono text-cyan-100/85 w-8 text-right">
          {Math.round(pattern.confidence)}%
        </span>

        {expanded ? (
          <ChevronUp className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-cyan-500/20">
          <p className="text-[11px] text-cyan-100/70 leading-relaxed pt-2">
            {pattern.description}
          </p>

          <div className="grid grid-cols-2 gap-2">
            {pattern.priceTarget != null && (
              <div className="flex items-center gap-1.5 p-1.5 rounded bg-emerald-500/5 border border-emerald-500/20">
                <Target className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] text-cyan-100/70">Target</span>
                <span className="text-[10px] font-mono font-bold text-emerald-400 ml-auto">${pattern.priceTarget.toFixed(2)}</span>
              </div>
            )}
            {pattern.stopLoss != null && (
              <div className="flex items-center gap-1.5 p-1.5 rounded bg-red-500/5 border border-red-500/20">
                <Shield className="w-3 h-3 text-red-400" />
                <span className="text-[10px] text-cyan-100/70">Stop</span>
                <span className="text-[10px] font-mono font-bold text-red-400 ml-auto">${pattern.stopLoss.toFixed(2)}</span>
              </div>
            )}
            {pattern.breakoutLevel != null && (
              <div className="flex items-center gap-1.5 p-1.5 rounded bg-cyan-500/5 border border-cyan-500/20">
                <Zap className="w-3 h-3 text-cyan-400" />
                <span className="text-[10px] text-cyan-100/70">Breakout</span>
                <span className="text-[10px] font-mono font-bold text-cyan-400 ml-auto">${pattern.breakoutLevel.toFixed(2)}</span>
              </div>
            )}
            {pattern.invalidationLevel != null && (
              <div className="flex items-center gap-1.5 p-1.5 rounded bg-amber-500/5 border border-amber-500/20">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] text-cyan-100/70">Invalid</span>
                <span className="text-[10px] font-mono font-bold text-amber-400 ml-auto">${pattern.invalidationLevel.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 mb-1">
            <Crosshair className="w-3 h-3 text-cyan-400" />
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">How to Trade</span>
          </div>
          <ul className="space-y-1">
            {pattern.howToTrade.map((step, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-[9px] font-mono text-cyan-500/60 mt-0.5 flex-shrink-0">{i + 1}.</span>
                <span className="text-[10px] text-cyan-100/70 leading-relaxed">{step}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3 pt-1 border-t border-cyan-500/20">
            <div className="text-center">
              <div className="text-[10px] font-mono font-bold text-cyan-100">{Math.round(pattern.quality * 100)}</div>
              <div className="text-[8px] text-cyan-100/60 uppercase">Quality</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] font-mono font-bold text-cyan-100">{Math.round(pattern.confidence)}%</div>
              <div className="text-[8px] text-cyan-100/60 uppercase">Confidence</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] font-mono font-bold text-cyan-100">{pattern.endIndex - pattern.startIndex}</div>
              <div className="text-[8px] text-cyan-100/60 uppercase">Span</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryGroup({
  uiCategory,
  patterns,
  selectedPatternName,
  onSelectPattern,
}: {
  uiCategory: UICategory;
  patterns: NormalizedPattern[];
  selectedPatternName?: string | null;
  onSelectPattern?: (pattern: NormalizedPattern) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div data-testid={`pattern-group-${uiCategory}`}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 py-1.5 px-1 text-left hover-elevate rounded-md"
        data-testid={`button-toggle-group-${uiCategory}`}
      >
        {collapsed ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        )}
        <span className={cn("text-[11px] font-bold uppercase tracking-wider", uiCategoryColors[uiCategory])}>
          {uiCategoryLabels[uiCategory]}
        </span>
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-5">
          {patterns.length}
        </Badge>
      </button>
      {!collapsed && (
        <div className="space-y-1.5 mt-1">
          {patterns.map((p, i) => (
            <PatternRow
              key={`${p.name}-${i}`}
              pattern={p}
              index={i}
              isSelected={selectedPatternName === p.name}
              onSelect={onSelectPattern}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FusionSignalCard({ signal }: { signal: FusionPatternSignal }) {
  const dirConfig = {
    CALL: { icon: ArrowUpRight, color: "text-emerald-300", bg: "from-emerald-500/14 via-emerald-500/8 to-emerald-500/5", border: "border-emerald-400/40" },
    PUT: { icon: ArrowDownRight, color: "text-red-300", bg: "from-red-500/14 via-red-500/8 to-red-500/5", border: "border-red-400/40" },
    WAIT: { icon: Pause, color: "text-amber-300", bg: "from-amber-500/14 via-amber-500/8 to-amber-500/5", border: "border-amber-400/40" },
  };
  const cfg = dirConfig[signal.direction];
  const DirIcon = cfg.icon;

  return (
    <div className={cn("rounded-md border p-3 bg-gradient-to-br shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]", cfg.bg, cfg.border)} data-testid="pattern-fusion-signal">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("p-1.5 rounded-md border", cfg.border, cfg.color)}>
          <DirIcon className="w-4 h-4" />
        </div>
        <div>
          <div className={cn("text-sm font-black tracking-wider", cfg.color)}>
            {signal.direction}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {signal.patternCount} pattern{signal.patternCount !== 1 ? "s" : ""} detected
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className={cn("text-lg font-mono font-black", cfg.color)}>
            {Math.round(signal.confidence)}%
          </div>
          <div className="text-[9px] text-muted-foreground uppercase">Confidence</div>
        </div>
      </div>

      {signal.dominantPattern && (
        <div className="text-[10px] text-muted-foreground mb-2">
          Dominant: <span className="font-semibold text-foreground">{signal.dominantPattern}</span>
        </div>
      )}

      {signal.reasons.length > 0 && (
        <div className="space-y-1 mb-2">
          {signal.reasons.slice(0, 3).map((r, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <CheckCircle className={cn("w-2.5 h-2.5 mt-0.5 flex-shrink-0", cfg.color)} />
              <span className="text-[10px] text-muted-foreground">{r}</span>
            </div>
          ))}
        </div>
      )}

      {signal.howToTrade.length > 0 && (
        <div className="border-t border-border/30 pt-2 mt-2 space-y-1">
          <div className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider mb-1">Trade Plan</div>
          {signal.howToTrade.slice(0, 3).map((step, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-[9px] font-mono text-cyan-500/60 mt-0.5">{i + 1}.</span>
              <span className="text-[10px] text-muted-foreground">{step}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PatternListPanel({
  normalizedPatterns,
  patternSignal,
  onSelectPattern,
  selectedPatternName,
}: {
  normalizedPatterns?: NormalizedPattern[];
  patternSignal?: FusionPatternSignal;
  onSelectPattern?: (pattern: NormalizedPattern) => void;
  selectedPatternName?: string | null;
}) {
  const [categoryFilter, setCategoryFilter] = useState<PatternCategory | "all">("all");
  const [stateFilter, setStateFilter] = useState<PatternLifecycle | "all">("all");
  const setupUniverseCount = useMemo(() => Object.keys(PATTERN_REGISTRY).length, []);

  const allPatterns = useMemo(() => {
    return normalizedPatterns ?? [];
  }, [normalizedPatterns]);

  const activePatterns = useMemo(
    () => allPatterns.filter((p) => p.state !== 'failed' && p.state !== 'expired'),
    [allPatterns]
  );

  const filtered = allPatterns.filter((p) => {
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (stateFilter !== "all" && p.state !== stateFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => b.quality - a.quality);

  const grouped = uiCategoryOrder
    .map((cat) => ({
      uiCategory: cat,
      patterns: sorted.filter((p) => uiCategoryMap[p.category] === cat),
    }))
    .filter((g) => g.patterns.length > 0);

  const categories = Array.from(new Set(allPatterns.map((p) => p.category)));
  const states = Array.from(new Set(allPatterns.map((p) => p.state)));

  const bullCount = allPatterns.filter((p) => p.direction === "bullish").length;
  const bearCount = allPatterns.filter((p) => p.direction === "bearish").length;

  return (
    <Card className="overflow-visible relative border-cyan-500/30 bg-gradient-to-b from-[#040816]/95 via-[#060d1e]/90 to-[#070f24]/85 shadow-[0_0_34px_rgba(34,211,238,0.14)]" data-testid="pattern-list-panel">
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(34,211,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.14)_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="h-0.5 bg-gradient-to-r from-cyan-400/0 via-cyan-300/90 to-violet-400/0" />
      <CardHeader className="relative py-3 px-4 border-b border-cyan-500/30 bg-gradient-to-r from-cyan-500/12 via-transparent to-violet-500/12">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-purple-400 flex items-center gap-2 flex-wrap">
          <Layers className="w-4 h-4" />
          All Patterns
          <Badge variant="outline" className="text-[9px] ml-1 border-cyan-400/35 bg-cyan-500/8 text-cyan-100">
            {allPatterns.length}
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] border-cyan-300/50 text-cyan-100 bg-cyan-500/14 shadow-[0_0_10px_rgba(34,211,238,0.18)]">
                  <Zap className="w-2.5 h-2.5 mr-0.5" />
                  ENGINE ON
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Pattern engine status</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] border-cyan-400/35 text-cyan-200 bg-cyan-500/10">
                  A:{activePatterns.length}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Active patterns (not failed/expired)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] border-violet-400/35 text-violet-200 bg-violet-500/10">
                  S:{setupUniverseCount}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Loaded setup library size</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                  <TrendingUp className="w-2.5 h-2.5 mr-0.5" />
                  {bullCount}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Bullish patterns</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] border-red-500/30 text-red-400 bg-red-500/10">
                  <TrendingDown className="w-2.5 h-2.5 mr-0.5" />
                  {bearCount}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Bearish patterns</TooltipContent>
            </Tooltip>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="relative p-3 space-y-3">
        {patternSignal && <FusionSignalCard signal={patternSignal} />}

        <div className="flex items-center gap-1.5 flex-wrap rounded-md border border-cyan-500/20 bg-cyan-500/5 p-1.5">
          <Filter className="w-3 h-3 text-muted-foreground" />
          <Button
            variant={categoryFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setCategoryFilter("all")}
            className="h-6 text-[10px] px-2 border border-transparent data-[state=active]:border-cyan-400/30"
            data-testid="button-filter-all-categories"
          >
            All
          </Button>
          {categories.map((cat: PatternCategory) => (
            <Button
              key={cat}
              variant={categoryFilter === cat ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setCategoryFilter(cat)}
              className="h-6 text-[10px] px-2"
              data-testid={`button-filter-category-${cat}`}
            >
              {categoryLabels[cat]}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap rounded-md border border-cyan-500/20 bg-cyan-500/5 p-1.5">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <Button
            variant={stateFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setStateFilter("all")}
            className="h-6 text-[10px] px-2"
            data-testid="button-filter-all-states"
          >
            All States
          </Button>
          {states.map((st: PatternLifecycle) => {
            const cfg = lifecycleConfig[st];
            return (
              <Button
                key={st}
                variant={stateFilter === st ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStateFilter(st)}
                className="h-6 text-[10px] px-2"
                data-testid={`button-filter-state-${st}`}
              >
                {cfg.label}
              </Button>
            );
          })}
        </div>

        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
          {grouped.map((group) => (
            <CategoryGroup
              key={group.uiCategory}
              uiCategory={group.uiCategory}
              patterns={group.patterns}
              selectedPatternName={selectedPatternName}
              onSelectPattern={onSelectPattern}
            />
          ))}
          {allPatterns.length === 0 && (
            <div className="text-center py-5 text-[11px] text-cyan-200/80 border border-cyan-500/25 rounded-lg bg-cyan-500/5" data-testid="text-no-live-patterns">
              Pattern engine active • no patterns detected right now
            </div>
          )}
          {allPatterns.length > 0 && sorted.length === 0 && (
            <div className="text-center py-4 text-[11px] text-muted-foreground" data-testid="text-no-patterns">
              No patterns match current filters
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
