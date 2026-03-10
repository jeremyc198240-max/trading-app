import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Shield,
  Zap,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Crosshair,
  BarChart3,
  Hash,
  Info,
  Layers,
} from "lucide-react";
import type { NormalizedPattern, PatternCategory, PatternLifecycle } from "@shared/schema";

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
  if (q >= 0.9) return { grade: "S", color: "text-amber-300" };
  if (q >= 0.75) return { grade: "A", color: "text-emerald-300" };
  if (q >= 0.6) return { grade: "B", color: "text-blue-300" };
  if (q >= 0.45) return { grade: "C", color: "text-purple-300" };
  return { grade: "D", color: "text-muted-foreground" };
}

function parseDescriptionMetadata(description: string): Record<string, string> {
  const metadata: Record<string, string> = {};
  const rSquaredMatch = description.match(/R[²2]\s*[=:]\s*([\d.]+)/i);
  if (rSquaredMatch) metadata["R²"] = rSquaredMatch[1];
  const necklineMatch = description.match(/neckline\s*(?:at|@|:)\s*\$?([\d.]+)/i);
  if (necklineMatch) metadata["Neckline"] = `$${necklineMatch[1]}`;
  const quadMatch = description.match(/quadratic\s*(?:coefficients?|coeff?)?\s*[=:]\s*\(([^)]+)\)/i);
  if (quadMatch) metadata["Quadratic Coefficients"] = quadMatch[1];
  const slopeMatch = description.match(/slope\s*[=:]\s*([-\d.]+)/i);
  if (slopeMatch) metadata["Slope"] = slopeMatch[1];
  const depthMatch = description.match(/depth\s*[=:]\s*([-\d.]+%?)/i);
  if (depthMatch) metadata["Depth"] = depthMatch[1];
  const widthMatch = description.match(/width\s*[=:]\s*(\d+)\s*(?:candles|bars)?/i);
  if (widthMatch) metadata["Width"] = `${widthMatch[1]} candles`;
  return metadata;
}

interface PatternDetailPanelProps {
  pattern: NormalizedPattern | null;
  onClose: () => void;
}

