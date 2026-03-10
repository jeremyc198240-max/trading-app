import { cn } from "@/lib/utils";

interface ConfidenceMeterProps {
  label: string;
  value: number;
  maxValue?: number;
  variant?: "default" | "bullish" | "bearish" | "neutral";
}

export function ConfidenceMeter({
  label,
  value,
  maxValue = 100,
  variant = "default",
}: ConfidenceMeterProps) {
  const percentage = Math.min(100, Math.max(0, (value / maxValue) * 100));

  const getBarColor = () => {
    if (variant === "bullish") return "bg-bullish";
    if (variant === "bearish") return "bg-bearish";
    if (variant === "neutral") return "bg-neutral-signal";

    if (percentage >= 70) return "bg-bullish";
    if (percentage >= 40) return "bg-grade-c";
    return "bg-bearish";
  };

  return (
    <div className="space-y-2" data-testid={`meter-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-sm font-mono font-medium">
          {Math.round(value)}
          <span className="text-muted-foreground">/{maxValue}</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out animate-fill-progress",
            getBarColor()
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function ConfidenceMetersGrid({
  trendConfidence,
  volumeConfidence,
  patternConfidence,
  marketConfidence,
}: {
  trendConfidence: number;
  volumeConfidence: number;
  patternConfidence: number;
  marketConfidence: number;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="grid-confidence-meters">
      <ConfidenceMeter label="Trend" value={trendConfidence} />
      <ConfidenceMeter label="Volume" value={volumeConfidence} />
      <ConfidenceMeter label="Pattern" value={patternConfidence} />
      <ConfidenceMeter label="Market" value={marketConfidence} />
    </div>
  );
}
