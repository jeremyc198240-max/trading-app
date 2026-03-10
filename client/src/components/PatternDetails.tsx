import React, { useState } from "react";

export function PatternDetails({ patterns }: { patterns: any[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        className="w-full text-[11px] font-bold text-cyan-100 bg-gradient-to-r from-cyan-500/20 via-indigo-500/15 to-violet-500/20 rounded-lg px-2 py-1 border border-cyan-400/35 shadow-[0_0_14px_rgba(34,211,238,0.22)] hover:border-cyan-300/60 transition"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide Pattern Details" : "Show Pattern Details"}
      </button>
      {open && (
        <div className="mt-1 rounded-xl p-2 text-[10px] space-y-1 border border-cyan-400/35 bg-gradient-to-b from-[#071021]/90 to-[#09162c]/80 shadow-[0_0_18px_rgba(34,211,238,0.18)]">
          {patterns.map((pat, i) => (
            <div key={i} className="border-b border-cyan-500/20 last:border-b-0 pb-1 mb-1 last:mb-0 last:pb-0">
              <div className="font-bold text-cyan-200 mb-0.5 tracking-wide">{pat.name || pat.type || "Pattern"}</div>
              {pat.bos && <div className="text-emerald-300 font-semibold">BOS: {String(pat.bos)}</div>}
              {pat.choch && <div className="text-amber-300 font-semibold">CHOCH: {String(pat.choch)}</div>}
              {Object.entries(pat).map(([k, v]) =>
                k !== "name" && k !== "type" && k !== "bos" && k !== "choch" ? (
                  <div key={k} className="flex justify-between">
                    <span className="text-cyan-100/70 font-semibold uppercase tracking-wide">{k}</span>
                    <span className="font-mono text-cyan-100">{String(v)}</span>
                  </div>
                ) : null
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}