export function PatternDetailPanel({ pattern, onClose }: PatternDetailPanelProps) {
  if (!pattern) return null;

  const qg = qualityGrade(pattern.quality);
  const lc = lifecycleConfig[pattern.state];
  const LcIcon = lc.icon;
  const span = pattern.endIndex - pattern.startIndex;
  const parsedMeta = parseDescriptionMetadata(pattern.description);
  const hasParsedMeta = Object.keys(parsedMeta).length > 0;

  const hasRR = pattern.priceTarget != null && pattern.stopLoss != null;
  let rrRatio: number | null = null;
  if (hasRR) {
    const lastPrice = pattern.breakoutLevel ?? pattern.priceTarget!;
    const reward = Math.abs(pattern.priceTarget! - lastPrice);
    const risk = Math.abs(lastPrice - pattern.stopLoss!);
    rrRatio = risk > 0 ? reward / risk : null;
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-40 transition-opacity"
        onClick={onClose}
        data-testid="pattern-detail-backdrop"
      />

      <div
        className={cn(
          "fixed top-0 right-0 h-full w-96 z-50",
          "bg-background border-l border-border/50",
          "shadow-2xl shadow-black/50",
          "transform transition-transform duration-300 ease-out translate-x-0",
          "flex flex-col"
        )}
        data-testid="pattern-detail-panel"
      >
        <div className="flex-shrink-0 p-4 border-b border-border/50 bg-gradient-to-r from-purple-500/5 via-transparent to-cyan-500/5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h2
                className={cn(
                  "text-lg font-bold leading-tight truncate",
                  pattern.direction === "bullish" && "text-emerald-300",
                  pattern.direction === "bearish" && "text-red-300",
                  pattern.direction === "neutral" && "text-foreground"
                )}
                data-testid="text-pattern-name"
              >
                {pattern.name}
              </h2>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              data-testid="button-close-detail"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                pattern.direction === "bullish" && "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
                pattern.direction === "bearish" && "text-red-400 border-red-500/30 bg-red-500/10",
                pattern.direction === "neutral" && "text-purple-400 border-purple-500/30 bg-purple-500/10"
              )}
              data-testid="badge-direction"
            >
              {pattern.direction === "bullish" && <TrendingUp className="w-3 h-3 mr-1" />}
              {pattern.direction === "bearish" && <TrendingDown className="w-3 h-3 mr-1" />}
              {pattern.direction === "neutral" && <Minus className="w-3 h-3 mr-1" />}
              {pattern.direction}
            </Badge>

            <Badge
              variant="outline"
              className={cn("text-[10px]", categoryColors[pattern.category])}
              data-testid="badge-category"
            >
              {categoryLabels[pattern.category]}
            </Badge>

            <Badge
              variant="outline"
              className={cn("text-[10px]", lc.color)}
              data-testid="badge-lifecycle"
            >
              <LcIcon className="w-3 h-3 mr-1" />
              {lc.label}
            </Badge>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div data-testid="section-metrics">
            <div className="flex items-center gap-1.5 mb-2">
              <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">Metrics</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border border-border/30 p-2.5 text-center">
                <div className="text-lg font-mono font-bold text-foreground">{Math.round(pattern.confidence)}%</div>
                <div className="w-full h-1 rounded-full bg-muted mt-1">
                  <div
                    className="h-full rounded-full bg-purple-500"
                    style={{ width: `${Math.min(pattern.confidence, 100)}%` }}
                  />
                </div>
                <div className="text-[9px] text-muted-foreground uppercase mt-1">Confidence</div>
              </div>

              <div className="rounded-md border border-border/30 p-2.5 text-center">
                <div className={cn("text-lg font-mono font-bold", qg.color)}>{qg.grade}</div>
                <div className="text-[10px] font-mono text-muted-foreground mt-1">{Math.round(pattern.quality * 100)}</div>
                <div className="text-[9px] text-muted-foreground uppercase mt-0.5">Quality</div>
              </div>

              <div className="rounded-md border border-border/30 p-2.5 text-center">
                <div className="text-lg font-mono font-bold text-foreground">{span}</div>
                <div className="text-[9px] text-muted-foreground uppercase mt-1">Span</div>
                <div className="text-[9px] text-muted-foreground">candles</div>
              </div>
            </div>
          </div>

          <div data-testid="section-price-levels">
            <div className="flex items-center gap-1.5 mb-2">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">Price Levels</span>
            </div>
            <div className="space-y-1.5">
              {pattern.breakoutLevel != null && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-cyan-500/5 border border-cyan-500/20" data-testid="level-breakout">
                  <Zap className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  <span className="text-[11px] text-muted-foreground flex-1">Breakout</span>
                  <span className="text-sm font-mono font-bold text-cyan-400">${pattern.breakoutLevel.toFixed(2)}</span>
                </div>
              )}
              {pattern.invalidationLevel != null && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/5 border border-amber-500/20" data-testid="level-invalidation">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span className="text-[11px] text-muted-foreground flex-1">Invalidation</span>
                  <span className="text-sm font-mono font-bold text-amber-400">${pattern.invalidationLevel.toFixed(2)}</span>
                </div>
              )}
              {pattern.breakoutLevel == null && pattern.invalidationLevel == null && (
                <div className="text-[11px] text-muted-foreground py-2">No price levels detected</div>
              )}
            </div>
          </div>

          <div data-testid="section-targets-risk">
            <div className="flex items-center gap-1.5 mb-2">
              <Target className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Targets & Risk</span>
            </div>
            <div className="space-y-1.5">
              {pattern.priceTarget != null && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-emerald-500/5 border border-emerald-500/20" data-testid="level-price-target">
                  <Target className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span className="text-[11px] text-muted-foreground flex-1">Price Target</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">${pattern.priceTarget.toFixed(2)}</span>
                </div>
              )}
              {pattern.stopLoss != null && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-red-500/5 border border-red-500/20" data-testid="level-stop-loss">
                  <Shield className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  <span className="text-[11px] text-muted-foreground flex-1">Stop Loss</span>
                  <span className="text-sm font-mono font-bold text-red-400">${pattern.stopLoss.toFixed(2)}</span>
                </div>
              )}
              {rrRatio != null && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-purple-500/5 border border-purple-500/20" data-testid="level-rr-ratio">
                  <BarChart3 className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                  <span className="text-[11px] text-muted-foreground flex-1">Risk/Reward</span>
                  <span className={cn(
                    "text-sm font-mono font-bold",
                    rrRatio >= 2 ? "text-emerald-400" : rrRatio >= 1 ? "text-amber-400" : "text-red-400"
                  )}>
                    1:{rrRatio.toFixed(1)}
                  </span>
                </div>
              )}
              {pattern.priceTarget == null && pattern.stopLoss == null && (
                <div className="text-[11px] text-muted-foreground py-2">No target or stop data available</div>
              )}
            </div>
          </div>

          <div data-testid="section-description">
            <div className="flex items-center gap-1.5 mb-2">
              <Info className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">Description</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed" data-testid="text-description">
              {pattern.description}
            </p>
            {hasParsedMeta && (
              <div className="mt-2 space-y-1">
                {Object.entries(parsedMeta).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2 text-[10px]">
                    <span className="text-muted-foreground">{key}:</span>
                    <span className="font-mono font-semibold text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {pattern.howToTrade.length > 0 && (
            <div data-testid="section-how-to-trade">
              <div className="flex items-center gap-1.5 mb-2">
                <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">How to Trade</span>
              </div>
              <ol className="space-y-1.5">
                {pattern.howToTrade.map((step, i) => (
                  <li key={i} className="flex items-start gap-2" data-testid={`trade-step-${i}`}>
                    <span className="text-[10px] font-mono text-cyan-500/70 mt-0.5 flex-shrink-0 w-4 text-right">{i + 1}.</span>
                    <span className="text-[11px] text-muted-foreground leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div data-testid="section-technical-metadata">
            <div className="flex items-center gap-1.5 mb-2">
              <Hash className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Technical Metadata</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="flex items-center justify-between p-1.5 rounded border border-border/20">
                <span className="text-muted-foreground">Start Index</span>
                <span className="font-mono font-semibold text-foreground" data-testid="text-start-index">{pattern.startIndex}</span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded border border-border/20">
                <span className="text-muted-foreground">End Index</span>
                <span className="font-mono font-semibold text-foreground" data-testid="text-end-index">{pattern.endIndex}</span>
              </div>
              {hasParsedMeta && Object.entries(parsedMeta).map(([key, value]) => (
                <div key={`meta-${key}`} className="flex items-center justify-between p-1.5 rounded border border-border/20 col-span-2">
                  <span className="text-muted-foreground">{key}</span>
                  <span className="font-mono font-semibold text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
