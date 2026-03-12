import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Zap, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Clock,
  Flame,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  Activity,
  Crosshair,
  Gauge,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ExpirationDate {
  label: string;
  date: string;
  daysToExpiry: number;
  type: '0DTE' | 'weekly' | 'monthly';
}

interface SyntheticGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
}

interface ContractScore {
  total: number;
  pceAlignment: number;
  monsterGate: number;
  deltaScore: number;
  rrScore: number;
  liquidityScore: number;
  reasons: string[];
}

interface PremiumExpansionModel {
  currentPremium: number;
  targetPremium: number;
  stopPremium: number;
  expansionPercent: number;
  expectedGain: number;
  riskAmount: number;
  rrRatio: number;
  confidence: number;
  notes: string[];
}

interface SyntheticContract {
  strike: number;
  side: 'call' | 'put';
  expiration: ExpirationDate;
  premium: number;
  greeks: SyntheticGreeks;
  score: ContractScore;
  expansion: PremiumExpansionModel;
  isRecommended: boolean;
  rank: number;
}

interface PCESignal {
  pullbackScore: number;
  compressionScore: number;
  expansionScore: number;
  pceRaw: number;
  pceScore: number;
  pceProb: number;
  quality: 'A' | 'B' | 'C' | 'none';
  direction: 'bullish' | 'bearish' | 'none';
  entryLevel: number | null;
  stopLevel: number | null;
  notes: string[];
  monster: boolean;
  monsterReasons: string[];
  ignition: boolean;
}

interface SyntheticOptionsChain {
  symbol: string;
  spotPrice: number;
  atmStrike: number;
  strikeInterval: number;
  expirations: ExpirationDate[];
  calls: SyntheticContract[];
  puts: SyntheticContract[];
  topPlays: SyntheticContract[];
  monsterPlay: SyntheticContract | null;
  pce: PCESignal;
  meta: {
    regime: string;
    bias: string;
    dominant: string;
    dominantProb: number;
    chop: number;
    confidence: number;
  };
}

import type { UnifiedOptionsPlay } from "@shared/schema";

interface MonsterOTMPanelData {
  chain: SyntheticOptionsChain;
  hasMonsterPlay: boolean;
  topPlay: SyntheticContract | null;
  direction: 'bullish' | 'bearish' | 'neutral';
  setupQuality: 'A' | 'B' | 'C' | 'none';
  summary: string;
  isSynthetic: boolean;
  disclaimer: string;
  unifiedOptionsPlay: UnifiedOptionsPlay | null;
  expectedMove: number;
}

interface MonsterOTMPanelProps {
  symbol: string;
  currentPriceOverride?: number;
}

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function getQualityStyles(quality: 'A' | 'B' | 'C' | 'none'): { text: string; bg: string; border: string; glow: string } {
  switch (quality) {
    case 'A': return { 
      text: 'text-emerald-400', 
      bg: 'bg-emerald-500/20', 
      border: 'border-emerald-500/50',
      glow: 'shadow-emerald-500/20'
    };
    case 'B': return { 
      text: 'text-amber-400', 
      bg: 'bg-amber-500/20', 
      border: 'border-amber-500/50',
      glow: 'shadow-amber-500/20'
    };
    case 'C': return { 
      text: 'text-orange-400', 
      bg: 'bg-orange-500/20', 
      border: 'border-orange-500/50',
      glow: 'shadow-orange-500/20'
    };
    default: return { 
      text: 'text-muted-foreground', 
      bg: 'bg-muted/20', 
      border: 'border-muted/50',
      glow: ''
    };
  }
}

function getScoreStyles(score: number): { text: string; bg: string } {
  if (score >= 70) return { text: 'text-emerald-400', bg: 'bg-emerald-500' };
  if (score >= 50) return { text: 'text-amber-400', bg: 'bg-amber-500' };
  if (score >= 30) return { text: 'text-orange-400', bg: 'bg-orange-500' };
  return { text: 'text-red-400', bg: 'bg-red-500' };
}

