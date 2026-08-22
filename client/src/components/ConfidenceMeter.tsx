import { cn } from "@/lib/utils";

interface ConfidenceMeterProps {
  label: string;
  value: number;
  maxValue?: number;
  variant?: "default" | "bullish" | "bearish" | "neutral";
  history?: number[];
}

export function ConfidenceMeter({
  label,
  value,
  maxValue = 100,
  variant = "default",
  history = [],
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
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-sm font-mono font-medium">{Math.round(value)}<span className="text-muted-foreground">/{maxValue}</span></span>
      </div>

      <div className="flex items-center gap-3">
        <svg width="72" height="40" viewBox="0 0 72 40" className="shrink-0">
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" x2="100%">
              <stop offset="0%" stopColor="#ff6b6b" />
              <stop offset="50%" stopColor="#ffd36b" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
          </defs>
          <g transform="translate(36,36)">
            <path d="M-28 0 A28 28 0 0 1 28 0" fill="none" stroke="#1f2937" strokeWidth="6" strokeLinecap="round" />
            <path
              d="M-28 0 A28 28 0 0 1 28 0"
              fill="none"
              stroke="url(#gaugeGrad)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${(percentage / 100) * 176} 176`}
              transform="rotate(-180) translate(-56,0)"
            />
            <text x="0" y="-6" textAnchor="middle" fontSize="10" fill="currentColor" className="font-mono">{Math.round(percentage)}%</text>
          </g>
        </svg>

        <div className="flex-1">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-out animate-fill-progress",
                getBarColor()
              )}
              style={{ width: `${percentage}%` }}
            />
          </div>
          {history && history.length > 1 && (
            <svg className="w-full h-6 mt-2" viewBox="0 0 100 20" preserveAspectRatio="none">
              <polyline
                fill="none"
                stroke="#60a5fa"
                strokeWidth="1.5"
                points={history.map((v, i) => `${(i / (history.length - 1)) * 100},${20 - (Math.min(100, Math.max(0, v)) / 100) * 20}`).join(" ")}
              />
            </svg>
          )}
        </div>
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
