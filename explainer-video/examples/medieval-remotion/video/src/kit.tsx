import React from "react";
import {AbsoluteFill, Easing, Img, interpolate, random, staticFile, useCurrentFrame} from "remotion";
import {C, FELL, FELL_I, FELL_SC, FRAKTUR, GARAMOND} from "./style";
import {FPS} from "./timeline";
import aspects from "../public/art/art.json";

// ------------------------------------------------------------------ time helpers
const EASE = Easing.bezier(0.33, 0, 0.2, 1);
/** 0→1 between frame `from` and `from+len`, eased and clamped. */
export const prog = (frame: number, from: number, len = 18, ease = EASE) =>
  interpolate(frame, [from, from + Math.max(1, len)], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease});
/** fade in at `a`, fade out at `b` (b may be Infinity). */
export const life = (frame: number, a: number, b = Infinity, fin = 15, fout = 15) =>
  Math.min(prog(frame, a, fin), b === Infinity ? 1 : 1 - prog(frame, b, fout));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sec = (s: number) => Math.round(s * FPS);
/** glide from value a to value b around frame `at` (instead of snapping) */
export const mv = (frame: number, at: number, a: number, b: number, len = 20) => lerp(a, b, prog(frame, at - len / 2, len));

/** piecewise keyframes: kf(frame, [[f0, v0], [f1, v1], ...]) with easing between keys */
export const kf = (frame: number, keys: [number, number][]) => {
  if (frame <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [f1, v1] = keys[i];
    const [f0, v0] = keys[i - 1];
    if (frame <= f1) return lerp(v0, v1, EASE(Math.min(1, Math.max(0, (frame - f0) / Math.max(1, f1 - f0)))));
  }
  return keys[keys.length - 1][1];
};

// ------------------------------------------------------------------ page
export const Vellum: React.FC<{children?: React.ReactNode; warmth?: number; dark?: number}> = ({children, warmth = 0, dark = 0}) => {
  const frame = useCurrentFrame();
  const flicker = 0.035 * Math.sin(frame / 9.7) + 0.02 * Math.sin(frame / 4.3 + 1.3);
  return (
    <AbsoluteFill style={{backgroundColor: C.vellum}}>
      <Img src={staticFile("vellum.jpg")} style={{position: "absolute", inset: 0, width: "100%", height: "100%"}} />
      {/* warm candle light from the upper left, breathing slightly */}
      <AbsoluteFill style={{background: `radial-gradient(ellipse 80% 70% at 35% 30%, rgba(255,226,160,${0.16 + flicker + warmth * 0.2}) 0%, rgba(255,226,160,0) 70%)`, mixBlendMode: "soft-light"}} />
      <AbsoluteFill style={{background: `radial-gradient(ellipse 75% 75% at 50% 50%, rgba(0,0,0,0) 55%, rgba(60,35,10,${0.28 + dark * 0.4}) 100%)`}} />
      {dark > 0 && <AbsoluteFill style={{backgroundColor: `rgba(20,14,24,${dark * 0.55})`}} />}
      {children}
      <Dust />
    </AbsoluteFill>
  );
};

/** floating motes in the light — deterministic */
export const Dust: React.FC<{n?: number}> = ({n = 26}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{pointerEvents: "none"}}>
      {Array.from({length: n}).map((_, i) => {
        const x0 = random(`dx${i}`) * 1920;
        const y0 = random(`dy${i}`) * 1080;
        const sp = 0.15 + random(`ds${i}`) * 0.35;
        const x = (x0 + frame * sp * 0.6 + 40 * Math.sin(frame / (90 + i * 7) + i)) % 1960;
        const y = (y0 - frame * sp + 2000) % 1100;
        const r = 1.2 + random(`dr${i}`) * 2.2;
        const o = 0.18 + 0.22 * Math.sin(frame / (40 + i) + i * 2);
        // soft edge from a gradient, not filter: blur() — a per-element blur is a GPU layer every frame (slow to capture)
        return <div key={i} style={{position: "absolute", left: x - 1, top: y - 1, width: r * 2 + 2, height: r * 2 + 2, borderRadius: "50%", background: "radial-gradient(circle, #FFF3D6 35%, rgba(255,243,214,0) 70%)", opacity: Math.max(0, o)}} />;
      })}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ illustrations
const ASPECT = aspects as Record<string, number>; // width/height of each cropped illustration (tools/prep_art.py)

