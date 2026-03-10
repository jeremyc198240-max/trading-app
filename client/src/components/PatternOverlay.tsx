import type { DrawablePattern, PatternLifecycle } from "@shared/schema";

interface PatternOverlayProps {
  patterns: DrawablePattern[];
  xScale: (index: number) => number;
  yScale: (price: number) => number;
  chartWidth: number;
  chartHeight: number;
}

const TYPE_COLORS: Record<string, { stroke: string; fill: string }> = {
  bullish: { stroke: "#10b981", fill: "rgba(16, 185, 129, 0.12)" },
  bearish: { stroke: "#ef4444", fill: "rgba(239, 68, 68, 0.12)" },
  neutral: { stroke: "#f59e0b", fill: "rgba(245, 158, 11, 0.08)" },
};

function getLifecycleStyle(lifecycle: PatternLifecycle) {
  switch (lifecycle) {
    case "forming":
      return { dashArray: "6 4", opacity: 0.7, className: "" };
    case "valid":
      return { dashArray: "none", opacity: 1, className: "" };
    case "breaking":
      return { dashArray: "none", opacity: 1, className: "pattern-pulsing" };
    case "failed":
      return { dashArray: "4 3", opacity: 0.35, className: "" };
    case "expired":
      return { dashArray: "3 3", opacity: 0.2, className: "" };
    default:
      return { dashArray: "none", opacity: 0.8, className: "" };
  }
}

function getLifecycleStroke(lifecycle: PatternLifecycle, baseColor: string): string {
  if (lifecycle === "failed") return "#6b7280";
  if (lifecycle === "expired") return "#9ca3af";
  return baseColor;
}

function lifecycleBadge(lifecycle: PatternLifecycle): string {
  switch (lifecycle) {
    case "forming": return "FORMING";
    case "valid": return "ACTIVE";
    case "breaking": return "BREAKING";
    case "failed": return "FAILED";
    case "expired": return "EXPIRED";
    default: return "";
  }
}

function isValid(n: number): boolean {
  return typeof n === "number" && !isNaN(n) && isFinite(n);
}

