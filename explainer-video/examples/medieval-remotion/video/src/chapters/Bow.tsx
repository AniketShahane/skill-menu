import React from "react";
import {AbsoluteFill, Easing} from "remotion";
import {Art, life, mv, Note, prog, Question, Quote, T, Items, lerp} from "../kit";
import {C, FELL_SC} from "../style";
import {useCh} from "./use";

/** An ink longbow, drawn vertically. bend 0 = relaxed, 1 = drawn to breaking. */
export const BowSvg: React.FC<{cx: number; cy: number; h: number; bend: number; draw: number; crack: number; o: number; shake: number}> = ({cx, cy, h, bend, draw, crack, o, shake}) => {
  const top = cy - h / 2, bot = cy + h / 2;
  const tipIn = lerp(0, 70, bend); // tips come in as the bow bends
  const belly = lerp(90, 230, bend);
  const x = cx + shake;
  const limb = `M ${x - tipIn} ${top + tipIn * 0.4} Q ${x + belly * 1.9} ${cy} ${x - tipIn} ${bot - tipIn * 0.4}`;
  const pull = lerp(0, 260, bend);
  const total = 1400;
  return (
    <svg width={1920} height={1080} style={{position: "absolute", opacity: o}}>
      <path d={limb} stroke="#6B4426" strokeWidth={22} fill="none" strokeLinecap="round" strokeDasharray={total} strokeDashoffset={total * (1 - draw)} />
      <path d={limb} stroke={C.ink} strokeWidth={4} fill="none" strokeLinecap="round" strokeDasharray={total} strokeDashoffset={total * (1 - draw)} transform="translate(-9,0)" />
      {draw > 0.95 && <path d={`M ${x - tipIn} ${top + tipIn * 0.4} L ${x - pull} ${cy} L ${x - tipIn} ${bot - tipIn * 0.4}`} stroke={C.ink} strokeWidth={2.5} fill="none" opacity={(draw - 0.95) * 20} />}
      {/* grip */}
      {draw > 0.6 && <rect x={x - tipIn / 2 + belly * 0.95 - 12} y={cy - 40} width={24} height={80} rx={6} fill={C.red} opacity={(draw - 0.6) * 2.5} />}
      {crack > 0 && <path d={`M ${x - tipIn / 2 + belly * 0.95 + 4} ${cy - 120} l 14 18 l -12 14 l 16 20 l -10 16`} stroke={C.ink} strokeWidth={4} fill="none" strokeDasharray={200} strokeDashoffset={200 * (1 - crack)} />}
    </svg>
  );
};

const Wheel: React.FC<{cx: number; cy: number; r: number; fill: number; o: number}> = ({cx, cy, r, fill, o}) => (
  <svg width={1920} height={1080} style={{position: "absolute", opacity: o}}>
    <circle cx={cx} cy={cy} r={r + 14} fill="none" stroke={C.gold} strokeWidth={3} />
    {Array.from({length: 24}).map((_, i) => {
      const a0 = (i / 24) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / 24) * Math.PI * 2 - Math.PI / 2;
      const on = fill * 24 > i;
      const rest = i >= 22; // the two hours his biographer wished he'd keep for "repose and recreation"
      return <path key={i} d={`M ${cx} ${cy} L ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`}
        fill={on ? (rest ? C.green : C.red) : "none"} fillOpacity={on ? 0.75 : 0} stroke={C.ink} strokeWidth={2} />;
    })}
    <text x={cx} y={cy + r + 70} textAnchor="middle" fontFamily={FELL_SC} fontSize={30} fill={C.inkSoft}>a day of duties</text>
  </svg>
);