type ArtProps = {
  name: string; x: number; y: number; w: number; // centre x,y and width in px
  at: number; // frame the ink starts to appear
  out?: number; // frame it starts to fade
  len?: number; outLen?: number;
  rot?: number; drift?: number; // gentle motion (px over the shot)
  scale?: number; style?: React.CSSProperties; feather?: number; opacity?: number; blend?: boolean;
};
/** NOTE: never wrap Art in a parent with transform/opacity/filter unless that parent also holds what it should blend onto (it isolates mix-blend-mode, and the white paper shows).
 * A generated illustration, inked onto the page: a radial reveal + blur→sharp, multiplied onto the vellum. */
export const Art: React.FC<ArtProps> = ({name, x, y, w, at, out = Infinity, len = 24, outLen = 15, rot = 0, drift = 0, scale = 1, style, feather = 0.8, opacity = 1, blend = true}) => {
  const frame = useCurrentFrame();
  const p = prog(frame, at, len);
  const o = out === Infinity ? 1 : 1 - prog(frame, out, outLen);
  if (frame < at || o <= 0) return null;
  const h = w / (ASPECT[name] ?? 1);
  const a = lerp(0, feather * 100, p);
  const b = lerp(12, 100, p);
  const mask = `radial-gradient(ellipse 50% 50% at 50% 50%, #000 ${a}%, transparent ${b}%)`;
  const dx = drift * prog(frame, at, sec(12), Easing.linear);
  return (
    <Img
      src={staticFile(`art/${name}.png`)}
      style={{
        position: "absolute", left: x - w / 2 + dx, top: y - h / 2, width: w, height: h,
        transform: `rotate(${rot}deg) scale(${scale * lerp(0.97, 1, p)})`,
        mixBlendMode: blend ? "multiply" : undefined, opacity: o * opacity,
        filter: `blur(${lerp(5, 0, p)}px)`,
        WebkitMaskImage: mask, maskImage: mask, ...style,
      }}
    />
  );
};

