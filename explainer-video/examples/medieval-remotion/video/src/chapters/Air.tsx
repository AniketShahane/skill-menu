import React from "react";
import {AbsoluteFill, random} from "remotion";
import {Art, life, Mini, Note, prog, Quote, Roundel, Stamp, T} from "../kit";
import {C} from "../style";
import {useCh} from "./use";

/** square medieval notes (neumes) drifting up from the musicians */
const Neumes: React.FC<{o: number; f: number; x: number; y: number}> = ({o, f, x, y}) => (
  <svg width={1920} height={1080} style={{position: "absolute", opacity: o}}>
    {Array.from({length: 14}).map((_, i) => {
      const t = ((f * 0.9 + i * 37) % 260) / 260;
      const nx = x + (random(`nx${i}`) - 0.5) * 260 + Math.sin(f / 25 + i) * 30;
      const ny = y - t * 420;
      return <rect key={i} x={nx} y={ny} width={16} height={13} fill={i % 3 === 0 ? C.red : C.ink} opacity={Math.sin(t * Math.PI)} transform={`rotate(${(i % 2) * 10} ${nx} ${ny})`} />;
    })}
  </svg>
);

export const Air: React.FC = () => {
  const {f, b, w, end} = useCh("air");
  return (
    <AbsoluteFill>
      <Art name="sadbook" x={960} y={500} w={760} at={b("c7a").s} out={b("c7b").s} />
      <T x={960} y={840} at={w("c7a", "horrible")} out={b("c7b").s} size={44} font="fellI" w={1400}>“horrible stories depicting martyrdoms or death”</T>
      <Stamp text="NOT FOR THE SICK" x={960} y={150} at={w("c7a", "One ailing friar")} out={b("c7b").s} rot={-8} size={56} />
      <Art name="happybook" x={960} y={480} w={700} at={b("c7b").s} out={b("c7c").s - 4} />
      <T x={960} y={800} at={w("c7b", "sad-people")} out={b("c7c").s - 4} size={44} font="fellI">Harvey's “sad-people books”…</T>
      <T x={960} y={870} at={w("c7b", "somewhat attacked")} out={b("c7c").s - 4} size={40} font="sc" color={C.red}>…“somewhat attacked”</T>

      <Mini name="fiedler" x={480} y={500} h={720} at={b("c7c").s} out={b("c7e").s} caption="Codex Manesse: Reinmar the Fiddler" ratio={0.66} />
      <Neumes o={life(f, b("c7c").s + 20, b("c7f").s, 20, 14)} f={f} x={480} y={400} />
      <Note place="Bologna" when="the 1390s" x={1000} y={130} at={b("c7c").s} out={b("c7e").s} />
      <T x={1350} y={380} at={w("c7c", "master musician")} out={b("c7d").s - 4} size={50} font="fellI" w={900}>the city sends a dying boy a master musician and storyteller</T>
      <Quote text={b("c7d").t} who={b("c7d").who!} s={b("c7d").s} e={b("c7d").e} out={b("c7e").s} x={1330} y={290} w={1000} size={44} />
      <Mini name="frauenlob" x={1440} y={520} h={700} at={b("c7e").s} out={b("c7f").s} caption="Codex Manesse: Frauenlob and his musicians" ratio={0.72} />
      <T x={620} y={400} at={w("c7e", "Sergio of Polo")} out={b("c7f").s - 4} size={60} font="fraktur" w={900}>Sergio of Polo</T>
      <T x={620} y={500} at={w("c7e", "used song")} out={b("c7f").s - 4} size={42} font="fellI" w={900}>used song to “calm human minds and restore weak and infirm hearts to a state of deep joy and tranquillity”</T>

      <Art name="walker" x={420} y={560} w={330} at={b("c7f").s} out={b("c7g").s - 4} />
      <T x={420} y={800} at={b("c7f").s + 6} out={b("c7g").s - 4} size={34} font="sc" w={500}>long walks</T>
      <Mini name="warte" x={1260} y={500} h={700} at={w("c7f", "Rich monasteries")} out={b("c7g").s} caption="Codex Manesse: Jakob von Warte at his ease in a garden bath" ratio={0.67} />
      <T x={700} y={250} at={w("c7f", "change of air")} out={b("c7g").s - 4} size={40} font="fellI" w={560}>“a change of air and surroundings”</T>

      <Art name="garden" x={960} y={560} w={1050} at={b("c7g").s} out={b("c7i").s - 4} drift={-30} />
      {["green grass", "sweet flowers", "running water"].map((t, i) => (
        <T key={t} x={[400, 960, 1520][i]} y={110} at={w("c7g", ["green grass", "sweet flowers", "running water"][i])} out={b("c7h").s} size={42} font="sc" color={[C.green, C.red, C.blue][i]} w={500}>{t}</T>
      ))}
      <Note place="Datini's garden" when="Prato" at={b("c7h").s} out={b("c7i").s} />
      {["oranges", "roses", "violets"].map((t, i) => (
        <T key={t} x={[700, 960, 1220][i]} y={120} at={w("c7h", ["oranges", "roses", "violets"][i])} out={b("c7i").s} size={42} font="sc" color={["#C8641E", C.red, "#6A4C93"][i]} w={300}>{t}</T>
      ))}
      <Stamp text="A GREAT PIECE OF FOLLY" x={1500} y={300} at={w("c7h", "great piece of folly")} out={b("c7i").s} rot={8} size={40} />
      <T x={960} y={960} at={w("c7h", "But he clearly")} out={b("c7i").s} size={40} font="fellI">…but he loved it</T>

      <Note place="Bartolomeo Platina" when="humanist scholar · 1421–81" at={b("c7i").s} out={b("c7j").s} />
      <Art name="pruning" x={700} y={560} w={430} at={b("c7i").s + 4} out={b("c7j").s - 4} />
      <T x={1300} y={420} at={w("c7i", "relaxed the mind")} out={b("c7j").s - 4} size={48} font="fellI" w={800}>relaxes the mind…</T>
      <T x={1300} y={510} at={w("c7i", "exercised the body")} out={b("c7j").s - 4} size={48} font="fellI" w={800}>…while it exercises the body</T>

      <T x={960} y={330} at={w("c7j", "indoor")} out={b("c7k").s - 4} size={40} font="sc" color={C.inkSoft} w={1200}>indoors: lifting weights · climbing stairs</T>
      <T x={960} y={430} at={w("c7j", "most experts")} out={b("c7k").s - 4} size={58} font="fellI" w={1200}>but best of all: outdoors</T>
      <Note place="John Mirfield" when="medical writer, London" at={w("c7j", "John Mirfield")} out={b("c7k").s - 10} />
      <Art name="landscape" x={1100} y={620} w={2600} at={b("c7k").s - 6} out={b("c7l").s + 10} drift={-520} len={40} />
      <Quote text={b("c7k").show ?? b("c7k").t} who={b("c7k").who!} s={b("c7k").s} e={b("c7k").e} out={b("c7l").s} y={90} w={1600} size={46} />
      {["body", "mind", "soul"].map((t, i) => (
        <Roundel key={t} label={t} x={600 + i * 360} y={500} at={w("c7l", ["the body", "the mind", "the soul"][i])} out={end - 14} r={110} size={40} color={[C.red, C.black, C.gold][i]} />
      ))}
      <T x={960} y={720} at={w("c7l", "praise")} out={end - 14} size={42} font="fellI" w={1400}>it moves a man “to praise … the Lord his God”</T>
    </AbsoluteFill>
  );
};
