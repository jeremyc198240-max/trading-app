import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function OptionPlayDropdown({
  optionPlays,
  expectedDirection,
}: {
  optionPlays: any[];
  expectedDirection?: "CALL" | "PUT" | null;
}) {
  const [open, setOpen] = useState(false);
  if (!optionPlays || optionPlays.length === 0) return null;
  // Confluence logic: volume, momentum, RSI/MACD must all align with play direction
  function isConfluent(play: any) {
    // These fields must be present on play or parent alert
    const vol = play.volumeSpike ?? play.volume ?? 0;
    const mom = play.momentumStrength ?? 0;
    const rsi = play.rsiValue ?? 0;
    const dir = (play.direction || '').toLowerCase();
    // Bullish: vol > 1.2, mom > 20, rsi > 50; Bearish: vol > 1.2, mom < -20, rsi < 50
    if (dir === 'call' || dir === 'bull' || dir === 'long') {
      return vol > 1.2 && mom > 20 && rsi > 50;
    } else if (dir === 'put' || dir === 'bear' || dir === 'short') {
      return vol > 1.2 && mom < -20 && rsi < 50;
    }
    return false;
  }

  // Show best play even if no confluence
  const sortedPlays = [...optionPlays].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.rr ?? 0) - (a.rr ?? 0));
  const confluentPlays = sortedPlays.filter(isConfluent);
  const normalizedExpected = (expectedDirection || "").toUpperCase();
  const confluentDirectional = normalizedExpected
    ? confluentPlays.filter((play) => String(play?.direction || "").toUpperCase() === normalizedExpected)
    : confluentPlays;
  const directionalBest = normalizedExpected
    ? sortedPlays.find((play) => String(play?.direction || "").toUpperCase() === normalizedExpected)
    : null;

  let bestPlay = null;
  if (confluentDirectional.length > 0) {
    bestPlay = confluentDirectional[0];
  } else if (directionalBest) {
    bestPlay = directionalBest;
  } else if (confluentPlays.length > 0) {
    bestPlay = confluentPlays[0];
  } else if (sortedPlays.length > 0) {
    bestPlay = sortedPlays[0];
  }

  return (
    <div className="relative">
      <button
        className="flex items-center gap-1 px-2 py-1 rounded-xl bg-gradient-to-r from-cyan-950 via-cyan-900 to-cyan-950 border border-cyan-700/60 shadow text-[12px] text-cyan-200 font-extrabold tracking-widest hover:scale-105 transition-all duration-200"
        style={{textShadow:'none'}} 
        onClick={() => setOpen((v) => !v)}
        title="Show Best Contract"
      >
        <span>Best Contract</span>
        {open ? <ChevronUp className="w-4 h-4 text-fuchsia-400" /> : <ChevronDown className="w-4 h-4 text-cyan-300" />}
      </button>
      {open && bestPlay && (
        <div className="absolute right-0 mt-2 z-50 min-w-[260px] max-w-[340px] bg-gradient-to-br from-cyan-950 via-slate-950 to-cyan-900 border border-cyan-700/60 rounded-2xl shadow-2xl p-4 text-[13px] space-y-2 animate-fade-in-2050">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-fuchsia-900/70 to-cyan-800/70 text-white text-[11px] font-bold tracking-widest">OPTION</span>
            <span className="font-extrabold text-cyan-200 tracking-wider text-[15px] uppercase">{bestPlay.direction}</span>
            <span className="font-mono text-fuchsia-200 text-[14px]">{bestPlay.strike}</span>
            <span className="font-mono text-amber-200 text-[13px]">{bestPlay.expiration}</span>
          </div>
          <div className="flex flex-wrap gap-3 mb-2 items-center justify-between">
            <span className="text-cyan-300 font-mono">Prem: <span className="text-cyan-100">{bestPlay.premium}</span></span>
            <span className="text-lime-300 font-mono">RR: <span className="text-lime-100">{bestPlay.rr}</span></span>
            <span className="text-amber-300 font-mono">Prob: <span className="text-amber-100">{bestPlay.score ?? '--'}%</span></span>
          </div>
          <div className="flex flex-wrap gap-3 mb-2 items-center justify-between">
            <span className="text-fuchsia-300 font-mono">PT: <span className="text-fuchsia-100">{bestPlay.target !== undefined && bestPlay.target !== null && bestPlay.target !== '' ? bestPlay.target : '--'}</span></span>
            <span className="text-red-300 font-mono">Stop: <span className="text-red-100">{bestPlay.stop !== undefined && bestPlay.stop !== null && bestPlay.stop !== '' ? bestPlay.stop : '--'}</span></span>
          </div>
          <div className="flex flex-wrap gap-3 mb-2 items-center justify-between">
            {bestPlay.delta !== undefined && <span className="text-cyan-200 font-mono">Delta: <span className="text-cyan-100">{bestPlay.delta}</span></span>}
            {bestPlay.gamma !== undefined && <span className="text-lime-200 font-mono">Gamma: <span className="text-lime-100">{bestPlay.gamma}</span></span>}
            {bestPlay.theta !== undefined && <span className="text-amber-200 font-mono">Theta: <span className="text-amber-100">{bestPlay.theta}</span></span>}
            {bestPlay.vega !== undefined && <span className="text-fuchsia-200 font-mono">Vega: <span className="text-fuchsia-100">{bestPlay.vega}</span></span>}
            {bestPlay.confidence !== undefined && <span className="text-lime-200 font-mono">Conf: <span className="text-lime-100">{bestPlay.confidence}</span></span>}
          </div>
          {bestPlay.reasons && bestPlay.reasons.length > 0 && (
            <ul className="mt-1 ml-2 list-disc text-cyan-200/80">
              {bestPlay.reasons.map((r: string, j: number) => (
                <li key={j} className="italic font-light text-[11px]">{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <style>{`
        .animate-fade-in-2050 {
          animation: fadeIn2050 0.5s cubic-bezier(.4,0,.2,1);
        }
        @keyframes fadeIn2050 {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}
