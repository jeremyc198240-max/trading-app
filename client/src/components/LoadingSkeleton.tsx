import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, TrendingUp, Zap, Activity } from "lucide-react";

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" data-testid="skeleton-dashboard">
      <Card className="overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-muted via-muted-foreground/20 to-muted animate-pulse" />
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-12 h-12 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <div className="text-right space-y-2">
              <Skeleton className="h-10 w-32 ml-auto" />
              <Skeleton className="h-8 w-28 ml-auto rounded-lg" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 space-y-6">
          <Card className="overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-purple-500/30 via-fuchsia-500/30 to-pink-500/30 animate-pulse" />
            <CardHeader className="py-3 px-4 border-b border-border/50 bg-gradient-to-r from-purple-500/5 via-transparent to-fuchsia-500/5">
              <div className="flex items-center gap-2">
                <Skeleton className="w-8 h-8 rounded-md" />
                <Skeleton className="h-4 w-32" />
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <Skeleton className="h-24 w-full rounded-lg" />
              <div className="grid grid-cols-3 gap-4">
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-32 rounded-lg" />
                <Skeleton className="h-32 rounded-lg" />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-cyan-500/30 via-blue-500/30 to-indigo-500/30 animate-pulse" />
            <CardHeader className="py-3 px-4 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Skeleton className="w-8 h-8 rounded-md" />
                <Skeleton className="h-4 w-28" />
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <Skeleton className="h-40 w-full rounded-lg" />
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-4 space-y-6">
          <Card className="overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-amber-500/30 via-orange-500/30 to-red-500/30 animate-pulse" />
            <CardHeader className="py-3 px-4 border-b border-border/50">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <Skeleton className="h-32 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4 border-b border-border/50">
              <Skeleton className="h-4 w-16" />
            </CardHeader>
            <CardContent className="p-6 flex flex-col items-center gap-4">
              <Skeleton className="w-36 h-36 rounded-full" />
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-6 w-32 rounded-lg" />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="py-3 px-4 border-b border-border/50">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Card key={i} className="overflow-hidden">
                <div className="h-0.5 bg-muted animate-pulse" />
                <CardHeader className="pb-2 pt-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Skeleton className="w-7 h-7 rounded-md" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <Skeleton className="h-5 w-12 rounded" />
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  <Skeleton className="h-6 w-16 mb-1" />
                  <Skeleton className="h-3 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function EmptyState({ onSelectTicker }: { onSelectTicker: (ticker: string) => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4"
      data-testid="empty-state"
    >
      <div className="relative mb-8">
        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-cyan-500/20 via-blue-500/10 to-purple-500/20 flex items-center justify-center">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500/10 to-purple-500/10 flex items-center justify-center border border-cyan-500/20">
            <BarChart3 className="w-12 h-12 text-cyan-400" />
          </div>
        </div>
        <div className="absolute -top-2 -right-2 p-2 rounded-lg bg-purple-500/20 border border-purple-500/30">
          <Zap className="w-5 h-5 text-purple-400" />
        </div>
        <div className="absolute -bottom-2 -left-2 p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
        </div>
      </div>
      
      <h2 className="text-3xl font-black mb-3 bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
        Start Analyzing
      </h2>
      <p className="text-muted-foreground max-w-md mb-8 leading-relaxed">
        Enter a ticker symbol above to get real-time trading signals, 
        institutional-grade analysis, and actionable trade recommendations.
      </p>
      
      <div className="flex flex-wrap gap-3 justify-center">
        {["SPY", "QQQ", "AAPL", "TSLA"].map((ticker) => (
          <button
            key={ticker}
            onClick={() => onSelectTicker(ticker)}
            className="group px-5 py-2.5 text-sm font-mono font-bold bg-card border border-border/50 rounded-lg hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all duration-200 flex items-center gap-2"
            data-testid={`button-empty-${ticker.toLowerCase()}`}
          >
            <Activity className="w-4 h-4 text-muted-foreground group-hover:text-cyan-400 transition-colors" />
            {ticker}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4"
      data-testid="error-state"
    >
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-500/20 via-rose-500/10 to-orange-500/20 flex items-center justify-center mb-6 border border-red-500/30">
        <svg
          className="w-10 h-10 text-red-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h3 className="text-xl font-bold mb-2 text-red-400">Analysis Failed</h3>
      <p className="text-muted-foreground max-w-md mb-6">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:opacity-90 transition-opacity"
          data-testid="button-retry"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
