import { useState } from "react";
import { Search, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TickerInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isLoading?: boolean;
}

const popularTickers = ["SPY", "QQQ", "AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "META"];

export function TickerInput({
  value,
  onChange,
  onSubmit,
  isLoading,
}: TickerInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value.trim().toUpperCase());
    }
  };

  const handleQuickSelect = (ticker: string) => {
    onChange(ticker);
    onSubmit(ticker);
  };

  return (
    <div className="space-y-3 relative z-[9999]">
      <form onSubmit={handleSubmit} className="flex gap-2 isolate">
        <div className={cn(
          "relative flex-1 rounded-md transition-all duration-300",
          isFocused && "ring-2 ring-cyan-500/50 shadow-lg shadow-cyan-500/20"
        )}>
          <div className={cn(
            "absolute inset-0 rounded-md bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 opacity-0 transition-opacity duration-300 pointer-events-none",
            isFocused && "opacity-100"
          )} />
          <Search className={cn(
            "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-200 pointer-events-none z-10",
            isFocused ? "text-cyan-400" : "text-muted-foreground"
          )} />
          <input
            type="text"
            placeholder="Search ticker..."
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            onFocus={(e) => {
              e.stopPropagation();
              setIsFocused(true);
            }}
            onBlur={(e) => {
              e.stopPropagation();
              setTimeout(() => setIsFocused(false), 200);
            }}
            className={cn(
              "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              "pl-9 font-mono uppercase bg-card/80 border-border/50 transition-all duration-200 relative z-20",
              isFocused && "border-cyan-500/50 bg-card"
            )}
            data-testid="input-ticker"
            autoFocus
          />
        </div>
        <Button
          type="submit"
          disabled={!value.trim() || isLoading}
          className={cn(
            "bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold shadow-lg shadow-cyan-500/25 border-0",
            isLoading && "animate-pulse"
          )}
          data-testid="button-analyze"
        >
          <Zap className="w-4 h-4 mr-1.5" />
          {isLoading ? "Scanning..." : "Analyze"}
        </Button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {popularTickers.map((ticker) => (
          <Button
            key={ticker}
            variant="ghost"
            size="sm"
            onClick={() => handleQuickSelect(ticker)}
            className={cn(
              "font-mono text-xs px-2.5 h-7 rounded-md",
              "bg-gradient-to-br from-muted/50 to-muted/30 border border-border/50",
              "hover:from-cyan-500/20 hover:to-blue-500/20 hover:border-cyan-500/30 hover:text-cyan-400",
              "transition-all duration-200"
            )}
            data-testid={`button-ticker-${ticker.toLowerCase()}`}
          >
            {ticker}
          </Button>
        ))}
      </div>
    </div>
  );
}
