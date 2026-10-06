import React from "react";
import {AbsoluteFill} from "remotion";
import {Art, Items, life, prog, Roundel, T, lerp} from "../kit";
import {Cabinet} from "../Cabinet";
import {Compass} from "../Compass";
import {BowSvg} from "./Bow";
import {C, FELL, FELL_SC, FRAKTUR} from "../style";
import {useCh} from "./use";

const Strike: React.FC<{x: number; y: number; w: number; p: number}> = ({x, y, w, p}) => (
  <svg width={1920} height={1080} style={{position: "absolute"}}>
    <line x1={x - w / 2} y1={y - w / 3} x2={x - w / 2 + w * p} y2={y - w / 3 + (w * 2 / 3) * p} stroke={C.red} strokeWidth={10} strokeLinecap="round" opacity={0.85} />
    <line x1={x + w / 2} y1={y - w / 3} x2={x + w / 2 - w * p} y2={y - w / 3 + (w * 2 / 3) * p} stroke={C.red} strokeWidth={10} strokeLinecap="round" opacity={0.85} />
  </svg>
);

export const Lessons: React.FC = () => {
  const {f, b, w, end} = useCh("lessons");
  const keepO = (id: string, nextId: string) => life(f, b(id).s, b(nextId).s, 14, 14);
  const final = b("c10i");
  const cabO = life(f, final.s + 6, end - 4, 24, 4);
  const doors = prog(f, final.e + 20, 50);
  return (
    <AbsoluteFill>
      <T x={960} y={220} at={b("c10a").s} out={b("c10b").s - 4} size={56} font="fellI" w={1500}>six centuries later…</T>
      <Items x={560} y={380} size={46} out={b("c10b").s - 4} w={900} items={[
        {text: "millions of lives touched", at: w("c10a", "millions")},
        {text: "hundreds of thousands lost", at: w("c10a", "hundreds of thousands")},
        {text: "strained health services and economies", at: w("c10a", "It strains")},
      ]} />
      <T x={960} y={300} at={b("c10b").s} out={b("c10c").s - 4} size={52} font="fellI" w={1500}>everyone affected deserves the best possible care</T>
      <T x={960} y={420} at={w("c10b", "costs too much")} out={b("c10c").s - 4} size={42} font="sc" color={C.red} w={1500}>but for many, it costs too much</T>
      <T x={960} y={520} at={w("c10b", "some critics")} out={b("c10c").s - 4} size={40} font="fellI" color={C.inkSoft} w={1500}>and some critics question our reliance on psychiatric drugs and diagnostic labels</T>

      <T x={960} y={140} at={b("c10c").s} out={b("c10d").s - 4} size={52} font="fellI" w={1500}>what not to revive</T>
      {[
        {n: "demon", x: 520, word: "exorcism", label: "exorcism"},
        {n: "saffron", x: 960, word: "saffron overdoses", label: "saffron overdoses"},
        {n: "ostrich", x: 1400, word: "ostrich liver", label: "ostrich liver"},
      ].map((it) => (
        <React.Fragment key={it.n}>
          <Art name={it.n} x={it.x} y={520} w={260} at={w("c10c", it.word) - 6} out={b("c10d").s - 4} />
          <T x={it.x} y={740} at={w("c10c", it.word)} out={b("c10d").s - 4} size={36} font="sc" w={420}>{it.label}</T>
          {f >= w("c10c", it.word) + 12 && f < b("c10d").s - 4 && <Strike x={it.x} y={560} w={240} p={prog(f, w("c10c", it.word) + 12, 10)} />}
        </React.Fragment>
      ))}

      <T x={960} y={440} at={b("c10d").s} out={b("c10e").s - 4} size={64} font="fellI" w={1500}>three things worth keeping</T>

      <div style={{position: "absolute", left: 140, top: 140, opacity: keepO("c10e", "c10f"), fontFamily: FRAKTUR, fontSize: 120, color: C.red}}>I</div>
      <BowSvg cx={700} cy={560} h={640} bend={lerp(0.85, 0, prog(f, b("c10e").s + 6, 40))} draw={1} crack={0} o={keepO("c10e", "c10f")} shake={0} />
      <T x={1300} y={380} at={b("c10e").s} out={b("c10f").s - 4} size={70} font="sc" color={C.green} w={800}>prevention</T>
      <T x={1300} y={490} at={w("c10e", "build the friendships")} out={b("c10f").s - 4} size={42} font="fellI" w={800}>friendships and habits that keep us resilient, for people and for societies</T>

      <div style={{position: "absolute", left: 140, top: 140, opacity: keepO("c10f", "c10g"), fontFamily: FRAKTUR, fontSize: 120, color: C.red}}>II</div>
      <Compass cx={700} cy={560} size={460} o={keepO("c10f", "c10g")} point={1} px={0.04 * Math.sin(f / 20)} py={0.04 * Math.cos(f / 25)} ring={1} showQualities={0} />
      <T x={1350} y={380} at={b("c10f").s} out={b("c10g").s - 4} size={70} font="sc" color={C.green} w={800}>see it whole</T>
      <T x={1350} y={490} at={w("c10f", "part of a healthy life")} out={b("c10g").s - 4} size={42} font="fellI" w={800}>part of a healthy life, like food and sleep</T>

      <div style={{position: "absolute", left: 140, top: 140, opacity: life(f, b("c10g").s, final.s, 14, 14), fontFamily: FRAKTUR, fontSize: 120, color: C.red}}>III</div>
      <T x={960} y={190} at={w("c10g", "Anxiety")} out={final.s - 4} size={64} font="sc" color={C.green} w={1500}>not a modern fad</T>
      {[
        {n: "merchant", x: 480, word: "A merchant", label: "Francesco Datini"},
        {n: "crown", x: 960, word: "A king", label: "King Duarte"},
        {n: "monk", x: 1440, word: "An old monk", label: "Matthew of Rievaulx"},
      ].map((it) => (
        <React.Fragment key={it.n}>
          <Art name={it.n} x={it.x} y={560} w={it.n === "crown" ? 330 : 300} at={w("c10h", it.word)} out={final.s - 10} outLen={12} />
          <T x={it.x} y={780} at={w("c10h", it.word) + 6} out={final.s - 4} size={36} font="sc" w={460}>{it.label}</T>
        </React.Fragment>
      ))}

      <Cabinet cx={960} cy={480} w={1000} filled={9} arriving={{slot: 9, at: final.s + 10}} o={cabO} doors={doors} />
      <T x={960} y={850} at={w("c10i", "with a walk")} out={end - 6} size={48} font="fellI" w={1500}>a walk · a song · a garden · a friend</T>
    </AbsoluteFill>
  );
};

