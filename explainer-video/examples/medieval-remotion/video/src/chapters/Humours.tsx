import React from "react";
import {AbsoluteFill, Easing} from "remotion";
import {Art, kf, life, Note, prog, Question, Quote, Roundel, T, lerp} from "../kit";
import {Compass} from "../Compass";
import {C} from "../style";
import {useCh} from "./use";

const SIX = ["air", "food & drink", "sleep & waking", "exercise & rest", "holding in & letting out", "the passions"];
const SIX_WORDS = ["Air.", "Food and drink.", "Sleep and waking.", "Exercise and rest.", "What the body", "And the passions"];
const SIX_POS = [[330, 330], [270, 560], [330, 790], [1590, 330], [1650, 560], [1590, 790]];

export const Humours: React.FC = () => {
  const {f, b, w, end} = useCh("humours");
  const cx = 960, cy = 565, size = 600;

  // compass visibility: whole chapter until the regimen books, then back briefly for Martini? (no — keep it simple)
  const compO = life(f, b("c1b").s - 6, b("c1h").s + 6, 14, 18);
  const cornerAt = [w("c1b", "Blood"), w("c1b", "Yellow bile"), w("c1b", "black bile"), w("c1b", "Phlegm")];
  const corners = cornerAt.map((a) => prog(f, a, 16));
  const fills = cornerAt.map((a) => prog(f, a + 6, 30));
  const axes = prog(f, b("c1c").s, 30);
  const quals = prog(f, w("c1c", "Blood was"), 20);
  const point = prog(f, w("c1d", "Picture"), 16);

  // the point wanders while the six forces appear, then trembles at "the passions"
  const sixAt = SIX_WORDS.map((p) => w("c1f", p));
  const nudges: [number, number][] = [[0.18, 0.08], [-0.15, 0.12], [0.1, -0.2], [-0.12, -0.08], [0.16, 0.05], [0.0, 0.0]];
  let px = 0, py = 0;
  sixAt.forEach((a, i) => {
    const t = prog(f, a, 12) * (1 - prog(f, a + 20, 18));
    px += nudges[i][0] * t; py += nudges[i][1] * t;
  });
  px += 0.04 * Math.sin(f / 23) * point;
  py += 0.04 * Math.cos(f / 29) * point;
  const passions = prog(f, w("c1g", "Feelings"), 14);

  // Arnold von Bamberg: emotions knock over eating, exercise, sleep
  const j = b("c1j");
  const hit = (i: number) => prog(f, w("c1j", ["your eating", "your exercise", "your sleep"][i]), 14, Easing.in(Easing.quad));

  return (
    <AbsoluteFill>
      <T x={960} y={110} at={b("c1a").s} out={b("c1b").s + 30} size={54} font="fellI">How did a medieval doctor think the body worked?</T>
      <T x={960} y={70} at={b("c1b").s + 30} out={b("c1h").s} size={38} font="sc" color={C.inkSoft}>the four humours</T>

      <Compass cx={cx} cy={cy} size={size} o={compO} axes={axes} corners={corners} fills={fills} showQualities={quals}
        point={point} px={px} py={py} you={point} ring={prog(f, w("c1d", "here in the middle"), 18)} tremble={passions * 0.8} />

      {/* the six non-naturals */}
      <T x={960} y={950} at={w("c1e", "Doctors listed")} out={b("c1h").s} size={36} font="sc" color={C.red}>the six non-naturals</T>
      {SIX.map((s, i) => (
        <Roundel key={s} label={s} x={SIX_POS[i][0]} y={SIX_POS[i][1]} at={sixAt[i]} out={b("c1h").s} r={92} size={i === 4 ? 22 : 27}
          glow={i === 5 ? passions : 0} color={i === 5 ? C.red : C.ink} />
      ))}

      {/* regimens */}
      <Art name="books" x={960} y={520} w={520} at={b("c1h").s + 6} out={b("c1i").s - 4} />
      <T x={960} y={840} at={w("c1h", "regimens")} out={b("c1i").s - 4} size={44} font="fellI">regimens: how-to books for a healthy life</T>
      <T x={960} y={920} at={w("c1h", "control your feelings")} out={b("c1i").s - 4} size={40} font="sc" color={C.red}>control your feelings</T>

      <Note place="Juan de Aviñón" when="physician, Seville · fourteenth century" at={b("c1i").s - 6} out={b("c1j").s} />
      <Quote text={b("c1i").show ?? b("c1i").t} who={b("c1i").who!} s={b("c1i").s} e={b("c1i").e} out={b("c1j").s} y={300} w={1500} size={50} />

      {/* dominoes */}
      <Note place="Arnold von Bamberg" when="physician, Bavaria" at={j.s} out={b("c1k").s} />
      <Roundel label="emotions" x={kf(f, [[j.s, 330], [w("c1j", "your eating"), 640]])} y={560} at={j.s + 4} out={b("c1k").s} r={92} color={C.red} glow={0.5} />
      {["eating", "exercise", "sleep"].map((s, i) => (
        <Roundel key={s} label={s} x={860 + i * 260 + 60 * hit(i)} y={560 + 70 * hit(i)} rot={80 * hit(i)} at={j.s + 8} out={b("c1k").s} r={92} />
      ))}
      <T x={1500} y={760} at={w("c1j", "And then")} out={b("c1k").s} size={44} font="fellI" w={600}>…then, the doctor.</T>

      {/* Martini */}
      <Note place="Niccolaio Martini" when="merchant, Italy · 1395" at={b("c1k").s} out={b("c1l").s} />
      <Art name="fever" x={700} y={560} w={600} at={w("c1k", "fell ill")} out={b("c1l").s} />
      <T x={1380} y={430} at={w("c1k", "very upset")} out={b("c1l").s} size={46} font="sc" color={C.red} w={600}>an election result</T>
      <T x={1380} y={520} at={w("c1k", "very upset") + 8} out={b("c1l").s} size={60} w={600}>↓</T>
      <T x={1380} y={610} at={w("c1k", "very upset") + 16} out={b("c1l").s} size={46} font="fellI" w={600}>“very upset”</T>
      <T x={1380} y={700} at={w("c1k", "very upset") + 24} out={b("c1l").s} size={60} w={600}>↓</T>
      <T x={1380} y={790} at={w("c1k", "very upset") + 32} out={b("c1l").s} size={46} font="sc" w={600}>a high fever</T>
      <Question text="So which feelings were the most dangerous?" at={b("c1l").s} out={end - 14} y={480} />
    </AbsoluteFill>
  );
};
