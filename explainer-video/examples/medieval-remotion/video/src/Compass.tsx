import React from "react";
import {random, useCurrentFrame} from "remotion";
import {C, FELL, FELL_SC} from "./style";

// The Humoral Compass: up = hot, down = cold, left = moist, right = dry.
// Corners: blood (hot+moist), yellow bile (hot+dry), black bile (cold+dry), phlegm (cold+moist).
export const HUMOURS = [
  {key: "blood", name: "Blood", q: "hot & moist", color: C.red, sx: -1, sy: 1},
  {key: "yellow", name: "Yellow bile", q: "hot & dry", color: C.gold, sx: 1, sy: 1},
  {key: "black", name: "Black bile", q: "cold & dry", color: C.black, sx: 1, sy: -1},
  {key: "phlegm", name: "Phlegm", q: "cold & moist", color: C.blue, sx: -1, sy: -1},
];

export type Push = {label: string; dx: number; dy: number; o: number; color?: string};

export type CompassProps = {
  cx: number; cy: number; size: number;
  o?: number; // overall opacity
  axes?: number; // 0..1 axis reveal
  corners?: number[]; // 0..1 per humour: quadrant + flask reveal
  fills?: number[]; // 0..1 flask fill level per humour
  point?: number; // 0..1 point visibility
  px?: number; py?: number; // point position, -1..1 (x: moist→dry, y: cold→hot)
  frost?: number; heat?: number; mist?: number; bloom?: number;
  pushes?: Push[]; // arrows aimed at the point
  ring?: number; // the "balance" ring around the middle
  you?: number; // the "you" label
  tremble?: number;
  showQualities?: number; // the "hot & moist" sub-labels
};

const Flask: React.FC<{x: number; y: number; color: string; fill: number; s?: number; id: string}> = ({x, y, color, fill, s = 1, id}) => {
  // round-bottomed flask, 0..1 fill
  const body = "M -14 -46 L -14 -20 C -40 -10 -46 30 -24 46 C -10 56 10 56 24 46 C 46 30 40 -10 14 -20 L 14 -46 Z";
  const top = -20 - 2;
  const bottom = 54;
  const level = bottom - (bottom - top) * fill;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <defs><clipPath id={`fl-${id}`}><path d={body} /></clipPath></defs>
      <rect x={-50} y={level} width={100} height={bottom - level + 4} fill={color} opacity={0.88} clipPath={`url(#fl-${id})`} />
      <path d={body} fill="none" stroke={C.ink} strokeWidth={3.2} />
      <rect x={-18} y={-54} width={36} height={9} rx={3} fill="#8a6a3c" stroke={C.ink} strokeWidth={2.5} />
      <path d="M -8 -10 C -20 -2 -24 14 -20 26" stroke="#fff" strokeOpacity={0.45} strokeWidth={4} fill="none" strokeLinecap="round" />
    </g>
  );
};

