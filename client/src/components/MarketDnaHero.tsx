import { Activity, Atom, Brain, Crosshair, Radar, Target, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AnalysisPayload } from "@shared/schema";

interface MarketDnaHeroProps {
  analysis: AnalysisPayload;
  lastPrice: number;
}

function pct(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function MarketDnaHero({ analysis, lastPrice }: MarketDnaHeroProps) {
  const analysisAny = analysis as any;
  const marketDNA = analysis.marketDNA;
  const monster = analysis.monsterOtm;
  const monsterGateAudit = analysisAny.monsterGateAudit as
    | {
        passed: boolean;
        systemLane: 'fusion' | 'scanner';
        selectedProfile: 'strict_live' | 'balanced_accuracy' | 'active_flow';
        laneHasDepth: boolean;
        dnaDirection: 'bullish' | 'bearish' | 'neutral';
        playDirection: 'bullish' | 'bearish' | 'neutral';
        tradeProbPct: number;
        hitProbPct: number;
      }
    | undefined;
  const highWinSystem = analysisAny.highWinSystem as
    | {
        engine: 'fusion' | 'scanner';
        label: string;
        winRate: number;
        sampleSize: number;
        lookbackHours: number;
        confidence: 'high' | 'medium' | 'low';
        recommendation: string;
      }
    | undefined;

  const reliability = asNumber(marketDNA?.reliability);
  const fingerprint = marketDNA?.fingerprint ?? {};
  const institutional = asNumber(fingerprint.institutionalScore);
  const intent = Math.max(
    asNumber(fingerprint.institutionalIntent),
    asNumber(monster?.play?.intentScore) / 100,
  );
  const directionalSkew = asNumber(fingerprint.directionalSkew);
  const compression = Math.max(
    asNumber(fingerprint.compressionScore),
    Math.min(1, asNumber(monster?.pce?.compressionScore) / 8),
  );
  const pceProb = Math.max(asNumber(monster?.pce?.pceProb), asNumber(monster?.play?.probability) / 100);
  const side = monster?.play?.side === "call" ? "CALL" : monster?.play?.side === "put" ? "PUT" : "WAIT";
  const vixLevel = asNumber((marketDNA?.fingerprint as any)?.vixLevel, asNumber(analysisAny?.vixLevel, 0));
  const vixRegime = String((marketDNA?.fingerprint as any)?.vixRegime ?? analysisAny?.vixRegime ?? "unknown").toUpperCase();
  const zeroDteReadiness = Math.max(0, Math.min(1,
    (pceProb * 0.4) +
    (intent * 0.35) +
    (reliability * 0.2) +
    (vixLevel > 0 ? (vixLevel < 22 ? 0.12 : vixLevel < 30 ? 0.03 : -0.08) : 0)
  ));

  const targetPrice = monster?.play?.targetPrice;
  const stopPrice = monster?.play?.stopPrice;
  const hitProbability = asNumber(monster?.play?.hitProbability);
  const supportLevel = asNumber(monster?.play?.supportLevel);
  const resistanceLevel = asNumber(monster?.play?.resistanceLevel);
  const hasPlan = Number.isFinite(targetPrice) && Number.isFinite(stopPrice);
  const laneWinRate = asNumber(highWinSystem?.winRate);
  const laneSample = asNumber(highWinSystem?.sampleSize);
  const sampleStrength = Math.max(0, Math.min(1, laneSample / 80));
  const gatePassed = Boolean(monsterGateAudit?.passed);
  const gateHit = asNumber(monsterGateAudit?.hitProbPct, hitProbability) / 100;
  const gateTrade = asNumber(monsterGateAudit?.tradeProbPct, asNumber(monster?.play?.probability)) / 100;
  const laneWinNorm = Math.max(0, Math.min(1, laneWinRate / 100));
  const accuracyTrust = Math.max(0, Math.min(1,
    laneWinNorm * 0.38 +
    sampleStrength * 0.24 +
    gateHit * 0.2 +
    gateTrade * 0.12 +
    (gatePassed ? 0.06 : -0.05)
  ));
  const trustState = accuracyTrust >= 0.75 ? 'LOCKED' : accuracyTrust >= 0.58 ? 'QUALIFIED' : 'CAUTION';
  const confidenceTone = highWinSystem?.confidence === 'high'
    ? 'text-emerald-200 border-emerald-400/35 bg-emerald-500/12'
    : highWinSystem?.confidence === 'medium'
    ? 'text-amber-200 border-amber-400/35 bg-amber-500/12'
    : 'text-slate-200 border-slate-400/35 bg-slate-500/12';

  return (
    <Card className="future-dna-hero overdrive-dna-hero overflow-hidden border-0" data-testid="market-dna-hero">
      <div className="future-dna-hero__scan" />
      <CardContent className="relative p-3.5 sm:p-4 lg:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="future-dna-kicker">
              <Atom className="h-3.5 w-3.5" />
              <span>Market DNA // Institutional Monster Console</span>
            </div>
            <div className="dna-skin-badge">Skin: OVERDRIVE V4 LIVE</div>
            <h2 className="text-2xl font-black tracking-tight text-cyan-100 sm:text-3xl">
              Market DNA: 0DTE War Room
            </h2>
            <p className="max-w-2xl text-sm text-cyan-100/75">
              Compression-aware institutional engine with VIX adaptation, session-realistic targets, and probability-locked execution plans.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-4">
            <div className="future-chip">
              <span className="future-chip__label">Spot</span>
              <span className="future-chip__value">${lastPrice.toFixed(2)}</span>
            </div>
            <div className="future-chip">
              <span className="future-chip__label">Direction</span>
              <span className="future-chip__value">{side}</span>
            </div>
            <div className="future-chip">
              <span className="future-chip__label">PCE</span>
              <span className="future-chip__value">{pct(pceProb)}</span>
            </div>
            <div className="future-chip">
              <span className="future-chip__label">Reliability</span>
              <span className="future-chip__value">{pct(reliability)}</span>
            </div>
            <div className="future-chip">
              <span className="future-chip__label">VIX</span>
              <span className="future-chip__value">{vixLevel > 0 ? vixLevel.toFixed(2) : "--"}</span>
            </div>
            <div className="future-chip">
              <span className="future-chip__label">VIX Regime</span>
              <span className="future-chip__value">{vixRegime}</span>
            </div>
            <div className="future-chip">
              <span className="future-chip__label">0DTE Readiness</span>
              <span className="future-chip__value">{pct(zeroDteReadiness)}</span>
            </div>
            <div className="future-chip">
              <span className="future-chip__label">Conviction</span>
              <span className="future-chip__value">{Math.round(intent * 100)} / 100</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
          <MetricRail icon={Brain} label="Institutional Score" value={institutional} tone="cyan" />
          <MetricRail icon={Zap} label="Intent Strength" value={intent} tone="lime" />
          <MetricRail icon={Radar} label="Compression Signature" value={compression} tone="violet" />
          <MetricRail icon={Activity} label="Directional Skew" value={directionalSkew} tone="amber" />
        </div>

        <div className="mt-4 rounded-xl border border-cyan-400/25 bg-[linear-gradient(120deg,rgba(34,211,238,0.10),rgba(6,182,212,0.04)_45%,rgba(14,116,144,0.12))] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="future-dna-kicker">
                <Crosshair className="h-3.5 w-3.5" />
                <span>War Room Priority Lane</span>
              </div>
              <div className={`rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-[0.13em] ${confidenceTone}`}>
                {highWinSystem?.confidence ?? 'low'} confidence
              </div>
            </div>
            <div className="text-xs text-cyan-100/80">
              {highWinSystem?.lookbackHours ?? 24}h window | {highWinSystem?.sampleSize ?? 0} completed
            </div>
          </div>

          <div className="mt-2.5 grid gap-2 sm:grid-cols-4">
            <div className="future-block">
              <span className="future-block__label">Top System</span>
              <span className="future-block__value">{highWinSystem?.label ?? 'Pending'}</span>
            </div>
            <div className="future-block">
              <span className="future-block__label">Win Rate</span>
              <span className="future-block__value">{Number.isFinite(highWinSystem?.winRate) ? `${highWinSystem!.winRate.toFixed(1)}%` : '--'}</span>
            </div>
            <div className="future-block">
              <span className="future-block__label">Breakout Hit Prob</span>
              <span className="future-block__value">{hitProbability > 0 ? `${hitProbability.toFixed(1)}%` : '--'}</span>
            </div>
            <div className="future-block">
              <span className="future-block__label">Execution Bias</span>
              <span className="future-block__value">{side}</span>
            </div>
          </div>

          <div className="mt-2 text-xs text-cyan-100/75">
            {highWinSystem?.recommendation ?? 'Collect more outcomes before assigning a priority lane.'}
          </div>

          <div className="warroom-accuracy-card mt-3">
            <div className="warroom-accuracy-head">
              <span>Accuracy Control Tower</span>
              <strong className={trustState === 'LOCKED' ? 'text-emerald-300' : trustState === 'QUALIFIED' ? 'text-cyan-300' : 'text-amber-300'}>
                {trustState}
              </strong>
            </div>
            <div className="warroom-accuracy-meter">
              <div className="warroom-accuracy-fill" style={{ width: `${Math.round(accuracyTrust * 100)}%` }} />
            </div>
            <div className="warroom-accuracy-grid">
              <div className="warroom-accuracy-cell">
                <span>Trust Score</span>
                <strong>{Math.round(accuracyTrust * 100)}%</strong>
              </div>
              <div className="warroom-accuracy-cell">
                <span>Gate State</span>
                <strong>{gatePassed ? 'PASS' : 'BLOCK'}</strong>
              </div>
              <div className="warroom-accuracy-cell">
                <span>Lane Win/Sample</span>
                <strong>{laneWinRate > 0 ? `${laneWinRate.toFixed(1)}%` : '--'} / {laneSample}</strong>
              </div>
              <div className="warroom-accuracy-cell">
                <span>Profile</span>
                <strong>{monsterGateAudit?.selectedProfile ?? 'strict_live'}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2.5 lg:grid-cols-3">
          <div className="future-plan-card lg:col-span-2">
            <div className="future-plan-card__header">
              <Crosshair className="h-4 w-4 text-fuchsia-300" />
              <span>Institutional Intent Plan</span>
            </div>
            <div className="future-plan-card__grid">
              <PlanBlock label="Signal Lane" value={monster?.pce?.quality ?? "none"} />
              <PlanBlock label="Compression Score" value={`${monster?.pce?.compressionScore ?? 0}/8`} />
              <PlanBlock label="Expansion Score" value={`${monster?.pce?.expansionScore ?? 0}/8`} />
              <PlanBlock label="Ignition" value={monster?.pce?.ignition ? "ON" : "OFF"} />
              <PlanBlock label="VIX Regime" value={vixRegime} />
              <PlanBlock label="0DTE Readiness" value={pct(zeroDteReadiness)} />
            </div>
          </div>

          <div className="future-plan-card">
            <div className="future-plan-card__header">
              <Target className="h-4 w-4 text-lime-300" />
              <span>Execution Map</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="future-value-row">
                <span>Side</span>
                <strong>{side}</strong>
              </div>
              <div className="future-value-row">
                <span>Strike</span>
                <strong>{monster?.play?.strike ? `$${monster.play.strike.toFixed(2)}` : "--"}</strong>
              </div>
              <div className="future-value-row">
                <span>Target</span>
                <strong>{hasPlan ? `$${targetPrice!.toFixed(2)}` : "--"}</strong>
              </div>
              <div className="future-value-row">
                <span>Invalidation</span>
                <strong>{hasPlan ? `$${stopPrice!.toFixed(2)}` : "--"}</strong>
              </div>
              <div className="future-value-row">
                <span>Support / Resistance</span>
                <strong>{supportLevel > 0 && resistanceLevel > 0 ? `$${supportLevel.toFixed(2)} / $${resistanceLevel.toFixed(2)}` : '--'}</strong>
              </div>
              <div className="future-value-row">
                <span>Hit Probability</span>
                <strong>{hitProbability > 0 ? `${hitProbability.toFixed(1)}%` : '--'}</strong>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricRail({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Brain;
  label: string;
  value: number;
  tone: "cyan" | "lime" | "violet" | "amber";
}) {
  const pctValue = Math.max(0, Math.min(100, value * 100));
  return (
    <div className={`future-rail future-rail--${tone}`}>
      <div className="future-rail__head">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
        <strong>{pctValue.toFixed(0)}%</strong>
      </div>
      <div className="future-rail__track">
        <div className="future-rail__fill" style={{ width: `${pctValue}%` }} />
      </div>
    </div>
  );
}

function PlanBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="future-block">
      <span className="future-block__label">{label}</span>
      <span className="future-block__value">{value}</span>
    </div>
  );
}
