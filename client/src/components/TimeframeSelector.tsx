import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";
import type { Timeframe } from "@shared/schema";

interface TimeframeSelectorProps {
  value: Timeframe;
  onChange: (value: Timeframe) => void;
}

const timeframes: { value: Timeframe; label: string }[] = [
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "30m", label: "30m" },
  { value: "1h", label: "1h" },
  { value: "4h", label: "4h" },
  { value: "1d", label: "1D" },
];

export function TimeframeSelector({ value, onChange }: TimeframeSelectorProps) {
  return (
    <div
      className="relative inline-flex items-center gap-0.5 p-1 rounded-lg bg-gradient-to-br from-muted/60 to-muted/40 border border-border/50 shadow-inner"
      data-testid="selector-timeframe"
    >
      <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-amber-500/5 via-transparent to-orange-500/5" />
      <div className="flex items-center gap-1.5 pr-2 border-r border-border/50 mr-1">
        <Clock className="w-3.5 h-3.5 text-amber-400" />
      </div>
      {timeframes.map((tf) => (
        <Button
          key={tf.value}
          variant="ghost"
          size="sm"
          onClick={() => onChange(tf.value)}
          className={cn(
            "relative font-mono text-xs px-2.5 h-7 rounded-md transition-all duration-200",
            value === tf.value 
              ? "bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-400 shadow-sm border border-amber-500/30 font-bold" 
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
          data-testid={`button-timeframe-${tf.value}`}
        >
          {value === tf.value && (
            <div className="absolute inset-0 rounded-md bg-amber-500/10 animate-pulse" />
          )}
          <span className="relative">{tf.label}</span>
        </Button>
      ))}
    </div>
  );
}