/** A real manuscript miniature (Codex Manesse), framed in gold, with a slow Ken Burns push. */
export const Mini: React.FC<{name: string; x: number; y: number; h: number; at: number; out?: number; caption?: string; zoom?: [number, number]; pan?: [number, number]; ratio?: number}> = ({name, x, y, h, at, out = Infinity, caption, zoom = [1.0, 1.12], pan = [0, -20], ratio = 0.66}) => {
  const frame = useCurrentFrame();
  const o = life(frame, at, out, 20, 15);
  if (o <= 0) return null;
  const w = h * ratio;
  const t = prog(frame, at, (out === Infinity ? sec(20) : out - at), Easing.linear);
  const z = lerp(zoom[0], zoom[1], t);
  return (
    <div style={{position: "absolute", left: x - w / 2, top: y - h / 2, width: w, height: h, opacity: o, transform: `translateY(${lerp(30, 0, prog(frame, at, 25))}px)`}}>
      <div style={{position: "absolute", inset: -14, border: `3px solid ${C.gold}`, outline: `1px solid ${C.ink}`, outlineOffset: 5, boxShadow: "0 18px 40px rgba(40,20,0,0.35)", background: C.vellumDeep}} />
      <div style={{position: "absolute", inset: 0, overflow: "hidden"}}>
        <Img src={staticFile(`manesse/${name}.jpg`)} style={{width: "100%", height: "100%", objectFit: "cover", transform: `scale(${z}) translate(${pan[0] * t}px, ${pan[1] * t}px)`}} />
      </div>
      {caption && (
        <div style={{position: "absolute", top: h + 30, left: -60, right: -60, textAlign: "center", fontFamily: FELL_I, fontStyle: "italic", fontSize: 24, color: C.inkSoft, lineHeight: 1.25}}>{caption}</div>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ type
export const T: React.FC<{children: React.ReactNode; x: number; y: number; at: number; out?: number; size?: number; color?: string; font?: "fell" | "fellI" | "sc" | "fraktur" | "garamond"; w?: number; align?: "left" | "center" | "right"; style?: React.CSSProperties; rise?: number}> = ({children, x, y, at, out = Infinity, size = 40, color = C.ink, font = "fell", w = 1200, align = "center", style, rise = 14}) => {
  const frame = useCurrentFrame();
  const o = life(frame, at, out, 16, 14);
  if (o <= 0) return null;
  const fam = {fell: FELL, fellI: FELL_I, sc: FELL_SC, fraktur: FRAKTUR, garamond: GARAMOND}[font];
  const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  return (
    <div style={{position: "absolute", left, top: y, width: w, textAlign: align, fontFamily: fam, fontStyle: font === "fellI" ? "italic" : "normal", fontSize: size, color, opacity: o, lineHeight: 1.22, transform: `translateY(${lerp(rise, 0, prog(frame, at, 18))}px)`, filter: `blur(${lerp(3, 0, prog(frame, at, 14))}px)`, ...style}}>
      {children}
    </div>
  );
};

/** A medieval quotation, written word by word across the beat, with its source in rubric red. */
export const Quote: React.FC<{text: string; who: string; s: number; e: number; out?: number; x?: number; y?: number; w?: number; size?: number; align?: "left" | "center"}> = ({text, who, s, e, out = Infinity, x = 960, y = 330, w = 1300, size = 54, align = "center"}) => {
  const frame = useCurrentFrame();
  const o = life(frame, s - 8, out, 14, 16);
  if (o <= 0) return null;
  const words = text.split(" ");
  const total = text.length;
  let acc = 0;
  const span = Math.max(1, e - s) * 0.92;
  return (
    <div style={{position: "absolute", left: x - w / 2, top: y, width: w, opacity: o, textAlign: align}}>
      <div style={{fontFamily: FRAKTUR, fontSize: size * 2.1, color: C.red, lineHeight: 0.6, height: size * 0.9, opacity: prog(frame, s - 8, 14)}}>“</div>
      <div style={{fontFamily: FELL_I, fontStyle: "italic", fontSize: size, color: C.ink, lineHeight: 1.28}}>
        {words.map((wd, i) => {
          const at = s + (acc / total) * span;
          acc += wd.length + 1;
          const p = prog(frame, at - 2, 7);
          return <span key={i} style={{opacity: p, filter: `blur(${lerp(4, 0, p)}px)`, display: "inline-block", marginRight: "0.26em"}}>{wd}</span>;
        })}
      </div>
      <div style={{marginTop: 26, fontFamily: FELL_SC, fontSize: size * 0.52, color: C.red, letterSpacing: 1, opacity: prog(frame, s + 10, 18)}}>— {who}</div>
    </div>
  );
};

/** where & when, top-left, like a marginal note */
export const Note: React.FC<{place: string; when?: string; at: number; out?: number; x?: number; y?: number}> = ({place, when, at, out = Infinity, x = 90, y = 70}) => {
  const frame = useCurrentFrame();
  const o = life(frame, at, out, 16, 14);
  if (o <= 0) return null;
  return (
    <div style={{position: "absolute", left: x, top: y, opacity: o}}>
      <div style={{fontFamily: FELL_SC, fontSize: 34, color: C.ink}}>{place}</div>
      <div style={{height: 3, width: interpolate(prog(frame, at, 26), [0, 1], [0, 260]), background: C.red, margin: "8px 0"}} />
      {when && <div style={{fontFamily: FELL_I, fontStyle: "italic", fontSize: 26, color: C.inkSoft}}>{when}</div>}
    </div>
  );
};

/** red stamp that slams onto the page */
export const Stamp: React.FC<{text: string; x: number; y: number; at: number; out?: number; rot?: number; size?: number; color?: string}> = ({text, x, y, at, out = Infinity, rot = -6, size = 64, color = C.red}) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const p = prog(frame, at, 7, Easing.in(Easing.quad));
  const o = out === Infinity ? 1 : 1 - prog(frame, out, 12);
  return (
    <div style={{position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) rotate(${rot}deg) scale(${lerp(1.9, 1, p)})`, opacity: p * o * 0.92, fontFamily: FELL_SC, fontSize: size, color, border: `5px solid ${color}`, padding: "6px 26px 2px", letterSpacing: 4, mixBlendMode: "multiply", filter: "url(#rough)"}}>
      {text}
    </div>
  );
};

/** chapter card: drawer number + blackletter title + a gold rule drawn outwards */
export const ChapterCard: React.FC<{n: string; title: string; len: number}> = ({n, title, len}) => {
  const frame = useCurrentFrame();
  const o = life(frame, 0, len - 16, 18, 16);
  const rule = prog(frame, 8, 30);
  return (
    <AbsoluteFill style={{alignItems: "center", justifyContent: "center", opacity: o}}>
      <div style={{fontFamily: FELL_SC, fontSize: 34, color: C.red, letterSpacing: 6, marginBottom: 12, opacity: prog(frame, 4, 16)}}>{n}</div>
      <div style={{fontFamily: FRAKTUR, fontSize: 104, color: C.ink, transform: `scale(${lerp(1.04, 1, prog(frame, 0, len))})`, filter: `blur(${lerp(5, 0, prog(frame, 0, 18))}px)`}}>{title}</div>
      <svg width={900} height={40} style={{marginTop: 14}}>
        <line x1={450 - 420 * rule} x2={450 + 420 * rule} y1={20} y2={20} stroke={C.gold} strokeWidth={3} />
        <circle cx={450} cy={20} r={7 * rule} fill={C.red} />
        <circle cx={450 - 420 * rule} cy={20} r={4 * rule} fill={C.gold} />
        <circle cx={450 + 420 * rule} cy={20} r={4 * rule} fill={C.gold} />
      </svg>
    </AbsoluteFill>
  );
};

/** SVG filters used across the film (rough ink edges) */
export const Filters: React.FC = () => (
  <svg width={0} height={0} style={{position: "absolute"}}>
    <defs>
      <filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={3} /><feDisplacementMap in="SourceGraphic" scale={4} /></filter>
      <filter id="inky"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={1} seed={5} /><feDisplacementMap in="SourceGraphic" scale={1.6} /></filter>
    </defs>
  </svg>
);

/** a list of items written one by one (e.g. a prescription) */
export const Items: React.FC<{items: {text: string; at: number}[]; x: number; y: number; size?: number; color?: string; gap?: number; out?: number; bullet?: string; w?: number}> = ({items, x, y, size = 42, color = C.ink, gap = 1.45, out = Infinity, bullet = "❧", w = 900}) => {
  const frame = useCurrentFrame();
  return (
    <>
      {items.map((it, i) => {
        const o = life(frame, it.at, out, 14, 14);
        if (o <= 0) return null;
        return (
          <div key={i} style={{position: "absolute", left: x, top: y + i * size * gap, width: w, opacity: o, fontFamily: FELL, fontSize: size, color, transform: `translateX(${lerp(-16, 0, prog(frame, it.at, 16))}px)`}}>
            <span style={{color: C.red, marginRight: 18}}>{bullet}</span>{it.text}
          </div>
        );
      })}
    </>
  );
};

/** ink path drawn with a pen */
export const Pen: React.FC<{d: string; at: number; len?: number; color?: string; width?: number; out?: number; total?: number}> = ({d, at, len = 30, color = C.ink, width = 4, out = Infinity, total = 3000}) => {
  const frame = useCurrentFrame();
  const p = prog(frame, at, len);
  const o = out === Infinity ? 1 : 1 - prog(frame, out, 14);
  if (frame < at || o <= 0) return null;
  return <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={total} strokeDashoffset={total * (1 - p)} opacity={o} filter="url(#inky)" />;
};

/** a gilded roundel with a label (used for the six non-naturals and other lists) */
export const Roundel: React.FC<{label: string; x: number; y: number; at: number; out?: number; r?: number; glow?: number; color?: string; size?: number; dx?: number; dy?: number; rot?: number}> = ({label, x, y, at, out = Infinity, r = 86, glow = 0, color = C.ink, size = 26, dx = 0, dy = 0, rot = 0}) => {
  const frame = useCurrentFrame();
  const o = life(frame, at, out, 14, 14);
  if (o <= 0) return null;
  const s = lerp(0.6, 1, prog(frame, at, 16, Easing.out(Easing.back(1.6))));
  return (
    <div style={{position: "absolute", left: x - r + dx, top: y - r + dy, width: r * 2, height: r * 2, borderRadius: "50%", opacity: o, transform: `scale(${s}) rotate(${rot}deg)`,
      background: `radial-gradient(circle, ${C.vellum} 60%, ${C.vellumDeep} 100%)`, border: `3px solid ${C.gold}`, outline: `2px solid ${C.ink}`, outlineOffset: 4,
      boxShadow: glow > 0 ? `0 0 ${40 * glow}px ${12 * glow}px rgba(158,42,30,${0.45 * glow})` : "0 6px 14px rgba(60,30,0,0.25)",
      display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily: FELL_SC, fontSize: size, color, lineHeight: 1.1, padding: 12}}>
      {label}
    </div>
  );
};

/** a big question line, centred — chapters end on these */
export const Question: React.FC<{text: string; at: number; out?: number; y?: number; size?: number}> = ({text, at, out = Infinity, y = 470, size = 64}) => (
  <T x={960} y={y} at={at} out={out} size={size} font="fellI" w={1500}>{text}</T>
);