export const Bow: React.FC = () => {
  const {f, b, w, end} = useCh("bow");
  const bowO = life(f, b("c3a").s, b("c3c").s + 6, 10, 16);
  const draw = prog(f, b("c3a").s, 40);
  const bend = prog(f, b("c3b").s, Math.round(b("c3b").d * 0.55), Easing.inOut(Easing.cubic));
  const strain = prog(f, w("c3b", "cannot survive"), 10);
  const shake = strain * Math.sin(f * 2.6) * 4 * (1 - prog(f, w("c3b", "Endless"), 6));
  const crack = prog(f, w("c3b", "cannot survive") + 12, 10);
  const pile = prog(f, w("c3l", "studying too much"), 50);
  const topple = prog(f, w("c3l", "robbed him"), 18, Easing.in(Easing.quad));
  return (
    <AbsoluteFill>
      <BowSvg cx={760} cy={540} h={760} bend={bend} draw={draw} crack={crack} o={bowO} shake={shake} />
      <T x={1380} y={380} at={w("c3a", "the mind")} out={b("c3c").s} size={60} font="fellI" w={700}>the mind is a bow</T>
      <T x={1380} y={500} at={w("c3b", "A bow is strong")} out={b("c3c").s} size={40} font="sc" color={C.green} w={700}>strong…</T>
      <T x={1380} y={570} at={w("c3b", "cannot survive")} out={b("c3c").s} size={40} font="sc" color={C.red} w={700}>…but not bent forever</T>
      <T x={1380} y={680} at={w("c3b", "Endless")} out={b("c3c").s} size={36} font="fellI" color={C.inkSoft} w={700}>“disputes in the household” could “shorten a person's years”</T>

      <T x={960} y={330} at={b("c3c").s + 4} out={b("c3d").s - 4} size={60} font="fellI" w={1400}>too much responsibility can make you ill</T>
      <Art name="crown" x={960} y={620} w={300} at={w("c3c", "powerful men")} out={b("c3d").s - 4} />
      <T x={960} y={760} at={w("c3c", "powerful men")} out={b("c3d").s - 4} size={36} font="sc" color={C.red}>especially for powerful men</T>

      <Note place="Daniel of Beccles" when="England · around 1200" at={b("c3d").s} out={b("c3f").s} />
      <Art name="ant" x={960} y={kf2(f, b("c3e").s, 520, 300)} w={kf2(f, b("c3e").s, 560, 300)} at={w("c3d", "toiling ant") - 10} out={b("c3f").s - 4} />
      <Quote text={b("c3e").t} who={b("c3e").who!} s={b("c3e").s} e={b("c3e").e} out={b("c3f").s} y={560} size={52} />

      <Note place="Boucicaut" when="Jean II Le Meingre, French knight · c. 1366–1421" at={b("c3f").s} out={b("c3h").s} />
      <Wheel cx={960} cy={kf2(f, b("c3g").s, 520, 300)} r={kf2(f, b("c3g").s, 230, 140)} fill={prog(f, b("c3f").s + 6, Math.round(b("c3f").d * 0.5)) * (22 / 24) + prog(f, w("c3g", "repose"), 20) * (2 / 24)} o={life(f, b("c3f").s + 4, b("c3h").s - 6, 14, 14)} />
      <Quote text={b("c3g").show ?? b("c3g").t} who={b("c3g").who!} s={b("c3g").s} e={b("c3g").e} out={b("c3h").s} y={560} size={46} w={1500} />

      <Note place="Rievaulx Abbey" when="Yorkshire · thirteenth century" at={b("c3h").s} out={b("c3k").s + 10} />
      <Art name="abbey" x={960} y={560} w={1150} at={b("c3h").s + 2} out={b("c3i").s} drift={-30} />
      <Art name="monk" x={mv(f, b("c3j").s - 6, 700, 360)} y={560} w={mv(f, b("c3j").s - 6, 480, 380)} at={b("c3i").s} out={b("c3l").s - 4} />
      <T x={1350} y={430} at={w("c3i", "He wrote")} out={b("c3j").s - 6} size={44} font="fellI" w={700}>Matthew, the precentor, writes to William, prior of Byland…</T>
      <Quote text={b("c3j").show ?? b("c3j").t} who={b("c3j").who!} s={b("c3j").s} e={b("c3j").e} out={b("c3k").s} x={1150} y={330} w={1250} size={50} />
      <Items x={820} y={380} size={46} out={b("c3l").s - 4} items={[
        {text: "stomach pains", at: w("c3k", "stomach")},
        {text: "exhaustion", at: w("c3k", "exhaustion")},
        {text: "“this work will kill me”", at: w("c3k", "he was sure")},
      ]} />
      <T x={1180} y={720} at={w("c3k", "We don't know")} out={b("c3l").s - 4} size={36} font="fellI" color={C.inkSoft} w={900}>his fate is unknown</T>

      <Note place="Alexander de Langley" when="St Albans Abbey" at={b("c3l").s} out={b("c3m").s} />
      <Items x={160} y={360} size={40} out={b("c3m").s - 4} w={700} items={[
        {text: "a breakdown blamed on overwork", at: w("c3l", "breakdown")},
        {text: "duties lightened…", at: w("c3l", "So his duties")},
        {text: "…so he studied too much", at: w("c3l", "He started")},
      ]} />
      <Art name="bookpile" x={1350 + 200 * topple} y={600 - 120 * pile + 200 * topple} w={260 + 260 * pile} rot={35 * topple} at={w("c3l", "He started")} out={b("c3m").s - 4} />
      <Question text="Overwork was one danger. The other came from inside: a mind that would not stop worrying." at={b("c3m").s} out={end - 14} y={440} size={54} />
    </AbsoluteFill>
  );
};

/** move from value a to value b starting at frame `at` (eased over 20 frames) */
const kf2 = (f: number, at: number, a: number, bb: number) => lerp(a, bb, prog(f, at - 10, 20));
