import React from "react";
import {AbsoluteFill} from "remotion";
import {Art, life, Note, prog, Quote, Stamp, T, lerp} from "../kit";
import {Cabinet} from "../Cabinet";
import {C, FRAKTUR, FELL_SC} from "../style";
import {useCh} from "./use";

export const Hook: React.FC = () => {
  const {f, b, w, end} = useCh("hook");
  const night = 1 - prog(f, 0, b("h2").s);
  const shake = f >= b("h4").s && f < b("h5").s ? Math.sin(f * 1.9) * 3 : 0;
  const titleAt = b("h11").s;
  return (
    <AbsoluteFill>
      {/* dawn over the village */}
      <AbsoluteFill style={{background: `linear-gradient(180deg, rgba(28,36,70,${0.75 * night}) 0%, rgba(80,60,90,${0.45 * night}) 60%, rgba(230,150,80,${0.25 * night}) 100%)`, mixBlendMode: "multiply"}} />
      <Art name="village" x={960} y={560} w={1180} at={8} out={b("h3").s - 6} drift={-40} len={40} />
      <Note place="Cheshunt, Hertfordshire" when="late twelfth century" at={b("h1").s + 30} out={b("h3").s - 6} />

      {/* no transformed wrapper here: it would isolate the multiply blend and show the paper as white */}
      <Art name="sailor" x={900 + shake} y={580} w={1240} at={b("h3").s} out={b("h6").s} len={30} />
      <Art name="demon" x={1610} y={300} w={240} at={w("h5", "A demon")} out={w("h5", "Afterwards")} rot={8} />
      <T x={1600} y={480} at={w("h5", "A demon")} out={w("h5", "Afterwards")} size={46} color={C.red} font="sc" w={400}>possessed</T>
      <T x={960} y={110} at={w("h5", "Afterwards")} out={b("h6").s} size={40} font="fellI" color={C.inkSoft}>…he lived devoutly for some years, and made a good and peaceful end.</T>

      {/* Hugh */}
      <T x={960} y={300} at={b("h6").s + 4} out={b("h7").s - 4} size={92} font="fraktur">Hugh of Lincoln</T>
      <T x={960} y={430} at={b("h6").s + 16} out={b("h7").s - 4} size={34} font="sc" color={C.red}>bishop · future saint</T>
      {["healing", "courage", "compassion"].map((v, i) => (
        <T key={v} x={620 + i * 340} y={560} at={w("h6", ["healing", "courage", "compassion"][i])} out={b("h7").s - 4} size={44} font="fellI">{v}</T>
      ))}
      <T x={960} y={700} at={w("h6", "Because")} out={b("h7").s - 4} size={38} font="fell" color={C.inkSoft}>…while the local bishop fled.</T>
      <Quote text={b("h7").show ?? b("h7").t} who={b("h7").who!} s={b("h7").s} e={b("h7").e} out={b("h8").s} y={360} />

      {/* the stereotype */}
      {(["FEAR", "CRUELTY", "SUPERSTITION"] as const).map((t, i) => {
        const at = w("h8", ["Fear", "Cruelty", "Superstition"][i]);
        return <Stamp key={t} text={t} x={[560, 980, 1390][i]} y={[420, 540, 420][i]} rot={[-8, 4, -3][i]} at={at} out={b("h9").s + 10} size={[70, 64, 60][i]} />;
      })}
      <T x={960} y={720} at={w("h8", "And medicine")} out={b("h9").s + 10} size={42} font="fellI" color={C.inkSoft}>…and medicine that seemed useless.</T>
      {/* cracks across the stamps as the picture changes */}
      <svg width={1920} height={1080} style={{position: "absolute", opacity: life(f, b("h9").s - 4, b("h9").s + 14, 6, 10)}}>
        <path d="M 300 300 L 700 520 L 920 460 L 1300 620 L 1650 380" stroke={C.ink} strokeWidth={4} fill="none" strokeDasharray={2000} strokeDashoffset={2000 * (1 - prog(f, b("h9").s - 4, 10))} />
      </svg>

      {/* Harvey and the health books */}
      <Note place="Katherine Harvey" when="historian of the Middle Ages" at={b("h9").s + 10} out={b("h10").s} />
      <Art name="reliquary" x={760} y={540} w={150} at={w("h9", "stories of saints")} out={w("h9", "opened medieval books")} opacity={0.9} />
      <Art name="demon" x={1160} y={540} w={230} at={w("h9", "stories of saints") + 8} out={w("h9", "opened medieval books")} opacity={0.9} />
      <T x={960} y={860} at={w("h9", "stories of saints")} out={w("h9", "opened medieval books")} size={40} font="fellI">saints' lives and miracle stories…</T>
      <Art name="happybook" x={960} y={500} w={720} at={w("h9", "opened medieval books")} out={b("h10").s} />
      <T x={960} y={860} at={w("h9", "Their medical")} out={b("h10").s} size={40} font="fellI">“a healthy mind at the heart of a healthy life”</T>

      {/* worries and prescriptions */}
      <Art name="merchant" x={960} y={500} w={460} at={b("h10").s} out={w("h10", "And their doctors")} />
      {[
        {n: "walker", word: "walks", x: 330},
        {n: "rose", word: "gardens", x: 650},
        {n: "cat", word: "pets", x: 960},
        {n: "friends", word: "friends,", x: 1270},
        {n: "lute", word: "music", x: 1590},
      ].map((it) => (
        <React.Fragment key={it.n}>
          <Art name={it.n} x={it.x} y={500} w={250} at={w("h10", it.word)} out={titleAt} />
          <T x={it.x} y={680} at={w("h10", it.word) + 4} out={titleAt} size={40} font="sc" color={C.green} w={300}>{it.word.replace(",", "")}</T>
        </React.Fragment>
      ))}

      {/* title + empty cabinet */}
      <Cabinet cx={960} cy={630} w={880} filled={0} o={life(f, titleAt, end - 18, 22, 18)} doors={1 - prog(f, titleAt + 30, 40)} />
      <div style={{position: "absolute", top: 70, width: 1920, textAlign: "center", opacity: life(f, titleAt + 6, end - 18, 22, 18)}}>
        <div style={{fontFamily: FRAKTUR, fontSize: 104, color: C.ink, lineHeight: 1}}>The Curio Cabinet</div>
        <div style={{fontFamily: FELL_SC, fontSize: 42, color: C.red, letterSpacing: 6, marginTop: 14, transform: `scale(${lerp(0.96, 1, prog(f, titleAt + 10, 30))})`}}>of medieval mental health</div>
      </div>
    </AbsoluteFill>
  );
};