function renderPatternFormation(
  pattern: DrawablePattern,
  xScale: (index: number) => number,
  yScale: (price: number) => number,
) {
  const colors = TYPE_COLORS[pattern.type] || TYPE_COLORS.neutral;
  const lifecycleStyle = getLifecycleStyle(pattern.lifecycle);
  const strokeColor = getLifecycleStroke(pattern.lifecycle, colors.stroke);

  const elements: JSX.Element[] = [];

  if (pattern.geometry.lines.length >= 2) {
    const line1 = pattern.geometry.lines[0];
    const line2 = pattern.geometry.lines[1];

    const pts = [
      { x: xScale(line1.start.x), y: yScale(line1.start.y) },
      { x: xScale(line1.end.x), y: yScale(line1.end.y) },
      { x: xScale(line2.end.x), y: yScale(line2.end.y) },
      { x: xScale(line2.start.x), y: yScale(line2.start.y) },
    ].filter(p => isValid(p.x) && isValid(p.y));

    if (pts.length === 4) {
      const pathD = `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y} L ${pts[2].x},${pts[2].y} L ${pts[3].x},${pts[3].y} Z`;
      elements.push(
        <path
          key={`${pattern.id}-zone`}
          d={pathD}
          fill={colors.fill}
          stroke="none"
        />
      );
    }
  }

  pattern.geometry.lines.forEach((line, i) => {
    const x1 = xScale(line.start.x);
    const y1 = yScale(line.start.y);
    const x2 = xScale(line.end.x);
    const y2 = yScale(line.end.y);

    if (!isValid(x1) || !isValid(y1) || !isValid(x2) || !isValid(y2)) return;

    elements.push(
      <line
        key={`${pattern.id}-line-${i}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={strokeColor}
        strokeWidth={line.style === "dashed" ? 1 : 2}
        strokeDasharray={
          line.style === "dashed"
            ? "4 3"
            : lifecycleStyle.dashArray
        }
        strokeLinecap="round"
      />
    );
  });

  pattern.geometry.points
    .filter((_, i) => i < 8)
    .forEach((point, i) => {
      const cx = xScale(point.x);
      const cy = yScale(point.y);
      if (!isValid(cx) || !isValid(cy)) return;

      elements.push(
        <circle
          key={`${pattern.id}-pt-outer-${i}`}
          cx={cx}
          cy={cy}
          r={4.5}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1}
          opacity={0.4}
        />
      );

      elements.push(
        <circle
          key={`${pattern.id}-pt-${i}`}
          cx={cx}
          cy={cy}
          r={3}
          fill={strokeColor}
          stroke="hsl(var(--background))"
          strokeWidth={1.5}
        />
      );

      if (point.label) {
        elements.push(
          <text
            key={`${pattern.id}-ptlbl-${i}`}
            x={cx}
            y={cy - 10}
            textAnchor="middle"
            fill={strokeColor}
            fontSize={8}
            fontWeight={600}
            fontFamily="Inter, sans-serif"
          >
            {point.label}
          </text>
        );
      }
    });

  if (pattern.geometry.breakoutLevel !== null) {
    const bx1 = xScale(pattern.startIndex);
    const bx2 = xScale(Math.min(pattern.endIndex + 10, pattern.endIndex + 20));
    const by = yScale(pattern.geometry.breakoutLevel);
    if (isValid(bx1) && isValid(bx2) && isValid(by)) {
      elements.push(
        <line
          key={`${pattern.id}-breakout`}
          x1={bx1}
          y1={by}
          x2={bx2}
          y2={by}
          stroke={pattern.type === "bullish" ? "#10b981" : "#ef4444"}
          strokeWidth={1.5}
          strokeDasharray="6 3"
          opacity={0.7}
        />
      );
      elements.push(
        <text
          key={`${pattern.id}-breakout-lbl`}
          x={bx2 + 4}
          y={by + 3}
          fill={pattern.type === "bullish" ? "#10b981" : "#ef4444"}
          fontSize={8}
          fontWeight={500}
          fontFamily="JetBrains Mono, monospace"
          opacity={0.8}
        >
          ${pattern.geometry.breakoutLevel.toFixed(2)}
        </text>
      );
    }
  }

  if (pattern.geometry.invalidationLevel !== null) {
    const ix1 = xScale(pattern.startIndex);
    const ix2 = xScale(Math.min(pattern.endIndex + 10, pattern.endIndex + 20));
    const iy = yScale(pattern.geometry.invalidationLevel);
    if (isValid(ix1) && isValid(ix2) && isValid(iy)) {
      elements.push(
        <line
          key={`${pattern.id}-invalidation`}
          x1={ix1}
          y1={iy}
          x2={ix2}
          y2={iy}
          stroke="#ef4444"
          strokeWidth={1}
          strokeDasharray="2 2"
          opacity={0.5}
        />
      );
    }
  }

  const labelX = xScale(Math.floor((pattern.startIndex + pattern.endIndex) / 2));
  const maxY = Math.max(
    ...pattern.geometry.points.map((p) => p.y),
    pattern.geometry.breakoutLevel ?? 0
  );
  const labelY = yScale(maxY) - 18;
  if (isValid(labelX) && isValid(labelY)) {
    const badgeText = lifecycleBadge(pattern.lifecycle);
    const badgeWidth = badgeText.length * 5.5 + 10;
    const nameWidth = pattern.name.length * 5 + 10;
    const totalWidth = nameWidth + badgeWidth + 6;

    elements.push(
      <rect
        key={`${pattern.id}-label-bg`}
        x={labelX - totalWidth / 2}
        y={labelY - 8}
        width={totalWidth}
        height={16}
        rx={4}
        fill="hsl(var(--card))"
        stroke={strokeColor}
        strokeWidth={0.5}
        opacity={0.9}
      />
    );

    elements.push(
      <text
        key={`${pattern.id}-label`}
        x={labelX - totalWidth / 2 + nameWidth / 2 + 2}
        y={labelY + 3}
        textAnchor="middle"
        fill={strokeColor}
        fontSize={9}
        fontWeight={700}
        fontFamily="Inter, sans-serif"
        data-testid={`pattern-label-${pattern.id}`}
      >
        {pattern.name}
      </text>
    );

    elements.push(
      <rect
        key={`${pattern.id}-badge-bg`}
        x={labelX - totalWidth / 2 + nameWidth + 4}
        y={labelY - 5}
        width={badgeWidth}
        height={11}
        rx={3}
        fill={strokeColor}
        opacity={0.2}
      />
    );

    elements.push(
      <text
        key={`${pattern.id}-badge`}
        x={labelX - totalWidth / 2 + nameWidth + 4 + badgeWidth / 2}
        y={labelY + 3}
        textAnchor="middle"
        fill={strokeColor}
        fontSize={7}
        fontWeight={700}
        fontFamily="Inter, sans-serif"
        letterSpacing="0.5"
      >
        {badgeText}
      </text>
    );
  }

  return (
    <g
      key={pattern.id}
      data-testid={`pattern-overlay-${pattern.id}`}
      opacity={lifecycleStyle.opacity}
      className={lifecycleStyle.className}
    >
      {elements}
    </g>
  );
}

export function PatternOverlayRenderer({
  patterns,
  xScale,
  yScale,
  chartWidth,
  chartHeight,
}: PatternOverlayProps) {
  const visiblePatterns = patterns
    .filter((p) => p.lifecycle !== "expired" || p.confidence >= 75)
    .slice(0, 10);

  if (visiblePatterns.length === 0) return null;

  return (
    <g data-testid="pattern-overlay-group">
      {visiblePatterns.map((pattern) =>
        renderPatternFormation(pattern, xScale, yScale)
      )}
    </g>
  );
}

export function PatternLegend({ patterns }: { patterns: DrawablePattern[] }) {
  const active = patterns.filter((p) => p.lifecycle !== "expired");
  if (active.length === 0) return null;

  const lifecycleLabels: Record<PatternLifecycle, string> = {
    forming: "Forming",
    valid: "Active",
    breaking: "Breaking",
    failed: "Failed",
    expired: "Expired",
  };

  const lifecycleDot: Record<PatternLifecycle, string> = {
    forming: "bg-amber-400",
    valid: "bg-emerald-400",
    breaking: "bg-cyan-400 animate-pulse",
    failed: "bg-gray-400",
    expired: "bg-gray-500",
  };

  return (
    <div
      className="flex items-center gap-3 flex-wrap"
      data-testid="pattern-legend"
    >
      {active.slice(0, 6).map((p) => {
        const colors = TYPE_COLORS[p.type] || TYPE_COLORS.neutral;
        const strokeColor = getLifecycleStroke(p.lifecycle, colors.stroke);
        return (
          <div
            key={p.id}
            className="flex items-center gap-1.5 text-xs"
            data-testid={`pattern-legend-${p.id}`}
          >
            <span
              className={`w-2 h-2 rounded-full ${lifecycleDot[p.lifecycle] || ""}`}
              style={{ backgroundColor: lifecycleDot[p.lifecycle] ? undefined : strokeColor }}
            />
            <span className="text-muted-foreground text-[10px]">
              <span style={{ color: strokeColor }} className="font-semibold">{p.name}</span>
              <span className="ml-1 opacity-60">
                ({lifecycleLabels[p.lifecycle]})
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