export const Credits: React.FC = () => {
  const {f, end} = useCh("credits");
  const o = life(f, 6, end - 30, 30, 30);
  return (
    <AbsoluteFill style={{alignItems: "center", justifyContent: "center", opacity: o, textAlign: "center", color: C.ink}}>
      <div style={{fontFamily: FRAKTUR, fontSize: 80}}>The Curio Cabinet</div>
      <div style={{fontFamily: FELL_SC, fontSize: 32, color: C.red, letterSpacing: 5, marginTop: 6}}>of medieval mental health</div>
      <div style={{fontFamily: FELL, fontSize: 30, marginTop: 50, lineHeight: 1.5, maxWidth: 1400}}>
        Based on “Medieval mental health” by Katherine Harvey, <i>Aeon</i> (edited by Sam Haselby)<br />
        Miniatures: Codex Manesse (c. 1300–40), Heidelberg University Library, via Wikimedia Commons (public domain)<br />
        Illustrations generated with Gemini · narration voiced with Gemini text-to-speech
      </div>
      <div style={{marginTop: 54, padding: "22px 40px", border: `2px solid ${C.green}`, fontFamily: FELL, fontSize: 30, maxWidth: 1300, lineHeight: 1.45}}>
        If you are struggling, please talk to someone you trust, a doctor, or a local crisis line.<br />
        Don't stop prescribed medication without talking to your doctor.
      </div>
    </AbsoluteFill>
  );
};
