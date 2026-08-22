import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Activity, AlertCircle, CheckCircle2, BarChart3 } from "lucide-react";

interface EngineIntakeEntry {
  timestamp: string;
  unixMs: number;
  intervalMinutes: number;
  isMarketOpen: boolean;
  summary: {
    totalSymbolsScanned: number;
    signalsCreated: number;
    signalsByType: Record<string, number>;
    signalsByDirection: Record<string, number>;
    avgBreakoutScore: number;
    avgEdgeScore: number;
    avgConfidence: number;
  };
  signals: Array<{
    symbol: string;
    timeframe: string;
    signalType: string | null;
    direction: "bullish" | "bearish" | "neutral";
    breakoutScore?: number;
    edgeScore?: number;
    confidence?: number;
    triggers: string[];
    indicators: {
      rsi?: number;
      adx?: number;
      momentum?: number;
      volumeSpike?: number;
      bbPercentB?: number;
      stochasticK?: number;
    };
  }>;
  bySymbol: Record<string, {
    scanned: boolean;
    signalsCreated: number;
    signalTypes: string[];
    highestScore: number;
    avgConfidence: number;
  }>;
  topTriggers: Array<{
    reason: string;
    frequency: number;
    avgScore: number;
  }>;
  quality: {
    readinessScore: number;
    healthScore: string;
    volatilityRegime: string;
    marketCondition: string;
  };
}

