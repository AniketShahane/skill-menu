import React from "react";
import {AbsoluteFill} from "remotion";
import {Art, Items, life, Mini, mv, Note, prog, Quote, T} from "../kit";
import {Compass} from "../Compass";
import {C, FELL, FELL_SC} from "../style";
import {useCh} from "./use";

const Rings: React.FC<{x: number; y: number; at: number; out: number; f: number}> = ({x, y, at, out, f}) => {
  const o = life(f, at, out, 10, 14);
  if (o <= 0) return null;
  return (
    <svg width={1920} height={1080} style={{position: "absolute", opacity: o}}>
      {[0, 1, 2, 3].map((i) => {
        const t = (((f - at) / 50 + i / 4) % 1 + 1) % 1;
        return <circle key={i} cx={x} cy={y} r={60 + t * 380} fill="none" stroke={C.black} strokeWidth={4} opacity={(1 - t) * 0.6} />;
      })}
    </svg>
  );
};

export const Crisis: React.FC = () => {
  const {f, b, w, end} = useCh("crisis");
  const old = prog(f, w("c9l", "cold and dryness"), 40);
  const compO = life(f, b("c9l").s, b("c9m").s, 14, 14);
  const lr = Math.sin(f / 9) * 30;
  return (
    <AbsoluteFill>
      <Note place="The Black Death" when="from its first outbreak, 1347–48" at={b("c9a").s} out={b("c9c").s} />
      <Art name="bell" x={960} y={480} w={360} at={b("c9a").s + 4} out={b("c9c").s - 4} rot={Math.sin(f / 8) * 6 * life(f, b("c9b").s, b("c9c").s)} />
      <T x={960} y={800} at={w("c9a", "a gloomy mind")} out={b("c9b").s} size={48} font="fellI">a gloomy mind makes you easier prey</T>
      <Rings x={960} y={420} at={w("c9b", "funeral bells")} out={b("c9c").s} f={f} />
      <Note place="Chalin de Vivario" when="French physician" x={1300} y={110} at={b("c9b").s} out={b("c9c").s} />
      <Art name="gossip" x={1500} y={700} w={330} at={w("c9b", "morbid gossip")} out={b("c9c").s - 4} />
      <T x={480} y={720} at={w("c9b", "fears and imaginings")} out={b("c9c").s - 4} size={42} font="fellI" w={700}>“fears and imaginings”</T>

      <T x={960} y={380} at={b("c9c").s} out={b("c9d").s - 4} size={70} font="fellI">keep your spirits up</T>
      <T x={960} y={520} at={w("c9c", "COVID")} out={b("c9d").s - 4} size={38} font="sc" color={C.inkSoft}>1348 · 2020</T>

      <Mini name="veldeke" x={480} y={500} h={720} at={b("c9d").s} out={b("c9e").s} caption="Codex Manesse: Heinrich von Veldeke among the birds" ratio={0.66} />
      <Note place="Tommaso del Garbo" when="professor, Bologna · c. 1305–70" x={940} y={150} at={b("c9d").s} out={b("c9e").s} />
      <Items x={940} y={380} size={46} out={b("c9e").s - 4} w={900} color={C.green} items={[
        {text: "cheerful, carefree company", at: w("c9d", "cheerful")},
        {text: "rest in the garden", at: w("c9d", "rest in the garden")},
        {text: "music and stories", at: w("c9d", "music and stories")},
      ]} />

      <Art name="thunder" x={1450} y={480} w={380} at={w("c9e", "clap of thunder")} out={b("c9f").s - 4} />
      <T x={960} y={160} at={w("c9e", "Pregnant women")} out={b("c9f").s - 4} size={48} font="fellI" w={1500}>advice to pregnant women</T>
      <Items x={300} y={330} size={46} out={b("c9f").s - 4} w={800} items={[
        {text: "anger", at: w("c9e", "anger")},
        {text: "deep sadness", at: w("c9e", "deep sadness")},
        {text: "fear", at: w("c9e", "fear,")},
        {text: "a sudden shock", at: w("c9e", "a sudden shock")},
      ]} />

      <Note place="Elizabeth" when="Padua" at={b("c9f").s} out={b("c9g").s} />
      <T x={960} y={300} at={w("c9f", "treated for melancholy")} out={b("c9g").s - 4} size={46} font="fellI" w={1500}>women with repeated losses were sometimes treated for melancholy</T>
      <T x={960} y={480} at={w("c9f", "too much anger")} out={b("c9g").s - 4} size={44} font="sc" color={C.inkSoft} w={1500}>the medieval theory: anger or sorrow → spirits drawn away → “too cold”</T>

      <div style={{position: "absolute", left: 360, top: 300, width: 1200, padding: "44px 60px", border: `3px solid ${C.green}`, outline: `1px solid ${C.ink}`, outlineOffset: 6, background: "rgba(241,230,200,0.85)",
        opacity: life(f, w("c9g", "Today we know"), b("c9h").s - 12, 16, 12), fontFamily: FELL, fontSize: 46, color: C.ink, textAlign: "center", lineHeight: 1.3}}>
        <div style={{fontFamily: FELL_SC, fontSize: 32, color: C.green, letterSpacing: 4, marginBottom: 16}}>what we know today</div>
        Stress, sadness or a sudden fright do not cause miscarriage.<br />A loss is not the mother's fault.
      </div>
      <Quote text={b("c9h").t} who={b("c9h").who!} s={b("c9h").s} e={b("c9h").e} out={b("c9i").s} y={380} size={60} />

      <Note place="Samuel ibn Naghrillah" when="poet · eleventh-century al-Andalus" at={b("c9i").s} out={b("c9j").s} />
      <Art name="oldman" x={960 + lr * life(f, w("c9i", "left from his right"), b("c9j").s)} y={540} w={360} at={b("c9i").s + 4} out={b("c9k").s - 4} />
      <T x={600} y={520} at={w("c9i", "left from")} out={b("c9j").s} size={50} font="sc" w={300}>← left?</T>
      <T x={1320} y={520} at={w("c9i", "right")} out={b("c9j").s} size={50} font="sc" w={300}>right? →</T>
      <Note place="Pope Innocent III" when="1160–1216" at={b("c9j").s} out={b("c9k").s} />
      <T x={1450} y={420} at={w("c9j", "moody")} out={b("c9k").s - 4} size={44} font="fellI" w={700}>moody, argumentative…</T>
      <T x={1450} y={510} at={w("c9j", "good old days")} out={b("c9k").s - 4} size={44} font="fellI" w={700}>“the good old days”</T>

      <Note place="Bishop Edmund Lacey" when="Exeter · bishop 1420–55" at={b("c9k").s} out={b("c9l").s} />
      <Art name="tapestry" x={1350} y={540} w={360} at={w("c9k", "wall-hanging") - 30} out={b("c9l").s - 4} />
      <T x={680} y={440} at={w("c9k", "The mayor")} out={b("c9l").s - 4} size={46} font="fellI" w={900}>“no more understanding of the substance of this matter than the image in the wall-hanging there”</T>

      <Note place="Gabriele Zerbi" when="Gerontocomia, 1489" at={b("c9l").s} out={b("c9n").s} />
      <Compass cx={960} cy={560} size={480} o={compO} point={1} px={0.75 * old} py={-0.75 * old} mist={old * 0.6} showQualities={0}
        pushes={[{label: "old age", dx: 1, dy: -1, o: prog(f, w("c9l", "cold and dryness"), 14), color: C.black}]} />
      <T x={1600} y={500} at={w("c9l", "forgetful")} out={b("c9m").s} size={36} font="sc" w={420} color={C.black}>forgetful</T>
      <T x={1600} y={560} at={w("c9l", "dull")} out={b("c9m").s} size={36} font="sc" w={420} color={C.black}>dull · fanciful · low</T>
      <Items x={560} y={300} size={50} out={b("c9n").s - 4} w={900} color={C.green} items={[
        {text: "pleasure", at: w("c9m", "pleasure")},
        {text: "music: medicine for the mind", at: w("c9m", "Music")},
        {text: "conversation and stories", at: w("c9m", "Conversation")},
        {text: "maths problems:  XLII ÷ VI = ?", at: w("c9m", "maths problems")},
      ]} />
      <Quote text={b("c9n").t} who={b("c9n").who!} s={b("c9n").s} e={b("c9n").e} out={b("c9o").s} y={330} w={1500} size={50} />

      <T x={960} y={160} at={b("c9o").s} out={w("c9o", "The poet")} size={46} font="fellI" w={1500}>many old people kept working: most from need, some because it did them good</T>
      <Note place="Francesco Petrarch" when="poet · 1304–74" at={w("c9o", "The poet")} out={end - 10} />
      <Art name="scholar" x={mv(f, b("c9p").s - 6, 960, 560)} y={580} w={mv(f, b("c9p").s - 6, 640, 520)} at={w("c9o", "The poet")} out={end - 14} />
      <Quote text={b("c9p").t} who={b("c9p").who!} s={b("c9p").s} e={b("c9p").e} out={end - 14} x={1300} y={380} w={950} size={50} />
    </AbsoluteFill>
  );
};
