import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, Clock, Activity, Target } from "lucide-react";
import { useState } from "react";
import type { EngineIntakeEntry } from "@shared/schema";

export function SignalLoggingPanel() {
  const [timeRange, setTimeRange] = useState<"latest" | "recent">("latest");

  const { data: intakeData, isLoading, error, refetch } = useQuery<{
    success: boolean;
    latest?: EngineIntakeEntry;
    entries?: EngineIntakeEntry[];
    timestamp: number;
  }>({
    queryKey: [
      timeRange === "latest" ? "/api/intake/latest" : "/api/intake/recent?limit=12",
    ],
    refetchInterval: 60000, // Refresh every minute
    staleTime: 50000,
    retry: false,
  });

  const entries = timeRange === "latest" && intakeData?.latest
    ? [intakeData.latest]
    : intakeData?.entries || [];

  if (error)
    return (
      <Card className="glass-panel border-red-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-red-400">Signal Logging Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-red-400/60">Failed to load signal logs</p>
          <p className="text-xs text-red-400/40 mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
        </CardContent>
      </Card>
    );

  const latestEntry = entries[0];

  return (
    <div className="space-y-4">
      {/* Header with controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg hud-chip">
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <h2 className="font-semibold text-sm text-cyan-300">
            10-Minute Signal Log
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTimeRange("latest")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              timeRange === "latest"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800/50"
            }`}
          >
            Latest
          </button>
          <button
            onClick={() => setTimeRange("recent")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              timeRange === "recent"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800/50"
            }`}
          >
            Recent (12)
          </button>
        </div>
      </div>

      {/* Latest Entry Summary */}
      {latestEntry && (
        <Card className="glass-panel border-cyan-500/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>
                  {new Date(latestEntry.timestamp).toLocaleTimeString()}
                </span>
                <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-400 border-cyan-500/30 ml-2">
                  {latestEntry.intervalMinutes}m window
                </Badge>
              </CardTitle>
              <Badge
                variant="outline"
                className={`text-xs ${
                  latestEntry.isMarketOpen
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-slate-500/10 text-slate-400 border-slate-500/30"
                }`}
              >
                {latestEntry.isMarketOpen ? "📈 MARKET OPEN" : "🔒 MARKET CLOSED"}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Summary Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                <div className="text-xs text-zinc-400 mb-1">Symbols Scanned</div>
                <div className="text-lg font-bold text-cyan-300">
                  {latestEntry.summary.totalSymbolsScanned}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                <div className="text-xs text-zinc-400 mb-1">Signals Created</div>
                <div className="text-lg font-bold text-emerald-400">
                  {latestEntry.summary.signalsCreated}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                <div className="text-xs text-zinc-400 mb-1">Avg Score</div>
                <div className="text-lg font-bold text-sky-300">
                  {latestEntry.summary.avgEdgeScore.toFixed(0)}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                <div className="text-xs text-zinc-400 mb-1">Readiness</div>
                <div className="text-lg font-bold text-violet-300">
                  {latestEntry.quality.readinessScore.toFixed(0)}%
                </div>
              </div>
            </div>

            {/* Signal Distribution */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Signal Breakdown
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* By Type */}
                <div className="p-2 rounded-lg bg-zinc-900/30 border border-zinc-800">
                  <div className="text-xs text-zinc-400 mb-2 font-medium">By Type</div>
                  <div className="space-y-1">
                    {Object.entries(latestEntry.summary.signalsByType).map(
                      ([type, count]) => (
                        <div
                          key={type}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-zinc-400">{type}</span>
                          <Badge
                            variant="secondary"
                            className="text-xs px-2 py-0 h-5"
                          >
                            {count}
                          </Badge>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* By Direction */}
                <div className="p-2 rounded-lg bg-zinc-900/30 border border-zinc-800">
                  <div className="text-xs text-zinc-400 mb-2 font-medium">
                    By Direction
                  </div>
                  <div className="space-y-1">
                    {Object.entries(latestEntry.summary.signalsByDirection).map(
                      ([direction, count]) => {
                        const colors = {
                          bullish: "text-emerald-400",
                          bearish: "text-red-400",
                          neutral: "text-zinc-400",
                        };
                        return (
                          <div
                            key={direction}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className={`${colors[direction as keyof typeof colors] || "text-zinc-400"}`}>
                              {direction}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-xs px-2 py-0 h-5"
                            >
                              {count}
                            </Badge>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Top Triggers */}
            {latestEntry.topTriggers && latestEntry.topTriggers.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  <Target className="w-3 h-3" />
                  Top Triggers
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {latestEntry.topTriggers.slice(0, 5).map((trigger, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-xs p-2 rounded-lg bg-zinc-900/20 border border-zinc-800/50"
                    >
                      <div className="flex-1">
                        <div className="text-zinc-300 truncate">{trigger.reason}</div>
                        <div className="text-[10px] text-zinc-500">
                          {trigger.frequency}x • Avg: {trigger.avgScore.toFixed(1)}
                        </div>
                      </div>
                      <div className="ml-2 flex items-center gap-1">
                        <div
                          className="w-8 h-1.5 rounded-full bg-zinc-800"
                          style={{
                            background: `linear-gradient(90deg, rgb(59, 130, 246) 0%, rgb(59, 130, 246) ${Math.min(100, (trigger.avgScore / 100) * 100)}%, rgb(39, 39, 42) ${Math.min(100, (trigger.avgScore / 100) * 100)}%, rgb(39, 39, 42) 100%)`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quality Metrics */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800">
              <div className="text-xs">
                <div className="text-zinc-400 mb-1">Health Grade</div>
                <Badge
                  className={`text-xs font-bold px-2 py-1 ${
                    latestEntry.quality.healthScore === "A"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : latestEntry.quality.healthScore === "B"
                        ? "bg-cyan-500/20 text-cyan-400"
                        : latestEntry.quality.healthScore === "C"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {latestEntry.quality.healthScore}
                </Badge>
              </div>
              <div className="text-xs">
                <div className="text-zinc-400 mb-1">Market Condition</div>
                <div className="text-xs text-zinc-300">
                  {latestEntry.quality.volatilityRegime}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Entries Timeline */}
      {timeRange === "recent" && entries.length > 1 && (
        <Card className="glass-panel border-cyan-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {entries.map((entry, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-zinc-900/30 border border-zinc-800 hover:border-cyan-500/30 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-cyan-300">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <div className="flex gap-1">
                      <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">
                        {entry.summary.signalsCreated}
                      </Badge>
                      <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">
                        {entry.summary.totalSymbolsScanned} symbols
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Score: {entry.summary.avgEdgeScore.toFixed(1)}</span>
                    <span
                      className={`${
                        entry.quality.healthScore === "A"
                          ? "text-emerald-400"
                          : entry.quality.healthScore === "B"
                            ? "text-cyan-400"
                            : entry.quality.healthScore === "C"
                              ? "text-yellow-400"
                              : "text-red-400"
                      }`}
                    >
                      Grade {entry.quality.healthScore}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && !latestEntry && (
        <Card className="glass-panel border-zinc-800/50">
          <CardContent className="p-4">
            <div className="text-xs text-zinc-400 animate-pulse">
              Loading signal logs...
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
