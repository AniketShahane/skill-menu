import React from "react";
import {AbsoluteFill, Easing} from "remotion";
import {Art, life, mv, Note, Pen, prog, Question, Quote, T} from "../kit";
import {Compass} from "../Compass";
import {C} from "../style";
import {useCh} from "./use";

export const Kill: React.FC = () => {
  const {f, b, w, end} = useCh("kill");
  const flash = life(f, w("c2a", "lightning"), w("c2a", "lightning") + 10, 3, 8);
  // compass on the right: fear → cold (c2c), back to centre, anger → hot + dry (c2f)
  const compO = Math.max(life(f, b("c2c").s - 8, b("c2d").s + 10, 14, 16), life(f, b("c2f").s - 4, b("c2g").s, 14, 14));
  const cold = prog(f, w("c2c", "froze"), 30);
  const hot = prog(f, w("c2f", "warmed"), 26);
  const py = -0.85 * cold * (1 - prog(f, b("c2d").s, 20)) + 0.8 * hot;
  const px = 0.8 * prog(f, w("c2f", "dried"), 26);
  const ccx = b("c2f").s - 4 <= f ? 960 : 1420;
  const csize = ccx === 960 ? 520 : 440;
  const fire = life(f, w("c2d", "threw herself"), b("c2e").s + 6, 18, 16);
  const crownFall = prog(f, w("c2h2", "later killed"), 30, Easing.in(Easing.quad));
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{position: "absolute"}}>
        <Pen d="M 1010 120 L 900 420 L 1010 400 L 880 760" at={w("c2a", "lightning")} len={8} width={10} color={C.gold} out={b("c2b").s - 6} />
      </svg>
      <AbsoluteFill style={{background: "#FFF6DC", opacity: flash * 0.6}} />
      <T x={960} y={820} at={w("c2a", "Fear was")} out={b("c2b").s - 4} size={84} font="sc" color={C.blue}>fear</T>

      <Note place="Alice, a clerk's daughter" when="Essex · one Good Friday" at={b("c2b").s} out={b("c2e").s} />
      <Art name="alice" x={mv(f, b("c2c").s - 8, 960, 560)} y={580} w={mv(f, b("c2c").s - 8, 820, 700)} at={b("c2b").s + 4} out={b("c2e").s - 4} />
      <Compass cx={ccx} cy={560} size={csize} o={compO} point={1} px={px} py={py} frost={cold * (1 - prog(f, b("c2d").s + 20, 20))} heat={hot}
        pushes={[{label: "fear", dx: 0, dy: -1, o: prog(f, w("c2c", "terror"), 14) * (1 - prog(f, b("c2d").s, 12)), color: C.blue},
                 {label: "anger", dx: 1, dy: 1, o: prog(f, w("c2f", "warmed"), 14) * (1 - prog(f, b("c2g").s - 10, 10)), color: C.red}]} />
      <AbsoluteFill style={{background: "radial-gradient(ellipse 70% 40% at 50% 100%, rgba(224,102,30,0.55), rgba(224,102,30,0) 70%)", opacity: fire * (0.8 + 0.2 * Math.sin(f / 3))}} />
      <T x={1420} y={880} at={w("c2d", "temporary fit")} out={b("c2e").s - 4} size={40} font="fellI" w={700}>a temporary fit of mania</T>

      <AbsoluteFill style={{background: "radial-gradient(circle at 50% 46%, rgba(233,196,106,0.55), rgba(233,196,106,0) 30%)", opacity: life(f, w("c2e", "holy relic"), b("c2f").s - 4, 20, 14)}} />
      <Art name="reliquary" x={960} y={480} w={180} at={w("c2e", "holy relic")} out={b("c2f").s - 4} />
      <Note place="Reading Abbey" when="a relic said to be the hand of Saint James" at={w("c2e", "holy relic")} out={b("c2f").s - 4} />
      <T x={960} y={890} at={w("c2e", "miracle")} out={b("c2f").s - 4} size={42} font="sc" color={C.gold}>a miracle cure</T>

      <T x={960} y={70} at={b("c2f").s + 6} out={b("c2g").s - 4} size={44} font="sc" color={C.red}>anger: warms and dries</T>
      <T x={960} y={930} at={w("c2f", "A serious")} out={b("c2g").s - 4} size={40} font="fellI">a serious temper tantrum could kill outright</T>
      <Quote text={b("c2g").show ?? b("c2g").t} who={b("c2g").who!} s={b("c2g").s} e={b("c2g").e} out={b("c2h").s} y={360} />

      <Note place="Henry I of England" when="d. 1135" at={b("c2h").s} out={b("c2i").s} />
      <Art name="crown" x={960 + 220 * crownFall} y={420 + 160 * crownFall} w={520} rot={70 * crownFall} at={b("c2h").s + 4} out={b("c2i").s - 4} />
      <T x={960} y={700} at={w("c2h", "dispute")} out={b("c2h2").s} size={44} font="fellI">a quarrel with his daughter</T>
      <T x={760} y={900} at={b("c2h2").s} out={b("c2i").s - 4} size={44} font="fellI" color={C.blue}>“a chill in his bowels” — so some said</T>

      <Question text="Fear and anger came and went. What about strain that never lets up?" at={b("c2i").s} out={end - 14} y={470} size={56} />
    </AbsoluteFill>
  );
};
