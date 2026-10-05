import React from "react";
import {AbsoluteFill, random} from "remotion";
import {Art, life, mv, Note, prog, Question, Quote, Roundel, T} from "../kit";
import {C} from "../style";
import {useCh} from "./use";

const Mist: React.FC<{x: number; y: number; amount: number; f: number}> = ({x, y, amount, f}) => (
  <svg width={1920} height={1080} style={{position: "absolute", opacity: amount}}>
    <defs><filter id="m5"><feGaussianBlur stdDeviation={22} /></filter></defs>
    <g filter="url(#m5)">
      {Array.from({length: 9}).map((_, i) => (
        <ellipse key={i} cx={x + (random(`a${i}`) - 0.5) * 220 + 20 * Math.sin(f / 30 + i)} cy={y + (random(`b${i}`) - 0.5) * 160 - ((f / 2 + i * 20) % 60)} rx={70 + random(`c${i}`) * 50} ry={40 + random(`d${i}`) * 30} fill={C.black} opacity={0.6} />
      ))}
    </g>
  </svg>
);

export const Chest: React.FC = () => {
  const {f, b, w, end} = useCh("chest");
  const mist = prog(f, w("c5a", "mist"), 40) * (1 - prog(f, w("c5b", "warm the body"), 50));
  const warm = life(f, w("c5b", "warm the body"), b("c5c").s, 30, 14);
  const wobble = Math.sin(f / 3) * 6 * life(f, b("c5e").s, b("c5f").s, 6, 10);
  const sparkle = (i: number) => life(f, i === 0 ? w("c5h", "onyx") : w("c5i", ["", "beryl", "sapphire"][i]), b("c5j").s, 8, 14) * (0.6 + 0.4 * Math.sin(f / 4 + i));
  return (
    <AbsoluteFill>
      <T x={960} y={300} at={b("c5a0").s} out={w("c5a0", "But doctors")} size={56} font="fellI"><s>psychiatric drugs</s>   ·   <s>therapists</s></T>
      <Roundel label="mind" x={760} y={600} at={w("c5a0", "But doctors")} out={b("c5a").s - 4} r={110} size={34} color={C.black} />
      <Roundel label="body" x={1160} y={600} at={w("c5a0", "But doctors") + 6} out={b("c5a").s - 4} r={110} size={34} color={C.red} />
      <T x={960} y={560} at={w("c5a0", "the link")} out={b("c5a").s - 4} size={70} w={200}>⇄</T>
      <T x={960} y={820} at={w("c5a0", "But doctors") + 10} out={b("c5a").s - 4} size={40} font="sc" color={C.green}>a growing interest in emotional health</T>

      <Art name="head" x={620} y={600} w={440} at={b("c5a").s} out={b("c5c").s - 4} />
      <Mist x={640} y={430} amount={mist} f={f} />
      <AbsoluteFill style={{background: "radial-gradient(circle at 32% 52%, rgba(233,170,80,0.45), rgba(233,170,80,0) 28%)", opacity: warm}} />
      <T x={1350} y={300} at={w("c5a", "black bile")} out={b("c5b").s - 4} size={44} font="sc" color={C.black} w={760}>too much black bile</T>
      <T x={1350} y={380} at={w("c5a", "mist")} out={b("c5b").s - 4} size={44} font="fellI" w={760}>→ a mist in the brain</T>
      <T x={1350} y={460} at={w("c5a", "clouded")} out={b("c5b").s - 4} size={44} font="fellI" w={760}>→ clouded thinking</T>
      <T x={1350} y={200} at={w("c5b", "purge")} out={b("c5c").s - 4} size={46} font="sc" color={C.green} w={760}>purge · and warm</T>
      <Art name="spices" x={1250} y={560} w={380} at={w("c5b", "cinnamon")} out={b("c5c").s - 4} />
      <Art name="oil" x={1560} y={600} w={230} at={w("c5b", "warm oils")} out={b("c5c").s - 4} />
      <T x={1250} y={790} at={w("c5b", "cinnamon")} out={b("c5c").s - 4} size={32} font="sc" w={420}>cinnamon & liquorice</T>
      <T x={1560} y={790} at={w("c5b", "warm oils")} out={b("c5c").s - 4} size={32} font="sc" w={360}>warm oil massage</T>

      <Art name="saffron" x={960 + wobble} y={520} w={420} at={w("c5c", "Saffron")} out={b("c5f").s - 4} rot={wobble / 2} />
      <T x={960} y={850} at={w("c5c", "provoke joy")} out={b("c5d").s} size={50} font="sc" color={C.green}>saffron: “provokes joy”</T>
      <Note place="A Welsh recipe collection" when="around 1400" at={b("c5d").s} out={b("c5f").s} />
      <Quote text={b("c5e").t} who={b("c5e").who!} s={b("c5e").s} e={b("c5e").e} out={b("c5f").s} y={800} size={60} />

      <Art name="herbs" x={560} y={520} w={560} at={w("c5f", "Oregano")} out={b("c5g").s - 4} />
      <T x={560} y={830} at={w("c5f", "Oregano")} out={b("c5g").s - 4} size={36} font="sc" w={560}>oregano & fennel</T>
      <Art name="ostrich" x={1360} y={500} w={340} at={w("c5f", "ostrich liver")} out={b("c5g").s - 4} />
      <T x={1360} y={830} at={w("c5f", "ostrich liver")} out={b("c5g").s - 4} size={36} font="sc" color={C.red} w={560}>ostrich liver (!)</T>

      <Note place="Hildegard of Bingen" when="abbess · 1098–1179" at={b("c5g").s} out={b("c5j").s} />
      <Art name="gems" x={960} y={mv(f, b("c5h").s - 6, 520, 250)} w={mv(f, b("c5h").s - 6, 900, 700)} at={b("c5g").s + 4} out={b("c5j").s - 4} />
      <T x={730} y={400} at={w("c5h", "onyx")} out={b("c5j").s - 4} size={28} font="sc" w={230}>onyx · sadness</T>
      <T x={960} y={400} at={w("c5i", "beryl")} out={b("c5j").s - 4} size={28} font="sc" color={C.green} w={230}>beryl · anger</T>
      <T x={1190} y={400} at={w("c5i", "sapphire")} out={b("c5j").s - 4} size={28} font="sc" color={C.blue} w={230}>sapphire · anger</T>
      <svg width={1920} height={1080} style={{position: "absolute"}}>
        {[730, 960, 1190].map((x, i) => (
          <g key={i} opacity={sparkle(i)} stroke={C.goldLight} strokeWidth={4}>
            <line x1={x + 80} y1={150} x2={x + 80} y2={200} /><line x1={x + 55} y1={175} x2={x + 105} y2={175} />
          </g>
        ))}
      </svg>
      <Quote text={b("c5h").t} who={b("c5h").who!} s={b("c5h").s} e={b("c5h").e} out={b("c5i").s} y={480} w={1500} size={48} />
      <T x={960} y={620} at={w("c5i", "sapphire")} out={b("c5j").s - 4} size={48} font="fellI" w={1400}>a sapphire in the mouth, or gazing at a beryl, to calm anger</T>
      <Question text="…but remedies worked best alongside a change in how you lived." at={b("c5j").s} out={end - 14} y={470} size={56} />
    </AbsoluteFill>
  );
};