export function EngineTuningPanel() {
  const [expandedTriggers, setExpandedTriggers] = useState(false);

  const { data: intakeData, isLoading } = useQuery<{ latest: EngineIntakeEntry | null }>({
    queryKey: ["/api/intake/latest"],
    refetchInterval: 30000,
    staleTime: 5000,
    refetchOnWindowFocus: false,
  });

  const latest = intakeData?.latest;

  // Calculate trend indicators
  const signalHealth = useMemo(() => {
    if (!latest) return null;

    const { signalsCreated, totalSymbolsScanned, avgConfidence } = latest.summary;
    const signalRate = totalSymbolsScanned > 0 ? signalsCreated / totalSymbolsScanned : 0;

    if (signalsCreated === 0) return "idle";
    if (avgConfidence < 60) return "warning";
    if (signalRate > 0.25) return "active";
    return "healthy";
  }, [latest]);

  if (isLoading || !latest) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Engine Tuning Panel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading engine data...</div>
        </CardContent>
      </Card>
    );
  }

  const timeString = new Date(latest.timestamp).toLocaleTimeString();
  const { summary, quality, topTriggers, signals, bySymbol } = latest;

  const healthColor = quality.healthScore === "A" ? "text-green-500" : 
                      quality.healthScore === "B" ? "text-yellow-500" : 
                      quality.healthScore === "C" ? "text-orange-500" : "text-red-500";

  const readinessColor = quality.readinessScore > 80 ? "bg-green-500/20" :
                         quality.readinessScore > 60 ? "bg-yellow-500/20" :
                         quality.readinessScore > 40 ? "bg-orange-500/20" : "bg-red-500/20";

  const signalHealthColor = signalHealth === "healthy" ? "text-green-500" :
                           signalHealth === "active" ? "text-blue-500" :
                           signalHealth === "warning" ? "text-yellow-500" : "text-gray-500";

  return (
    <div className="space-y-3">
      {/* Main Stats Card */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              <CardTitle className="text-lg">Engine Tuning (10m)</CardTitle>
            </div>
            <Badge variant="outline" className="text-xs">
              {timeString}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Signal Summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-xs text-muted-foreground font-medium">Signals</div>
              <div className={`text-2xl font-bold ${signalHealthColor}`}>
                {summary.signalsCreated}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {summary.totalSymbolsScanned} scanned
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-xs text-muted-foreground font-medium">Confidence</div>
              <div className="text-2xl font-bold">
                {summary.avgConfidence.toFixed(0)}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">avg</div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-xs text-muted-foreground font-medium">Edge Score</div>
              <div className="text-2xl font-bold">
                {summary.avgEdgeScore.toFixed(1)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">avg</div>
            </div>

            <div className={`rounded-lg p-3 ${readinessColor}`}>
              <div className="text-xs text-muted-foreground font-medium">Readiness</div>
              <div className="text-2xl font-bold">
                {quality.readinessScore.toFixed(0)}%
              </div>
              <div className={`text-xs font-semibold ${healthColor} mt-1`}>
                Grade {quality.healthScore}
              </div>
            </div>
          </div>

          {/* Signal Types Breakdown */}
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="text-xs font-semibold text-muted-foreground mb-2">Signal Mix</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(summary.signalsByType)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <Badge key={type} variant="secondary" className="text-xs">
                    {type}: {count}
                  </Badge>
                ))}
            </div>

            {/* Direction Split */}
            <div className="mt-2 pt-2 border-t border-border/50">
              <div className="flex gap-2 text-xs">
                {Object.entries(summary.signalsByDirection).map(([dir, count]) => (
                  <div key={dir} className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${
                      dir === "bullish" ? "bg-green-500" :
                      dir === "bearish" ? "bg-red-500" : "bg-gray-500"
                    }`} />
                    <span>{dir}: {count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Triggers */}
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
              <BarChart3 className="w-3 h-3" />
              Top Triggers
            </div>
            <div className="space-y-1">
              {topTriggers.slice(0, expandedTriggers ? topTriggers.length : 3).map((trigger, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div className="flex-1 truncate">
                    <span className="text-muted-foreground">
                      {trigger.reason}
                    </span>
                  </div>
                  <div className="flex gap-2 ml-2">
                    <Badge variant="outline" className="text-xs px-1.5 py-0">
                      {trigger.frequency}x
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {trigger.avgScore.toFixed(0)}
                    </span>
                  </div>
                </div>
              ))}
              {topTriggers.length > 3 && (
                <button
                  onClick={() => setExpandedTriggers(!expandedTriggers)}
                  className="text-xs text-blue-500 hover:underline mt-1"
                >
                  {expandedTriggers ? "Show less" : `+${topTriggers.length - 3} more`}
                </button>
              )}
            </div>
          </div>

          {/* Quality Indicators */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted/30 rounded-lg p-2">
              <div className="text-xs text-muted-foreground mb-1">Market Open</div>
              <div className="flex items-center gap-1">
                {latest.isMarketOpen ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-xs font-semibold">Yes</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-gray-500" />
                    <span className="text-xs">Closed</span>
                  </>
                )}
              </div>
            </div>
            <div className="bg-muted/30 rounded-lg p-2">
              <div className="text-xs text-muted-foreground mb-1">Symbols Scanned</div>
              <div className="text-sm font-semibold">{summary.totalSymbolsScanned}</div>
            </div>
          </div>

          {/* Active Signals List (if any) */}
          {signals.length > 0 && (
            <div className="bg-muted/30 rounded-lg p-3">
              <div className="text-xs font-semibold text-muted-foreground mb-2">Recent Signals</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {signals.slice(0, 5).map((signal, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs p-1 bg-muted/30 rounded">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{signal.symbol}</span>
                      <Badge 
                        variant="outline" 
                        className={`text-xs px-1.5 py-0 ${
                          signal.direction === "bullish" ? "border-green-500/50 text-green-600" :
                          signal.direction === "bearish" ? "border-red-500/50 text-red-600" :
                          "border-gray-500/50"
                        }`}
                      >
                        {signal.signalType}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-muted-foreground" />
                      <span className="font-semibold">{signal.edgeScore?.toFixed(0)}</span>
                    </div>
                  </div>
                ))}
                {signals.length > 5 && (
                  <div className="text-xs text-muted-foreground text-center pt-1">
                    +{signals.length - 5} more
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Symbols Card */}
      {Object.keys(bySymbol).length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Top Generators</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(bySymbol)
                .filter(([, data]) => (data as any).signalsCreated > 0)
                .sort(([, a], [, b]) => ((b as any).signalsCreated - (a as any).signalsCreated))
                .slice(0, 4)
                .map(([symbol, data]) => (
                  <div key={symbol} className="bg-muted/50 rounded-lg p-2">
                    <div className="font-semibold text-sm">{symbol}</div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{(data as any).signalsCreated} signals</span>
                      <span>{(data as any).avgConfidence.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