function ArcMeter({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'red' | 'cyan' | 'amber' | 'violet' }) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const startX = 18;
  const endX = 82;
  const cx = 50;
  const cy = 42;
  const r = 32;
  const arc = Math.PI * r;
  const norm = pct / 100;
  const dotX = startX + (endX - startX) * norm;
  const dotY = cy - Math.sqrt(Math.max(0, r * r - Math.pow(dotX - cx, 2)));

  const color =
    tone === 'emerald' ? '#4ade80' :
    tone === 'red' ? '#f87171' :
    tone === 'amber' ? '#fbbf24' :
    tone === 'violet' ? '#a78bfa' : '#22d3ee';

  return (
    <div className="relative overflow-hidden rounded-lg border border-cyan-400/35 bg-[#061125]/92 p-2 shadow-[inset_0_0_20px_rgba(34,211,238,0.14),0_0_18px_rgba(56,189,248,0.14)]">
      <div className="pointer-events-none absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.18),transparent_58%)]" />
      <svg width="110" height="56" viewBox="0 0 100 50" className="mx-auto">
        <path d="M 18 42 A 32 32 0 0 1 82 42" stroke="currentColor" strokeWidth="4" className="text-muted/35" fill="none" strokeLinecap="round" />
        <path
          d="M 18 42 A 32 32 0 0 1 82 42"
          stroke={color}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={arc}
          strokeDashoffset={arc * (1 - norm)}
          style={{ filter: `drop-shadow(0 0 8px ${color})` }}
        />
        <circle cx={dotX} cy={dotY} r="2.2" fill={color} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
        <text x="50" y="22" textAnchor="middle" fill={color} className="text-[14px] font-mono font-black" style={{ filter: `drop-shadow(0 0 8px ${color})` }}>
          {Math.round(pct)}
        </text>
      </svg>
      <div className="-mt-1 text-center text-[8px] uppercase tracking-[0.12em] text-cyan-100/85">{label}</div>
    </div>
  );
}

