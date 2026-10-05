import React from "react";
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from "remotion";
import aspects from "../public/art/art.json";
import {lerp, prog} from "./kit";
import {C, FELL_SC, FRAKTUR} from "./style";

// One emblem per chapter, in drawer order. Slot i belongs to chapter i+1 (chapter 0 is the hook).
export const EMBLEMS = ["books", "reliquary", "ant", "letter", "saffron", "ferret", "lute", "candle", "hourglass", "flower"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

const COLS = 5;
export const cabinetGeom = (cx: number, cy: number, w: number) => {
  const pad = w * 0.05;
  const cell = (w - pad * 2) / COLS;
  const bodyH = cell * 2 + pad * 2;
  const top = cy - bodyH / 2;
  const left = cx - w / 2;
  const cellAt = (i: number) => ({x: left + pad + (i % COLS) * cell + cell / 2, y: top + pad + Math.floor(i / COLS) * cell + cell / 2, size: cell});
  return {pad, cell, bodyH, top, left, cellAt};
};

const ItemImg: React.FC<{name: string; x: number; y: number; box: number; o?: number; rot?: number}> = ({name, x, y, box, o = 1, rot = 0}) => {
  const a = (aspects as Record<string, number>)[name] ?? 1;
  const w = a >= 1 ? box : box * a;
  const h = a >= 1 ? box / a : box;
  return <Img src={staticFile(`art/${name}.png`)} style={{position: "absolute", left: x - w / 2, top: y - h / 2, width: w, height: h, mixBlendMode: "multiply", opacity: o, transform: `rotate(${rot}deg)`}} />;
};

type Props = {
  cx?: number; cy?: number; w?: number;
  filled: number; // slots 0..filled-1 already hold their emblems
  arriving?: {slot: number; at: number; fromX?: number; fromY?: number; fromBox?: number}; // emblem flying in
  glow?: {slot: number; at: number};
  removed?: number[]; // slots shown lifted out (finale)
  o?: number;
  doors?: number; // 0 open .. 1 closed
};

export const Cabinet: React.FC<Props> = ({cx = 960, cy = 420, w = 1040, filled, arriving, glow, removed = [], o = 1, doors = 0}) => {
  const frame = useCurrentFrame();
  const g = cabinetGeom(cx, cy, w);
  const crestH = w * 0.09;
  return (
    <AbsoluteFill style={{opacity: o}}>
      <svg width={1920} height={1080} style={{position: "absolute"}}>
        <defs>
          <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6B4426" /><stop offset="45%" stopColor="#4E2F18" /><stop offset="100%" stopColor="#3A2010" />
          </linearGradient>
          <pattern id="grain" width="140" height="14" patternUnits="userSpaceOnUse">
            <path d="M0 7 C 35 3, 70 11, 140 7" stroke="#2A160A" strokeOpacity={0.35} strokeWidth={1.2} fill="none" />
          </pattern>
          <linearGradient id="lining" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#D9C9A4" /><stop offset="22%" stopColor="#EFE4C9" /></linearGradient>
          <radialGradient id="cellglow"><stop offset="0%" stopColor={C.goldLight} stopOpacity={0.85} /><stop offset="100%" stopColor={C.goldLight} stopOpacity={0} /></radialGradient>
        </defs>
        {/* shadow */}
        <rect x={g.left + 18} y={g.top + 26} width={w} height={g.bodyH} fill="rgba(40,20,5,0.35)" filter="blur(18px)" style={{filter: "blur(16px)"}} />
        {/* crest */}
        <path d={`M ${g.left + w * 0.08} ${g.top} Q ${cx} ${g.top - crestH * 2.1} ${g.left + w * 0.92} ${g.top} Z`} fill="url(#wood)" stroke={C.gold} strokeWidth={4} />
        <path d={`M ${g.left + w * 0.2} ${g.top - 8} Q ${cx} ${g.top - crestH * 1.6} ${g.left + w * 0.8} ${g.top - 8}`} fill="none" stroke={C.gold} strokeWidth={2} strokeDasharray="2 10" strokeLinecap="round" />
        <circle cx={cx} cy={g.top - crestH * 0.62} r={w * 0.022} fill={C.gold} stroke="#7a5512" strokeWidth={2} />
        {/* body */}
        <rect x={g.left} y={g.top} width={w} height={g.bodyH} rx={6} fill="url(#wood)" />
        <rect x={g.left} y={g.top} width={w} height={g.bodyH} rx={6} fill="url(#grain)" />
        <rect x={g.left + 6} y={g.top + 6} width={w - 12} height={g.bodyH - 12} rx={4} fill="none" stroke={C.gold} strokeWidth={3} />
        {/* feet */}
        {[0.06, 0.94].map((fx) => <rect key={fx} x={g.left + w * fx - 26} y={g.top + g.bodyH} width={52} height={26} rx={6} fill="#3A2010" />)}
        {/* cells */}
        {Array.from({length: 10}).map((_, i) => {
          const c = g.cellAt(i);
          const s = c.size - 18;
          return (
            <g key={i}>
              <rect x={c.x - s / 2} y={c.y - s / 2} width={s} height={s} fill="url(#lining)" stroke="#2A160A" strokeWidth={3} />
              <rect x={c.x - s / 2 + 3} y={c.y - s / 2 + 3} width={s - 6} height={s - 6} fill="none" stroke={C.gold} strokeOpacity={0.6} strokeWidth={1.2} />
              <text x={c.x} y={c.y + s / 2 - 8} textAnchor="middle" fontFamily={FELL_SC} fontSize={c.size * 0.11} fill={C.inkSoft} opacity={0.75}>{ROMAN[i]}</text>
            </g>
          );
        })}
        {glow && frame >= glow.at && (() => {
          const c = g.cellAt(glow.slot);
          const p = prog(frame, glow.at, 20) * (0.75 + 0.25 * Math.sin((frame - glow.at) / 6));
          return <circle cx={c.x} cy={c.y} r={c.size * 0.75} fill="url(#cellglow)" opacity={p} />;
        })()}
      </svg>
      {/* emblems in place */}
      {EMBLEMS.slice(0, filled).map((n, i) => {
        if (removed.includes(i)) return null;
        const c = g.cellAt(i);
        return <ItemImg key={n} name={n} x={c.x} y={c.y - c.size * 0.04} box={c.size * 0.62} />;
      })}
      {/* arriving emblem */}
      {arriving && frame >= arriving.at && (() => {
        const c = g.cellAt(arriving.slot);
        const p = prog(frame, arriving.at, 34);
        const fx = arriving.fromX ?? cx, fy = arriving.fromY ?? cy - 40, fb = arriving.fromBox ?? 420;
        const arc = Math.sin(p * Math.PI) * -60;
        return <ItemImg name={EMBLEMS[arriving.slot]} x={lerp(fx, c.x, p)} y={lerp(fy, c.y - c.size * 0.04, p) + arc} box={lerp(fb, c.size * 0.62, p)} rot={lerp(-8, 0, p)} />;
      })()}
      {/* doors */}
      {doors > 0 && (
        <svg width={1920} height={1080} style={{position: "absolute"}}>
          {[0, 1].map((side) => {
            const half = w / 2;
            const dw = half * doors;
            const x = side === 0 ? g.left : g.left + w - dw;
            return (
              <g key={side}>
                <rect x={x} y={g.top} width={dw} height={g.bodyH} fill="url(#wood)" stroke={C.gold} strokeWidth={3} />
                <rect x={x} y={g.top} width={dw} height={g.bodyH} fill="url(#grain)" />
                {doors > 0.6 && <rect x={x + 18} y={g.top + 18} width={Math.max(0, dw - 36)} height={g.bodyH - 36} fill="none" stroke={C.gold} strokeWidth={2} opacity={(doors - 0.6) / 0.4} />}
              </g>
            );
          })}
          {doors > 0.95 && <circle cx={cx} cy={g.top + g.bodyH / 2} r={10} fill={C.gold} />}
        </svg>
      )}
    </AbsoluteFill>
  );
};

/** The silent chapter card: last chapter's emblem flies into its drawer, the next drawer glows, the title appears. */
export const DrawerCard: React.FC<{index: number; title: string; len: number}> = ({index, title, len}) => {
  const frame = useCurrentFrame();
  const fadeIn = prog(frame, 0, 14);
  const out = prog(frame, len - 22, 22);
  const prev = index - 2; // slot of the chapter we just finished (chapter 1 has no predecessor)
  const next = index - 1;
  const zoom = lerp(1, 1.6, out);
  const g = cabinetGeom(960, 400, 1000);
  const c = g.cellAt(next);
  return (
    <AbsoluteFill style={{opacity: fadeIn * (1 - out)}}>
      <AbsoluteFill style={{transform: `scale(${zoom})`, transformOrigin: `${c.x}px ${c.y}px`}}>
        <Cabinet cx={960} cy={400} w={1000} filled={Math.max(0, prev)} arriving={prev >= 0 ? {slot: prev, at: 4} : undefined} glow={{slot: next, at: 34}} />
      </AbsoluteFill>
      <div style={{position: "absolute", top: 760, width: 1920, textAlign: "center", opacity: prog(frame, 40, 16) * (1 - out)}}>
        <div style={{fontFamily: FELL_SC, fontSize: 32, letterSpacing: 6, color: C.red}}>Drawer {ROMAN[next]}</div>
        <div style={{fontFamily: FRAKTUR, fontSize: 92, color: C.ink, marginTop: 4}}>{title}</div>
      </div>
    </AbsoluteFill>
  );
};
