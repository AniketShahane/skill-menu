import React from "react";
import {AbsoluteFill} from "remotion";
import {Art, Items, life, Mini, Note, prog, Question, Quote, T, lerp} from "../kit";
import {Compass} from "../Compass";
import {C, FELL, FELL_SC} from "../style";
import {useCh} from "./use";

/** a parchment scroll that unrolls downward */
const Scroll: React.FC<{x: number; y: number; w: number; h: number; p: number; o: number; children?: React.ReactNode}> = ({x, y, w, h, p, o, children}) => (
  <div style={{position: "absolute", left: x - w / 2, top: y, width: w, opacity: o}}>
    <div style={{height: 34, borderRadius: 17, background: "linear-gradient(#C9B07C, #8E7445)", boxShadow: "0 4px 8px rgba(0,0,0,0.25)"}} />
    <div style={{height: h * p, overflow: "hidden", background: "linear-gradient(90deg, #E6D3A6, #F1E6C8 15%, #F1E6C8 85%, #E6D3A6)", margin: "0 18px", position: "relative"}}>{children}</div>
    <div style={{height: 34, borderRadius: 17, background: "linear-gradient(#C9B07C, #8E7445)", boxShadow: "0 4px 8px rgba(0,0,0,0.25)"}} />
  </div>
);