export const Compass: React.FC<CompassProps> = (p) => {
  const frame = useCurrentFrame();
  const {cx, cy, size} = p;
  const o = p.o ?? 1;
  if (o <= 0) return null;
  const half = size / 2;
  const axes = p.axes ?? 1;
  const corners = p.corners ?? [1, 1, 1, 1];
  const fills = p.fills ?? [1, 1, 1, 1];
  const tr = p.tremble ?? 0;
  const jx = tr * 6 * Math.sin(frame * 1.7);
  const jy = tr * 6 * Math.cos(frame * 2.3);
  const PX = cx + (p.px ?? 0) * half * 0.38 + jx; // extremes stop between the centre and the flasks
  const PY = cy - (p.py ?? 0) * half * 0.38 + jy;
  const point = p.point ?? 0;
  const frost = p.frost ?? 0, heat = p.heat ?? 0, mist = p.mist ?? 0, bloom = p.bloom ?? 0;
  const q = p.showQualities ?? 1;

  return (
    <svg width={1920} height={1080} style={{position: "absolute", left: 0, top: 0, opacity: o}}>
      <defs>
        <radialGradient id="glow"><stop offset="0%" stopColor={C.goldLight} stopOpacity={0.9} /><stop offset="100%" stopColor={C.goldLight} stopOpacity={0} /></radialGradient>
        <radialGradient id="heat"><stop offset="0%" stopColor="#E0661E" stopOpacity={0.55} /><stop offset="100%" stopColor="#E0661E" stopOpacity={0} /></radialGradient>
        <radialGradient id="frost"><stop offset="0%" stopColor="#9CC3E6" stopOpacity={0.6} /><stop offset="100%" stopColor="#9CC3E6" stopOpacity={0} /></radialGradient>
        <filter id="mistblur"><feGaussianBlur stdDeviation={18} /></filter>
        <marker id="arrowhead" markerWidth={10} markerHeight={10} refX={6} refY={5} orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={C.ink} /></marker>
      </defs>

      {/* quadrants */}
      {HUMOURS.map((h, i) => {
        const c = corners[i];
        if (c <= 0) return null;
        const x = h.sx > 0 ? cx : cx - half;
        const y = h.sy > 0 ? cy - half : cy;
        return <rect key={h.key} x={x} y={y} width={half} height={half} fill={h.color} opacity={0.1 * c} />;
      })}

      {/* atmosphere */}
      {heat > 0 && <circle cx={cx + half * 0.55} cy={cy - half * 0.55} r={half * 1.0} fill="url(#heat)" opacity={heat} />}
      {frost > 0 && <rect x={cx - half} y={cy} width={size} height={half} fill="url(#frost)" opacity={frost} />}
      {frost > 0 && Array.from({length: 18}).map((_, i) => {
        const x = cx - half + random(`fx${i}`) * size;
        const y = cy + random(`fy${i}`) * half;
        const r = 8 + random(`fr${i}`) * 16;
        return <g key={i} opacity={frost * 0.8} stroke="#6E9CC8" strokeWidth={2}>
          {[0, 60, 120].map((a) => <line key={a} x1={x - r * Math.cos(a * Math.PI / 180)} y1={y - r * Math.sin(a * Math.PI / 180)} x2={x + r * Math.cos(a * Math.PI / 180)} y2={y + r * Math.sin(a * Math.PI / 180)} />)}
        </g>;
      })}
      {mist > 0 && <g filter="url(#mistblur)" opacity={mist * 0.75}>
        {Array.from({length: 7}).map((_, i) => (
          <ellipse key={i} cx={cx + half * (0.1 + 0.8 * random(`mx${i}`)) + 30 * Math.sin(frame / 40 + i)} cy={cy + half * (0.15 + 0.75 * random(`my${i}`))} rx={90 + 60 * random(`mr${i}`)} ry={50 + 30 * random(`mq${i}`)} fill={C.black} />
        ))}
      </g>}

      {/* frame + axes */}
      <rect x={cx - half} y={cy - half} width={size} height={size} fill="none" stroke={C.ink} strokeWidth={3} opacity={axes} />
      <rect x={cx - half + 10} y={cy - half + 10} width={size - 20} height={size - 20} fill="none" stroke={C.gold} strokeWidth={1.5} opacity={axes * 0.8} />
      <line x1={cx} x2={cx} y1={cy - half * axes} y2={cy + half * axes} stroke={C.ink} strokeWidth={2} strokeDasharray="10 8" />
      <line y1={cy} y2={cy} x1={cx - half * axes} x2={cx + half * axes} stroke={C.ink} strokeWidth={2} strokeDasharray="10 8" />
      <g fontFamily={FELL_SC} fontSize={30} fill={C.ink} opacity={axes} textAnchor="middle">
        <text x={cx} y={cy - half - 22}>hot</text>
        <text x={cx} y={cy + half + 44}>cold</text>
        <text x={cx - half - 22} y={cy + 10} textAnchor="end">moist</text>
        <text x={cx + half + 22} y={cy + 10} textAnchor="start">dry</text>
      </g>

      {/* flasks + names */}
      {HUMOURS.map((h, i) => {
        const c = corners[i];
        if (c <= 0) return null;
        const fx = cx + h.sx * half * 0.62;
        const fy = cy - h.sy * half * 0.6;
        return (
          <g key={h.key} opacity={c} transform={`translate(0, ${(1 - c) * 20})`}>
            <Flask x={fx} y={fy - 16} color={h.color} fill={fills[i]} s={size / 620} id={h.key} />
            <text x={fx} y={fy + 64 * (size / 620)} textAnchor="middle" fontFamily={FELL} fontSize={Math.max(30, Math.round(30 * size / 620))} fill={h.color === C.gold ? "#8A6014" : h.color}>{h.name}</text>
            <text x={fx} y={fy + 92 * (size / 620)} textAnchor="middle" fontFamily={FELL} fontStyle="italic" fontSize={Math.max(24, Math.round(22 * size / 620))} fill={C.inkSoft} opacity={q}>{h.q}</text>
          </g>
        );
      })}

      {/* balance ring */}
      {(p.ring ?? 0) > 0 && <circle cx={cx} cy={cy} r={half * 0.2} fill="none" stroke={C.green} strokeWidth={3} strokeDasharray="6 7" opacity={p.ring} />}

      {/* pushes */}
      {(p.pushes ?? []).map((u, i) => {
        if (u.o <= 0) return null;
        const len = Math.hypot(u.dx, u.dy) || 1;
        const ux = u.dx / len, uy = -u.dy / len;
        const sx = PX - ux * 250, sy = PY - uy * 250;
        const ex = PX - ux * 46, ey = PY - uy * 46;
        return (
          <g key={i} opacity={u.o}>
            <line x1={sx} y1={sy} x2={sx + (ex - sx) * u.o} y2={sy + (ey - sy) * u.o} stroke={u.color ?? C.ink} strokeWidth={5} markerEnd="url(#arrowhead)" />
            <text x={sx - ux * 18} y={sy - uy * 18 + 10} textAnchor="middle" fontFamily={FELL_SC} fontSize={36} fill={u.color ?? C.ink} stroke={C.vellum} strokeWidth={6} paintOrder="stroke">{u.label}</text>
          </g>
        );
      })}

      {/* the point: you */}
      {point > 0 && (
        <g opacity={point}>
          <circle cx={PX} cy={PY} r={48 + 4 * Math.sin(frame / 8)} fill="url(#glow)" />
          <circle cx={PX} cy={PY} r={15 * point} fill={C.gold} stroke={C.ink} strokeWidth={3} />
          {bloom > 0 && Array.from({length: 8}).map((_, i) => {
            const a = (i / 8) * Math.PI * 2 + frame / 90;
            return <ellipse key={i} cx={PX + Math.cos(a) * 30 * bloom} cy={PY + Math.sin(a) * 30 * bloom} rx={16 * bloom} ry={8 * bloom} transform={`rotate(${(a * 180) / Math.PI}, ${PX + Math.cos(a) * 30 * bloom}, ${PY + Math.sin(a) * 30 * bloom})`} fill={C.green} opacity={0.75} />;
          })}
          {(p.you ?? 0) > 0 && <text x={PX} y={PY - 30} textAnchor="middle" fontFamily={FELL_SC} fontSize={30} fill={C.ink} opacity={p.you} stroke={C.vellum} strokeWidth={6} paintOrder="stroke">you</text>}
        </g>
      )}
    </svg>
  );
};
