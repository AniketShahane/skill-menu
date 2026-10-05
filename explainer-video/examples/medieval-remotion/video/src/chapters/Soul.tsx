import React from "react";
import {AbsoluteFill} from "remotion";
import {Art, Items, life, Note, Pen, prog, T} from "../kit";
import {C, FELL_SC} from "../style";
import {useCh} from "./use";

export const Soul: React.FC = () => {
  const {f, b, w, end} = useCh("soul");
  const ringsO = life(f, b("c8a").s, b("c8b").s, 10, 14);
  const ring = (cx: number, cy: number, at: number, color: string) => (
    <Pen d={`M ${cx + 170} ${cy} A 170 170 0 1 1 ${cx + 169.9} ${cy - 1}`} at={at} len={30} color={color} width={7} total={1100} />
  );
  const dark = life(f, b("c8e").s, end, 30, 20);
  const steady = prog(f, w("c8f", "But his faith"), 40);
  const flick = (1 - steady) * (Math.sin(f / 2.3) * 0.25 + Math.sin(f / 3.7) * 0.2);
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{position: "absolute", opacity: ringsO}}>
        {ring(760, 470, w("c8a", "body"), C.red)}
        {ring(1160, 470, w("c8a", "mind"), C.black)}
        {ring(960, 720, w("c8a", "soul"), C.gold)}
        <g fontFamily={FELL_SC} fontSize={44} textAnchor="middle">
          <text x={690} y={440} fill={C.red} opacity={prog(f, w("c8a", "body"), 14)}>body</text>
          <text x={1230} y={440} fill={C.black} opacity={prog(f, w("c8a", "mind"), 14)}>mind</text>
          <text x={960} y={820} fill="#8A6014" opacity={prog(f, w("c8a", "soul"), 14)}>soul</text>
        </g>
      </svg>
      <T x={960} y={80} at={w("c8a", "Devotion")} out={b("c8b").s} size={44} font="fellI" w={1600}>devotion → a better mood → better health</T>

      <Note place="A health guide from southern France" when="late thirteenth century" at={b("c8b").s} out={b("c8c").s} />
      <T x={960} y={420} at={w("c8b", "prayer")} out={b("c8c").s - 4} size={64} font="fellI" w={1400}>pray — “with joy” — to lengthen your life</T>

      <Note place="John Lydgate" when="monk and poet · c. 1370–c. 1451" at={b("c8c").s} out={b("c8d").s} />
      <T x={960} y={250} at={w("c8c", "the Dietary")} out={b("c8d").s - 4} size={96} font="fraktur">the Dietary</T>
      <T x={620} y={480} at={w("c8c", "regular prayer")} out={b("c8d").s - 4} size={44} font="sc" color={C.gold} w={600}>regular prayer</T>
      <T x={960} y={480} at={w("c8c", "right beside")} out={b("c8d").s - 4} size={44} w={100}>+</T>
      <T x={1300} y={480} at={w("c8c", "keep your emotions")} out={b("c8d").s - 4} size={44} font="sc" color={C.red} w={600}>emotions in check</T>

      <Note place="King Duarte of Portugal" when="who believed God had sent his illness" at={b("c8d").s} out={b("c8e").s} />
      <Art name="crown" x={480} y={540} w={420} at={b("c8d").s + 4} out={b("c8e").s - 4} />
      <Items x={860} y={380} size={44} out={b("c8e").s - 4} w={950} items={[
        {text: "saw his doctors", at: w("c8d", "He did see")},
        {text: "worked less, slept more", at: w("c8d", "He worked less")},
        {text: "devotion: alms, confession, communion", at: w("c8d", "devotion")},
      ]} color={C.ink} />

      <AbsoluteFill style={{background: `radial-gradient(circle at 50% 52%, rgba(20,14,24,0) 0%, rgba(20,14,24,${0.72 * dark}) 34%)`}} />
      <AbsoluteFill style={{background: `radial-gradient(circle at 50% 40%, rgba(255,205,120,${(0.38 + flick * 0.5) * dark}), rgba(255,205,120,0) 26%)`}} />
      <Art name="candle" x={960} y={560} w={190} at={b("c8e").s + 10} out={end - 10} />
      <Note place="Giovanni di Paolo Morelli" when="wool merchant, Florence" at={b("c8e").s} out={b("c8f").s} />
      <T x={960} y={880} at={w("c8e", "grief and guilt")} out={b("c8f").s} size={44} font="fellI" color="#E9DCC0">grief and guilt</T>
      <T x={960} y={880} at={w("c8f", "But his faith")} out={end - 12} size={44} font="fellI" color="#E9DCC0">his faith carried him through</T>
    </AbsoluteFill>
  );
};