export const Joy: React.FC = () => {
  const {f, b, w, end} = useCh("joy");
  const scrollO = life(f, b("c6b").s, b("c6d").s, 14, 14);
  const scrollP = prog(f, b("c6b").s + 4, 30);
  const items = [
    {t: "taking walks", at: w("c6b2", "Taking walks")},
    {t: "seeing things beautiful and delightful to him", at: w("c6b2", "Seeing")},
    {t: "hearing songs and instruments he likes", at: w("c6b2", "Hearing")},
    {t: "being promised great yields from profitable markets", at: w("c6c", "being told")},
  ];
  // the aha: every strong emotion pushes to DRY; joy alone pushes back to MOIST
  const compO = life(f, b("c6e").s, b("c6g").s + 4, 14, 16);
  const dry = prog(f, w("c6e", "dry the body out"), 30);
  const joy = prog(f, w("c6f", "Joy moistened"), 40);
  const px = 0.78 * dry - 0.9 * joy;
  const pushes = [
    {label: "anger", dx: 1, dy: 0.35, o: prog(f, w("c6e", "Almost"), 12) * (1 - joy), color: C.red},
    {label: "sorrow", dx: 1, dy: 0, o: prog(f, w("c6e", "strong emotion"), 12) * (1 - joy), color: C.black},
    {label: "fear", dx: 1, dy: -0.35, o: prog(f, w("c6e", "thought"), 12) * (1 - joy), color: C.blue},
    {label: "joy", dx: -1, dy: 0, o: joy, color: C.green},
  ];
  return (
    <AbsoluteFill>
      <Note place="Taddeo Alderotti" when="physician · thirteenth century" at={b("c6a").s} out={b("c6b").s} />
      <T x={960} y={330} at={w("c6a", "Obizzo")} out={b("c6b").s - 4} size={84} font="fraktur" w={1500}>Obizzo, lord of Ferrara</T>
      <T x={960} y={460} at={w("c6a", "melancholy")} out={b("c6b").s - 4} size={44} font="sc" color={C.black}>melancholy and sleeplessness</T>
      <T x={960} y={530} at={w("c6a", "more than two")} out={b("c6b").s - 4} size={40} font="fellI">for more than two years</T>

      <T x={960} y={70} at={b("c6b").s} out={b("c6d").s} size={44} font="sc" color={C.red}>the prescription</T>
      <Scroll x={960} y={150} w={1100} h={600} p={scrollP} o={scrollO}>
        {items.map((it, i) => (
          <div key={i} style={{position: "absolute", left: 70, right: 70, top: 50 + i * 130, fontFamily: FELL, fontSize: 44, color: C.ink, opacity: prog(f, it.at, 14), filter: `blur(${lerp(4, 0, prog(f, it.at, 12))}px)`}}>
            <span style={{color: C.red, fontFamily: FELL_SC, marginRight: 18}}>{["i.", "ii.", "iii.", "iv."][i]}</span>{it.t}
          </div>
        ))}
      </Scroll>
      <Art name="coins" x={1620} y={640} w={360} at={w("c6c", "great yields")} out={b("c6d").s - 4} />

      <T x={960} y={330} at={b("c6d").s} out={b("c6e").s - 4} size={54} font="fellI" w={1500}>today: “social prescribing”</T>
      <T x={960} y={470} at={w("c6d", "But why")} out={b("c6e").s - 4} size={64} font="fellI" w={1500}>But why would joy be medicine?</T>

      <Compass cx={960} cy={560} size={540} o={compO} point={1} px={px} py={0.05} pushes={pushes} bloom={joy} showQualities={0} ring={joy} />
      <T x={960} y={60} at={b("c6e").s} out={b("c6f").s - 2} size={44} font="sc" color={C.inkSoft}>strong emotions dry the body…</T>
      <T x={960} y={60} at={b("c6f").s} out={b("c6g").s} size={52} font="sc" color={C.green}>…joy moistens it</T>

      <Mini name="hiltbolt" x={470} y={500} h={720} at={b("c6g").s} out={b("c6i").s} caption="Codex Manesse: Hiltbolt von Schwangau among dancers and a fiddler" ratio={0.7} />
      <Items x={900} y={260} size={44} out={b("c6h").s - 4} w={900} items={[
        {text: "purer blood", at: w("c6g", "purify")},
        {text: "sharper wits", at: w("c6g", "sharpen")},
        {text: "more energy", at: w("c6g", "raise your energy")},
        {text: "a healthy complexion", at: w("c6g", "complexion")},
        {text: "…even more attractive", at: w("c6g", "even make")},
      ]} />
      <Quote text={b("c6h").t} who={b("c6h").who!} s={b("c6h").s} e={b("c6h").e} out={b("c6i").s} x={1290} y={300} w={1000} size={48} />

      <T x={960} y={440} at={b("c6i").s} out={b("c6j").s - 4} size={60} font="fellI" w={1500}>cheer up — starting with friends</T>
      <Mini name="goeli" x={500} y={500} h={720} at={b("c6j").s} out={b("c6l").s} caption="Codex Manesse: Herr Göli at a board game with a friend" ratio={0.68} />
      <Note place="Lapo Mazzei" when="lawyer, Francesco's dear friend" x={1000} y={160} at={w("c6j", "Lapo Mazzei")} out={b("c6l").s} />
      <Quote text={b("c6k").t} who={b("c6k").who!} s={b("c6k").s} e={b("c6k").e} out={b("c6l").s} x={1340} y={380} w={950} size={48} />

      <Art name="cat" x={480} y={520} w={300} at={w("c6l", "Cats")} out={b("c6n").s - 4} />
      <Art name="dog" x={960} y={560} w={430} at={w("c6l", "dogs")} out={b("c6m").s - 4} />
      <Art name="bird" x={1440} y={500} w={310} at={w("c6l", "birds")} out={b("c6n").s - 4} />
      <Art name="monkey" x={900} y={b("c6m").s <= f ? 480 : 2000} w={380} at={w("c6m", "kept monkeys")} out={b("c6n").s - 4} />
      <Note place="Robert de Insula" when="bishop of Durham, 1274–83" at={w("c6m", "Robert")} out={w("c6m", "King Alfonso")} />
      <Note place="Alfonso X of Castile" when="1221–84" at={w("c6m", "King Alfonso")} out={b("c6n").s} />
      <Art name="ferret" x={1350} y={760} w={260} at={w("c6m", "ferret")} out={b("c6n").s + 20} />
      <T x={900} y={720} at={w("c6m", "ease the burden")} out={w("c6m", "King Alfonso")} size={36} font="fellI" w={700}>“to ease the burden of his worries”</T>
      <T x={1350} y={940} at={w("c6m", "loved dearly")} out={b("c6n").s} size={34} font="fellI" w={700}>“loved dearly and carried with him”</T>
      <Question text="Friends and pets lifted the heart. So did books, music, and fresh air." at={b("c6n").s} out={end - 14} y={420} size={54} />
    </AbsoluteFill>
  );
};
