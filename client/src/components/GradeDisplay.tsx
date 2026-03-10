import type { Grade } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Sparkles, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface GradeDisplayProps {
  grade: Grade;
  overall: number;
  setupQuality: "strong" | "medium" | "weak";
}

const gradeConfig: Record<Grade, { 
  color: string; 
  bgColor: string; 
  borderColor: string;
  gradient: string;
  glowColor: string;
  label: string;
  description: string;
}> = {
  A: { 
    color: "text-emerald-400", 
    bgColor: "bg-emerald-500/10", 
    borderColor: "border-emerald-500/50",
    gradient: "from-emerald-500 via-teal-400 to-cyan-400",
    glowColor: "shadow-emerald-500/30",
    label: "Excellent",
    description: "Strong setup detected"
  },
  B: { 
    color: "text-cyan-400", 
    bgColor: "bg-cyan-500/10", 
    borderColor: "border-cyan-500/50",
    gradient: "from-cyan-500 via-blue-400 to-indigo-400",
    glowColor: "shadow-cyan-500/30",
    label: "Good",
    description: "Favorable conditions"
  },
  C: { 
    color: "text-amber-400", 
    bgColor: "bg-amber-500/10", 
    borderColor: "border-amber-500/50",
    gradient: "from-amber-500 via-yellow-400 to-orange-400",
    glowColor: "shadow-amber-500/30",
    label: "Neutral",
    description: "Mixed signals"
  },
  D: { 
    color: "text-orange-400", 
    bgColor: "bg-orange-500/10", 
    borderColor: "border-orange-500/50",
    gradient: "from-orange-500 via-red-400 to-rose-400",
    glowColor: "shadow-orange-500/30",
    label: "Weak",
    description: "Caution advised"
  },
  F: { 
    color: "text-red-400", 
    bgColor: "bg-red-500/10", 
    borderColor: "border-red-500/50",
    gradient: "from-red-500 via-rose-400 to-pink-400",
    glowColor: "shadow-red-500/30",
    label: "Poor",
    description: "Avoid this setup"
  },
};

export function GradeDisplay({ grade, overall, setupQuality }: GradeDisplayProps) {
  const config = gradeConfig[grade];
  const percentage = overall / 100;
  const circumference = 2 * Math.PI * 56;
  const strokeDashoffset = circumference * (1 - percentage);

  const QualityIcon = setupQuality === "strong" ? TrendingUp : setupQuality === "weak" ? TrendingDown : Minus;
  const qualityColor = setupQuality === "strong" ? "text-emerald-400" : setupQuality === "weak" ? "text-red-400" : "text-amber-400";

  return (
    <div className="flex flex-col items-center gap-5 p-4" data-testid="display-grade">
      <div className="relative">
        <svg className="w-36 h-36 -rotate-90" viewBox="0 0 128 128">
          <circle
            cx="64"
            cy="64"
            r="56"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className="text-muted/30"
          />
          <circle
            cx="64"
            cy="64"
            r="56"
            stroke="url(#gradeGradient)"
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
          <defs>
            <linearGradient id="gradeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" className={`${
                grade === 'A' ? 'text-emerald-500' : 
                grade === 'B' ? 'text-cyan-500' : 
                grade === 'C' ? 'text-amber-500' : 
                grade === 'D' ? 'text-orange-500' : 'text-red-500'
              }`} stopColor="currentColor" />
              <stop offset="100%" className={`${
                grade === 'A' ? 'text-teal-400' : 
                grade === 'B' ? 'text-blue-400' : 
                grade === 'C' ? 'text-yellow-400' : 
                grade === 'D' ? 'text-red-400' : 'text-rose-400'
              }`} stopColor="currentColor" />
            </linearGradient>
          </defs>
        </svg>
        
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={cn(
            "w-24 h-24 rounded-full flex items-center justify-center",
            config.bgColor,
            "border-2",
            config.borderColor,
            "shadow-lg",
            config.glowColor
          )}>
            <span
              className={cn(
                "text-5xl font-black",
                config.color
              )}
              data-testid="text-grade-letter"
            >
              {grade}
            </span>
          </div>
        </div>
      </div>

      <div className="text-center space-y-2">
        <div className="flex items-baseline gap-1 justify-center">
          <span
            className="text-4xl font-mono font-black"
            data-testid="text-overall-score"
          >
            {overall}
          </span>
          <span className="text-lg text-muted-foreground font-medium">/100</span>
        </div>
        
        <div className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg",
          config.bgColor,
          "border",
          config.borderColor
        )}>
          <Sparkles className={cn("w-4 h-4", config.color)} />
          <span className={cn("text-sm font-semibold", config.color)} data-testid="text-setup-quality">
            {config.label}
          </span>
        </div>
        
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <QualityIcon className={cn("w-3 h-3", qualityColor)} />
          <span className="uppercase tracking-wider">{setupQuality} quality</span>
        </div>
        
        <p className="text-xs text-muted-foreground/70">{config.description}</p>
      </div>
    </div>
  );
}