function TopPlayCard({ contract, label, isMonster }: { contract: SyntheticContract; label: string; isMonster?: boolean }) {
  const DirectionIcon = contract.side === 'call' ? TrendingUp : TrendingDown;
  const isCall = contract.side === 'call';
  const scoreStyles = getScoreStyles(contract.score.total);
  const scorePct = Math.max(0, Math.min(100, contract.score.total));
  const confidencePct = Math.max(0, Math.min(100, contract.expansion.confidence));
  const rrPct = Math.max(0, Math.min(100, contract.expansion.rrRatio * 25));
  
  const gradientClass = isMonster 
    ? 'bg-gradient-to-br from-purple-500/20 via-fuchsia-500/10 to-transparent border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.2)]' 
    : isCall 
      ? 'bg-gradient-to-br from-emerald-500/15 via-teal-500/5 to-transparent border-emerald-500/30 shadow-[0_0_20px_rgba(74,222,128,0.16)]'
      : 'bg-gradient-to-br from-red-500/15 via-rose-500/5 to-transparent border-red-500/30 shadow-[0_0_20px_rgba(248,113,113,0.16)]';
  
  return (
    <div 
      className={`relative overflow-hidden p-4 rounded-lg border ${gradientClass} backdrop-blur-sm transition-all duration-200 hover:scale-[1.02]`} 
      data-testid={`top-play-${label}`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(34,211,238,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(129,140,248,0.12)_1px,transparent_1px)] [background-size:20px_20px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-500/0 via-cyan-300/75 to-violet-400/0" />
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isMonster ? (
            <div className="p-1.5 rounded-md bg-purple-500/30">
              <Flame className="w-4 h-4 text-purple-400" />
            </div>
          ) : (
            <div className={`p-1.5 rounded-md ${isCall ? 'bg-emerald-500/30' : 'bg-red-500/30'}`}>
              <DirectionIcon className={`w-4 h-4 ${isCall ? 'text-emerald-400' : 'text-red-400'}`} />
            </div>
          )}
          <div>
            <span className={`font-bold text-sm ${isMonster ? 'text-purple-400' : isCall ? 'text-emerald-400' : 'text-red-400'}`}>
              {contract.side.toUpperCase()}
            </span>
            <span className="text-xs text-muted-foreground ml-2">{label}</span>
          </div>
        </div>
        <div className={`px-2 py-1 rounded-md ${scoreStyles.bg}/30 border ${scoreStyles.text === 'text-emerald-400' ? 'border-emerald-500/30' : scoreStyles.text === 'text-amber-400' ? 'border-amber-500/30' : 'border-orange-500/30'}`}>
          <span className={`text-xs font-bold ${scoreStyles.text}`}>{contract.score.total}</span>
        </div>
      </div>

      <div className="mb-3 rounded-md border border-cyan-500/25 bg-cyan-500/8 p-2">
        <div className="grid grid-cols-3 gap-2 text-[9px] uppercase tracking-wider text-cyan-100/70">
          <div>
            <div className="mb-1 flex items-center justify-between"><span>Score</span><span className="font-mono text-cyan-200">{scorePct}%</span></div>
            <div className="h-1 rounded-full bg-black/35 overflow-hidden border border-cyan-500/20">
              <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-400" style={{ width: `${Math.max(6, scorePct)}%` }} />
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between"><span>Conf</span><span className="font-mono text-violet-200">{confidencePct}%</span></div>
            <div className="h-1 rounded-full bg-black/35 overflow-hidden border border-violet-500/20">
              <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-400" style={{ width: `${Math.max(6, confidencePct)}%` }} />
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between"><span>R:R</span><span className="font-mono text-emerald-200">{contract.expansion.rrRatio.toFixed(1)}x</span></div>
            <div className="h-1 rounded-full bg-black/35 overflow-hidden border border-emerald-500/20">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400" style={{ width: `${Math.max(6, rrPct)}%` }} />
            </div>
          </div>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-cyan-50 drop-shadow-[0_0_10px_rgba(56,189,248,0.2)]">${contract.strike}</span>
          <span className="text-sm text-cyan-100/65">{contract.expiration.label}</span>
        </div>
        
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="space-y-0.5 rounded-md border border-cyan-500/22 bg-cyan-500/6 p-2">
            <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Premium</div>
            <div className="font-mono font-medium text-foreground">${contract.premium.toFixed(2)}</div>
          </div>
          <div className="space-y-0.5 rounded-md border border-violet-500/22 bg-violet-500/6 p-2">
            <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Delta</div>
            <div className="font-mono font-medium text-cyan-400">{(contract.greeks.delta * 100).toFixed(0)}</div>
          </div>
          <div className="space-y-0.5 rounded-md border border-emerald-500/22 bg-emerald-500/6 p-2">
            <div className="text-muted-foreground uppercase tracking-wider text-[10px]">R:R</div>
            <div className={`font-mono font-medium ${contract.expansion.rrRatio >= 2 ? 'text-emerald-400' : 'text-foreground'}`}>
              {contract.expansion.rrRatio.toFixed(1)}:1
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-3 pt-3 border-t border-cyan-500/20">
        <div className="flex justify-between text-xs">
          <div className="space-y-0.5">
            <div className="text-muted-foreground text-[10px]">TARGET</div>
            <div className="text-emerald-400 font-mono font-medium">${contract.expansion.targetPremium.toFixed(2)}</div>
          </div>
          <div className="space-y-0.5 text-center">
            <div className="text-muted-foreground text-[10px]">EXP %</div>
            <div className={`font-mono font-medium ${contract.expansion.expansionPercent >= 30 ? 'text-emerald-400' : 'text-foreground'}`}>
              {formatPercent(contract.expansion.expansionPercent)}
            </div>
          </div>
          <div className="space-y-0.5 text-right">
            <div className="text-muted-foreground text-[10px]">STOP</div>
            <div className="text-red-400 font-mono font-medium">${contract.expansion.stopPremium.toFixed(2)}</div>
          </div>
        </div>
      </div>
      
      {contract.score.reasons.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {contract.score.reasons.slice(0, 3).map((reason, i) => (
            <span 
              key={i} 
              className="px-1.5 py-0.5 rounded text-[10px] border border-cyan-500/20 bg-cyan-500/8 text-cyan-100/70"
            >
              {reason}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PCEMeter({ pce }: { pce: PCESignal }) {
  const maxScores = { pullback: 3, compression: 11, expansion: 6 };
  const total = pce.pullbackScore + pce.compressionScore + pce.expansionScore;
  const maxTotal = maxScores.pullback + maxScores.compression + maxScores.expansion;
  const pct = (total / maxTotal) * 100;
  const qualityStyles = getQualityStyles(pce.quality);
  
  const pullbackPct = (pce.pullbackScore / maxScores.pullback) * 100;
  const compressionPct = (pce.compressionScore / maxScores.compression) * 100;
  const expansionPct = (pce.expansionScore / maxScores.expansion) * 100;
  const engineSync = Math.round((pullbackPct * 0.22 + compressionPct * 0.43 + expansionPct * 0.35));
  
  return (
    <div className="relative space-y-4 p-4 rounded-lg border border-cyan-400/35 bg-[#050f22]/92 shadow-[inset_0_0_24px_rgba(34,211,238,0.12),0_0_18px_rgba(56,189,248,0.12)]" data-testid="pce-meter">
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(34,211,238,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.12)_1px,transparent_1px)] [background-size:20px_20px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-500/0 via-cyan-300/85 to-violet-400/0" />
      <div className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t border-cyan-300/55" />
      <div className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b border-violet-300/45" />

      <div className="relative flex items-center justify-between rounded-md border border-cyan-500/25 bg-cyan-500/8 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md border border-amber-400/40 bg-amber-500/18 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
            <Gauge className="w-4 h-4 text-amber-300" />
          </div>
          <div>
            <span className="text-sm font-semibold text-cyan-50">PCE Signal</span>
            <div className="text-[9px] uppercase tracking-[0.12em] text-cyan-200/65">Pattern Compression Expansion Core</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-mono text-cyan-200/80">ENGINE</span>
          <div className={`px-3 py-1.5 rounded-md ${qualityStyles.bg} border ${qualityStyles.border} shadow-[0_0_10px_rgba(56,189,248,0.15)]`}>
            <span className={`text-lg font-bold font-mono ${qualityStyles.text}`}>
              {pce.quality !== 'none' ? pce.quality : '-'}
            </span>
          </div>
        </div>
      </div>
      
      <div className="space-y-2.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="text-cyan-100/80 uppercase tracking-wider">Overall Score</span>
          <span className={`font-mono font-medium ${qualityStyles.text}`}>{total}/{maxTotal}</span>
        </div>
        <div className="h-3 bg-black/35 border border-cyan-500/35 rounded-full overflow-hidden relative shadow-[inset_0_0_12px_rgba(34,211,238,0.14)]">
          <div 
            className={`h-full transition-all duration-500 ease-out rounded-full ${
              pce.quality === 'A' ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' :
              pce.quality === 'B' ? 'bg-gradient-to-r from-amber-600 to-amber-400' :
              pce.quality === 'C' ? 'bg-gradient-to-r from-orange-600 to-orange-400' :
              'bg-muted-foreground/50'
            }`}
            style={{ width: `${pct}%` }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-2 opacity-30">
            <div className="h-1.5 w-px bg-cyan-100/40" />
            <div className="h-1.5 w-px bg-cyan-100/40" />
            <div className="h-1.5 w-px bg-cyan-100/40" />
            <div className="h-1.5 w-px bg-cyan-100/40" />
          </div>
        </div>
      </div>

      <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-2 shadow-[inset_0_0_14px_rgba(34,211,238,0.1)]">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
          <span className="text-cyan-100/80">Core Sync</span>
          <span className={cn("font-mono font-bold", engineSync >= 70 ? "text-emerald-300" : engineSync >= 45 ? "text-amber-300" : "text-red-300")}>{engineSync}%</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-black/35 border border-cyan-500/25 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              engineSync >= 70
                ? "bg-gradient-to-r from-emerald-500 to-cyan-400"
                : engineSync >= 45
                ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                : "bg-gradient-to-r from-red-500 to-orange-400"
            )}
            style={{ width: `${Math.max(6, Math.min(100, engineSync))}%` }}
          />
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-2 rounded-md border border-cyan-500/30 bg-cyan-500/8 p-2 shadow-[0_0_12px_rgba(34,211,238,0.12)]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-cyan-100/78">Pullback</span>
            <span className="font-mono text-cyan-300">{pce.pullbackScore}/{maxScores.pullback}</span>
          </div>
          <div className="h-1.5 bg-black/40 rounded-full overflow-hidden border border-cyan-500/28">
            <div 
              className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all duration-300"
              style={{ width: `${pullbackPct}%` }}
            />
          </div>
        </div>
        <div className="space-y-2 rounded-md border border-violet-500/34 bg-violet-500/10 p-2 shadow-[0_0_14px_rgba(139,92,246,0.18)]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-violet-100/82">Compress</span>
            <span className="font-mono text-violet-300">{pce.compressionScore}/{maxScores.compression}</span>
          </div>
          <div className="h-1.5 bg-black/40 rounded-full overflow-hidden border border-violet-500/32">
            <div 
              className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all duration-300"
              style={{ width: `${compressionPct}%` }}
            />
          </div>
        </div>
        <div className="space-y-2 rounded-md border border-fuchsia-500/34 bg-fuchsia-500/10 p-2 shadow-[0_0_14px_rgba(217,70,239,0.18)]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-fuchsia-100/82">Expand</span>
            <span className="font-mono text-fuchsia-300">{pce.expansionScore}/{maxScores.expansion}</span>
          </div>
          <div className="h-1.5 bg-black/40 rounded-full overflow-hidden border border-fuchsia-500/32">
            <div 
              className="h-full bg-gradient-to-r from-fuchsia-600 to-fuchsia-400 rounded-full transition-all duration-300"
              style={{ width: `${expansionPct}%` }}
            />
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2 flex-wrap pt-1">
        {pce.monster && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-purple-500/22 border border-purple-400/45 shadow-[0_0_10px_rgba(168,85,247,0.2)]">
            <Flame className="w-3 h-3 text-purple-400 animate-pulse" />
            <span className="text-xs font-bold text-purple-400">MONSTER</span>
          </div>
        )}
        {pce.ignition && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/22 border border-amber-400/45 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="text-xs font-bold text-amber-400">IGNITION</span>
          </div>
        )}
        {pce.direction !== 'none' && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded-md ${
            pce.direction === 'bullish' 
              ? 'bg-emerald-500/20 border border-emerald-500/40' 
              : 'bg-red-500/20 border border-red-500/40'
          }`}>
            {pce.direction === 'bullish' ? (
              <ChevronUp className="w-3 h-3 text-emerald-400" />
            ) : (
              <ChevronDown className="w-3 h-3 text-red-400" />
            )}
            <span className={`text-xs font-bold ${pce.direction === 'bullish' ? 'text-emerald-400' : 'text-red-400'}`}>
              {pce.direction.toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/25">
          <span className="text-xs text-cyan-200/70">Prob:</span>
          <span className="text-xs font-mono font-medium text-cyan-100">{(pce.pceProb * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}



export function MonsterOTMPanel({ symbol, currentPriceOverride }: MonsterOTMPanelProps) {
  const { data, isLoading, error } = useQuery<MonsterOTMPanelData>({
    queryKey: ['/api/monster-panel', symbol],
    enabled: !!symbol,
    refetchInterval: 30000,
    staleTime: 10000,
    refetchOnWindowFocus: false
  });
  
  if (isLoading) {
    return (
      <Card className="relative overflow-hidden rounded-xl border border-cyan-500/30 bg-gradient-to-b from-[#040816]/95 via-[#060d1e]/90 to-[#070f24]/85 shadow-[0_0_30px_rgba(34,211,238,0.16)]" data-testid="card-monster-panel">
        <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(34,211,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(129,140,248,0.14)_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="h-1 bg-gradient-to-r from-cyan-500 via-violet-400 to-fuchsia-400" />
        <CardHeader className="relative py-3 px-4 border-b border-cyan-500/25 bg-gradient-to-r from-cyan-500/10 via-transparent to-violet-500/10">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-cyan-200/75 flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-400" />
            Monster OTM Engine
          </CardTitle>
        </CardHeader>
        <CardContent className="relative p-4">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted/50 rounded w-3/4"></div>
            <div className="h-4 bg-muted/50 rounded w-1/2"></div>
            <div className="h-24 bg-muted/30 rounded-lg"></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="h-32 bg-muted/30 rounded-lg"></div>
              <div className="h-32 bg-muted/30 rounded-lg"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="relative overflow-hidden rounded-xl border border-red-500/35 bg-gradient-to-b from-[#14060a]/95 via-[#17070d]/90 to-[#1b0b13]/85" data-testid="card-monster-panel-error">
        <div className="h-1 bg-gradient-to-r from-red-600 via-red-500 to-orange-500" />
        <CardHeader className="py-3 px-4 border-b border-red-500/25">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-red-100/75 flex items-center gap-2">
            <Zap className="w-4 h-4 text-red-400" />
            Monster OTM Engine
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-red-400" />
          <p className="text-sm text-muted-foreground">Failed to load options data</p>
        </CardContent>
      </Card>
    );
  }

  const { chain, hasMonsterPlay, setupQuality, summary } = data;
  const displaySpot =
    typeof currentPriceOverride === "number" && Number.isFinite(currentPriceOverride) && currentPriceOverride > 0
      ? currentPriceOverride
      : chain.spotPrice;
  const qualityStyles = getQualityStyles(setupQuality);
  const directionColor = data.direction === 'bullish' ? 'text-emerald-400' : data.direction === 'bearish' ? 'text-red-400' : 'text-muted-foreground';
  const metaConfidencePct = Math.round((chain.meta.confidence || 0) * 100);
  const chopPct = Math.round((chain.meta.chop || 0) * 100);
  const domPct = Math.round((chain.meta.dominantProb || 0) * 100);

  return (
    <Card className="relative overflow-hidden rounded-xl border border-cyan-400/45 bg-gradient-to-b from-[#030712]/98 via-[#050d20]/94 to-[#061129]/90 shadow-[0_0_44px_rgba(34,211,238,0.22)]" data-testid="card-monster-panel">
      <div className="pointer-events-none absolute inset-0 opacity-28 [background-image:linear-gradient(rgba(34,211,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(129,140,248,0.14)_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.24),transparent_44%),radial-gradient(circle_at_86%_100%,rgba(168,85,247,0.18),transparent_40%)]" />
      <div className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t border-cyan-300/45" />
      <div className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b border-violet-300/35" />
      <div className={`h-1 ${
        hasMonsterPlay 
          ? 'bg-gradient-to-r from-cyan-500 via-violet-400 to-fuchsia-400 animate-pulse' 
          : 'bg-gradient-to-r from-cyan-500/60 via-violet-400/60 to-fuchsia-400/60'
      }`} />
      
      <CardHeader className="relative py-3 px-4 border-b border-cyan-400/28 bg-gradient-to-r from-cyan-500/12 via-indigo-500/10 to-violet-500/12">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
            <div className="p-1 rounded-md border border-cyan-400/35 bg-cyan-500/12">
              <Zap className="w-4 h-4 text-cyan-300" />
            </div>
            <span className="text-cyan-200 drop-shadow-[0_0_10px_rgba(56,189,248,0.35)]">Monster OTM</span>
            <span className="text-[10px] font-normal text-cyan-100/55">Engine</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
              SYNTHETIC
            </span>
            {hasMonsterPlay && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/40">
                <Flame className="w-3 h-3 text-purple-400 animate-pulse" />
                <span className="text-[10px] font-bold text-purple-400">MONSTER</span>
              </div>
            )}
            <div className={`px-2 py-0.5 rounded ${qualityStyles.bg} border ${qualityStyles.border}`}>
              <span className={`text-xs font-bold ${qualityStyles.text}`}>{setupQuality}</span>
            </div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[10px]">
          <div className="rounded border border-cyan-500/25 bg-cyan-500/8 px-2 py-1">
            <span className="text-cyan-200/70 uppercase tracking-wider">Regime</span>
            <div className="font-mono text-cyan-100/90 truncate">{chain.meta.regime}</div>
          </div>
          <div className="rounded border border-violet-500/25 bg-violet-500/8 px-2 py-1">
            <span className="text-violet-200/70 uppercase tracking-wider">Bias</span>
            <div className={cn(
              "font-mono truncate",
              chain.meta.bias === 'bullish' ? 'text-emerald-300' : chain.meta.bias === 'bearish' ? 'text-red-300' : 'text-slate-300'
            )}>{chain.meta.bias}</div>
          </div>
          <div className="rounded border border-fuchsia-500/25 bg-fuchsia-500/8 px-2 py-1">
            <span className="text-fuchsia-200/70 uppercase tracking-wider">Dominant</span>
            <div className="font-mono text-fuchsia-100/90 truncate">{chain.meta.dominant}</div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="relative p-4 space-y-4">
        {data.unifiedOptionsPlay && (
          <div className="relative p-4 rounded-lg overflow-hidden border border-amber-400/30 bg-[#130d03]/45 shadow-[0_0_20px_rgba(245,158,11,0.14)]" data-testid="unified-options-play">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent" />
            <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(251,191,36,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(249,115,22,0.14)_1px,transparent_1px)] [background-size:20px_20px]" />
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 to-orange-500" />
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Unified Play</span>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-amber-400">{data.unifiedOptionsPlay.confidence}%</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Confidence</div>
                </div>
              </div>

              <div className="mb-3 rounded-md border border-amber-400/25 bg-amber-500/10 px-2 py-1.5">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
                  <span className="text-amber-200/75">Play Sync</span>
                  <span className={cn(
                    "font-mono font-bold",
                    data.unifiedOptionsPlay.confidence >= 70 ? "text-emerald-300" : data.unifiedOptionsPlay.confidence >= 50 ? "text-amber-300" : "text-red-300"
                  )}>{data.unifiedOptionsPlay.confidence}%</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-black/35 border border-amber-500/22 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      data.unifiedOptionsPlay.confidence >= 70
                        ? "bg-gradient-to-r from-emerald-500 to-cyan-400"
                        : data.unifiedOptionsPlay.confidence >= 50
                        ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                        : "bg-gradient-to-r from-red-500 to-orange-400"
                    )}
                    style={{ width: `${Math.max(8, Math.min(100, data.unifiedOptionsPlay.confidence))}%` }}
                  />
                </div>
              </div>
              
              <div className="flex items-baseline gap-3 mb-2">
                <span className={`text-xl font-bold ${data.unifiedOptionsPlay.direction === 'CALLS' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {data.unifiedOptionsPlay.direction === 'CALLS' ? 'CALL' : 'PUT'}
                </span>
                <span className="text-lg font-mono font-bold">${data.unifiedOptionsPlay.strike.toFixed(0)}</span>
                <span className="text-sm text-muted-foreground">{data.unifiedOptionsPlay.expiration}</span>
              </div>
              
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="rounded-md border border-amber-500/24 bg-amber-500/8 p-2">
                  <div className="text-muted-foreground text-[10px]">PREMIUM</div>
                  <div className="font-mono font-medium">${data.unifiedOptionsPlay.premium.toFixed(2)}</div>
                </div>
                <div className="rounded-md border border-cyan-500/24 bg-cyan-500/8 p-2">
                  <div className="text-muted-foreground text-[10px]">DELTA</div>
                  <div className="font-mono font-medium text-cyan-400">{Math.round(data.unifiedOptionsPlay.delta * 100)}</div>
                </div>
                <div className="rounded-md border border-emerald-500/24 bg-emerald-500/8 p-2">
                  <div className="text-muted-foreground text-[10px]">R:R</div>
                  <div className="font-mono font-medium text-emerald-400">{data.unifiedOptionsPlay.rr.toFixed(2)}:1</div>
                </div>
                <div className="rounded-md border border-violet-500/24 bg-violet-500/8 p-2">
                  <div className="text-muted-foreground text-[10px]">TARGET</div>
                  <div className="font-mono font-medium text-emerald-400">${data.unifiedOptionsPlay.target.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className={`relative p-3 rounded-lg overflow-hidden shadow-[inset_0_0_20px_rgba(34,211,238,0.08)] ${
          hasMonsterPlay 
            ? 'bg-gradient-to-r from-violet-500/12 via-fuchsia-500/8 to-transparent border border-violet-500/28' 
            : 'bg-cyan-500/8 border border-cyan-500/20'
        }`} data-testid="monster-summary">
          {hasMonsterPlay && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-500 to-fuchsia-500" />}
          <div className="flex items-center gap-3 pl-2">
            {hasMonsterPlay ? (
              <Flame className="w-5 h-5 text-purple-400 flex-shrink-0" />
            ) : (
              <Activity className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            )}
            <div>
              <div className={`text-sm font-semibold ${hasMonsterPlay ? 'text-purple-200 drop-shadow-[0_0_8px_rgba(167,139,250,0.35)]' : 'text-cyan-100'}`}>
                {summary}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Direction: <span className={directionColor}>{data.direction.toUpperCase()}</span>
                {data.expectedMove > 0 && (
                  <span className="ml-2">Expected Move: <span className="text-cyan-400">{(data.expectedMove * 100).toFixed(1)}%</span></span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <ArcMeter label="Meta Confidence" value={metaConfidencePct} tone={metaConfidencePct >= 60 ? 'emerald' : metaConfidencePct >= 40 ? 'amber' : 'red'} />
          <ArcMeter label="Dominant Prob" value={domPct} tone={domPct >= 55 ? 'violet' : 'cyan'} />
          <ArcMeter label="Chop Level" value={chopPct} tone={chopPct >= 55 ? 'red' : chopPct >= 35 ? 'amber' : 'emerald'} />
        </div>

        <PCEMeter pce={chain.pce} />

        <div className="grid grid-cols-3 gap-3">
          <div className="relative overflow-hidden rounded-lg border border-amber-500/34 shadow-[0_0_18px_rgba(251,191,36,0.14)]" data-testid="monster-spot">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/15 via-transparent to-orange-500/5" />
            <div className="h-0.5 bg-gradient-to-r from-amber-400 to-orange-500" />
            <div className="relative p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Crosshair className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Spot</span>
              </div>
              <div className="text-xl font-mono font-bold text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]">
                ${displaySpot.toFixed(2)}
              </div>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-lg border border-cyan-500/34 shadow-[0_0_18px_rgba(34,211,238,0.16)]" data-testid="monster-atm">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/15 via-transparent to-blue-500/5" />
            <div className="h-0.5 bg-gradient-to-r from-cyan-400 to-blue-500" />
            <div className="relative p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Target className="w-3 h-3 text-cyan-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">ATM Strike</span>
              </div>
              <div className="text-xl font-mono font-bold text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]">
                ${chain.atmStrike}
              </div>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-lg border border-violet-500/34 shadow-[0_0_18px_rgba(167,139,250,0.16)]" data-testid="monster-interval">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/15 via-transparent to-purple-500/5" />
            <div className="h-0.5 bg-gradient-to-r from-violet-400 to-purple-500" />
            <div className="relative p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Activity className="w-3 h-3 text-violet-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">Interval</span>
              </div>
              <div className="text-xl font-mono font-bold text-violet-300 drop-shadow-[0_0_8px_rgba(139,92,246,0.3)]">
                ${chain.strikeInterval}
              </div>
            </div>
          </div>
        </div>

        {(chain.topPlays.length > 0 || chain.monsterPlay) && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold uppercase tracking-wider text-cyan-100/75">Top Plays</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {chain.monsterPlay && (
                <TopPlayCard contract={chain.monsterPlay} label="MONSTER" isMonster />
              )}
              {chain.topPlays.slice(0, chain.monsterPlay ? 1 : 2).map((play, i) => (
                <TopPlayCard key={i} contract={play} label={`#${i + 1}`} />
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap text-xs pt-2 border-t border-cyan-500/15">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">Expirations:</span>
          {chain.expirations.map((exp, i) => (
            <span 
              key={i} 
              className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                exp.type === '0DTE' 
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                  : 'bg-muted/50 text-muted-foreground'
              }`}
            >
              {exp.label} ({exp.daysToExpiry}d)
            </span>
          ))}
        </div>

        {data.isSynthetic && (
          <div className="pt-3 border-t border-border/30">
            <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/5 border border-amber-500/20">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
              <span className="text-[10px] text-muted-foreground leading-relaxed">{data.disclaimer}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
